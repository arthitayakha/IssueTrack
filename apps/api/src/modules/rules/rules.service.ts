import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { RuleCondition as RuleConditionDto, RuleDto, RuleOperator, RuleRunDto } from "@kanban/shared";
import { normalizePagination, type Paginated } from "../../common/pagination";
import { Rule } from "./entities/rule.entity";
import { RuleCondition } from "./entities/rule-condition.entity";
import { RuleRun } from "./entities/rule-run.entity";

/** Shape of the body the wizard sends (create and update share it). */
export interface RuleInput {
  name?: string;
  triggerKey?: string;
  templateKey?: string | null;
  category?: string;
  actionKey?: string;
  actionConfig?: Record<string, unknown>;
  conditions?: Array<{ field?: string; operator?: string; value?: string; position?: number }>;
  isActive?: boolean;
  stopOnError?: boolean;
}

@Injectable()
export class RulesService {
  constructor(
    @InjectRepository(Rule)
    private readonly rules: Repository<Rule>,
    @InjectRepository(RuleCondition)
    private readonly conditions: Repository<RuleCondition>,
    @InjectRepository(RuleRun)
    private readonly runs: Repository<RuleRun>,
  ) {}

  private toDto(rule: Rule): RuleDto {
    const conditions: RuleConditionDto[] = [...(rule.conditions ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        field: c.field,
        operator: (c.operator ?? "=") as RuleOperator,
        value: c.value,
        position: c.position,
      }));
    return {
      id: rule.id,
      name: rule.name,
      triggerKey: rule.triggerKey,
      templateKey: rule.templateKey,
      category: rule.category ?? "",
      actionKey: rule.actionKey,
      actionConfig: (rule.actionConfig ?? {}) as Record<string, unknown>,
      conditions,
      isActive: rule.isActive,
      stopOnError: rule.stopOnError,
      createdBy: rule.createdBy,
      createdAt: new Date(rule.createdAt).toISOString(),
      updatedAt: new Date(rule.updatedAt).toISOString(),
    };
  }

  async findAll(): Promise<RuleDto[]> {
    const rules = await this.rules.find({
      relations: { conditions: true },
      order: { createdAt: "DESC" },
    });
    return rules.map((rule) => this.toDto(rule));
  }

  async findOne(id: number): Promise<RuleDto> {
    const rule = await this.rules.findOne({ where: { id }, relations: { conditions: true } });
    if (!rule) throw new NotFoundException(`Rule ${id} not found`);
    return this.toDto(rule);
  }

  private buildConditionRows(
    ruleId: number,
    input: RuleInput,
  ): Partial<RuleCondition>[] {
    return (input.conditions ?? []).map((c, index) => ({
      ruleId,
      field: c.field ?? "",
      operator: c.operator ?? "=",
      value: c.value ?? null,
      valueType: "text",
      conditionGroup: "AND",
      position: c.position ?? index,
    }));
  }

  async create(input: RuleInput, userId: number): Promise<RuleDto> {
    if (!input.triggerKey?.trim()) throw new BadRequestException("triggerKey is required");
    if (!input.actionKey?.trim()) throw new BadRequestException("actionKey is required");

    const rule = this.rules.create({
      name: (input.name?.trim() || "Untitled rule").slice(0, 150),
      triggerKey: input.triggerKey.trim(),
      templateKey: input.templateKey ?? null,
      category: input.category ?? null,
      actionKey: input.actionKey.trim(),
      actionConfig: input.actionConfig ?? {},
      conditionGroup: "AND",
      isActive: input.isActive ?? true,
      stopOnError: input.stopOnError ?? false,
      createdBy: userId,
      conditions: this.buildConditionRows(0, input) as never,
    });
    const saved = await this.rules.save(rule);
    return this.findOne(saved.id);
  }

  async update(id: number, input: RuleInput): Promise<RuleDto> {
    const existing = await this.rules.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`Rule ${id} not found`);
    if (input.triggerKey !== undefined && !input.triggerKey.trim()) {
      throw new BadRequestException("triggerKey is required");
    }
    if (input.actionKey !== undefined && !input.actionKey.trim()) {
      throw new BadRequestException("actionKey is required");
    }

    await this.rules.manager.transaction(async (em) => {
      existing.name = (input.name ?? existing.name).slice(0, 150);
      existing.triggerKey = input.triggerKey?.trim() ?? existing.triggerKey;
      existing.templateKey = input.templateKey !== undefined ? input.templateKey : existing.templateKey;
      existing.category = input.category !== undefined ? input.category : existing.category;
      existing.actionKey = input.actionKey?.trim() ?? existing.actionKey;
      existing.actionConfig = input.actionConfig ?? existing.actionConfig;
      existing.conditionGroup = "AND";
      existing.isActive = input.isActive ?? existing.isActive;
      existing.stopOnError = input.stopOnError ?? existing.stopOnError;
      await em.save(Rule, existing);

      // conditions are replaced wholesale — the wizard always sends the full set
      if (input.conditions !== undefined) {
        await em.delete(RuleCondition, { ruleId: id });
        const rows = this.buildConditionRows(id, input);
        if (rows.length > 0) await em.save(RuleCondition, rows);
      }
    });

    return this.findOne(id);
  }

  async toggle(id: number, isActive: boolean): Promise<RuleDto> {
    const existing = await this.rules.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`Rule ${id} not found`);
    await this.rules.update(id, { isActive });
    return this.findOne(id);
  }

  async remove(id: number): Promise<{ deleted: boolean }> {
    const result = await this.rules.delete(id); // rule_conditions drop via FK CASCADE
    if (!result.affected) throw new NotFoundException(`Rule ${id} not found`);
    return { deleted: true };
  }

  /** Run history — newest first, optionally filtered to one rule. */
  async findRuns(query: {
    ruleId?: string;
    page?: string;
    limit?: string;
  }): Promise<Paginated<RuleRunDto>> {
    const params = normalizePagination(query);
    const ruleId = Number(query.ruleId);
    const where: { ruleId?: number } =
      query.ruleId !== undefined && Number.isFinite(ruleId) ? { ruleId } : {};

    const [rows, total] = await this.runs.findAndCount({
      where,
      relations: { issue: true },
      order: { createdAt: "DESC", id: "DESC" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });

    const data: RuleRunDto[] = rows.map((run) => ({
      id: run.id,
      ruleId: run.ruleId,
      ruleName: run.ruleName,
      triggerKey: run.triggerKey,
      issueId: run.issueId,
      issueTitle: run.issue?.title ?? null,
      status: run.status,
      actionKey: run.actionKey,
      detail: run.detail,
      durationMs: run.durationMs,
      createdAt: new Date(run.createdAt).toISOString(),
    }));

    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
  }
}
