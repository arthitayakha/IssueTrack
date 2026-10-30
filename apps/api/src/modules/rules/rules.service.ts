import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, FindOptionsWhere, LessThanOrEqual, Like, MoreThanOrEqual, Repository } from "typeorm";
import type {
  RuleActivityDto,
  RuleCondition as RuleConditionDto,
  RuleDto,
  RuleOperator,
} from "@kanban/shared";
import { normalizePagination, type Paginated } from "../../common/pagination";
import { Rule, type RuleConditionEntry } from "./entities/rule.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import type { ActorInfo } from "../activity-logs/activity-logs.service";
import { NotificationsService } from "../notifications/notifications.service";

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
  private readonly logger = new Logger(RulesService.name);

  constructor(
    @InjectRepository(Rule)
    private readonly rules: Repository<Rule>,
    @InjectRepository(ActivityLog)
    private readonly activityLogs: Repository<ActivityLog>,
    private readonly notifications: NotificationsService,
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
    const rules = await this.rules.find({ order: { createdAt: "DESC" } });
    return rules.map((rule) => this.toDto(rule));
  }

  async findOne(id: number): Promise<RuleDto> {
    const rule = await this.rules.findOne({ where: { id } });
    if (!rule) throw new NotFoundException(`Rule ${id} not found`);
    return this.toDto(rule);
  }

  /**
   * The wizard's condition rows, normalised for the JSONB column — the full
   * set is stored on the rule itself (no separate table since migration 0036).
   */
  private buildConditions(input: RuleInput): RuleConditionEntry[] {
    return (input.conditions ?? []).map((c, index) => ({
      field: c.field ?? "",
      operator: c.operator ?? "=",
      value: c.value ?? null,
      position: c.position ?? index,
    }));
  }

  /**
   * Audit trail for the history page — who created/edited/deleted a rule.
   * Written to the shared `activity_logs` table (`rule.*` actions) and never
   * allowed to break the CRUD call itself.
   */
  private async logRuleAction(
    action: "rule.created" | "rule.updated" | "rule.deleted",
    ruleId: number,
    ruleName: string,
    actor: ActorInfo,
  ): Promise<void> {
    try {
      await this.activityLogs.save(
        this.activityLogs.create({
          action,
          entityId: ruleId,
          detail: JSON.stringify({ ruleName }),
          // only the id is stored — name/role come off `users` at read time
          actorId: actor.actorId,
        }),
      );
    } catch (err) {
      this.logger.warn(`could not record ${action} for rule ${ruleId}: ${String(err)}`);
    }
  }

  /**
   * Board-wide heads-up for automation changes — every active admin sees who
   * created/edited/deleted a rule. Deep-links to the wizard edit page.
   * Best-effort: wrapped in try/catch so a notification bug never breaks the
   * CRUD call.
   */
  private async notifyRuleChange(
    action: "rule_created" | "rule_updated" | "rule_deleted",
    ruleId: number,
    ruleName: string,
    actor: ActorInfo,
  ): Promise<void> {
    try {
      await this.notifications.notifyAdmins({
        action,
        title: ruleName,
        link: `/automation/${ruleId}`,
        actor: { actorId: actor.actorId },
      });
    } catch (err) {
      this.logger.warn(`could not send ${action} notification for rule ${ruleId}: ${String(err)}`);
    }
  }

  async create(input: RuleInput, actor: ActorInfo): Promise<RuleDto> {
    if (!input.triggerKey?.trim()) throw new BadRequestException("triggerKey is required");
    if (!input.actionKey?.trim()) throw new BadRequestException("actionKey is required");

    const rule = this.rules.create({
      name: (input.name?.trim() || "Untitled rule").slice(0, 150),
      triggerKey: input.triggerKey.trim(),
      templateKey: input.templateKey ?? null,
      category: input.category ?? null,
      actionKey: input.actionKey.trim(),
      actionConfig: input.actionConfig ?? {},
      conditions: this.buildConditions(input),
      isActive: input.isActive ?? true,
      stopOnError: input.stopOnError ?? false,
      createdBy: actor.actorId,
    });
    const saved = await this.rules.save(rule);
    await this.logRuleAction("rule.created", saved.id, saved.name, actor);
    await this.notifyRuleChange("rule_created", saved.id, saved.name, actor);
    return this.findOne(saved.id);
  }

  async update(id: number, input: RuleInput, actor: ActorInfo): Promise<RuleDto> {
    const existing = await this.rules.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`Rule ${id} not found`);
    if (input.triggerKey !== undefined && !input.triggerKey.trim()) {
      throw new BadRequestException("triggerKey is required");
    }
    if (input.actionKey !== undefined && !input.actionKey.trim()) {
      throw new BadRequestException("actionKey is required");
    }

    existing.name = (input.name ?? existing.name).slice(0, 150);
    existing.triggerKey = input.triggerKey?.trim() ?? existing.triggerKey;
    existing.templateKey = input.templateKey !== undefined ? input.templateKey : existing.templateKey;
    existing.category = input.category !== undefined ? input.category : existing.category;
    existing.actionKey = input.actionKey?.trim() ?? existing.actionKey;
    existing.actionConfig = input.actionConfig ?? existing.actionConfig;
    // conditions are replaced wholesale — the wizard always sends the full set
    if (input.conditions !== undefined) existing.conditions = this.buildConditions(input);
    existing.isActive = input.isActive ?? existing.isActive;
    existing.stopOnError = input.stopOnError ?? existing.stopOnError;
    await this.rules.save(existing);

    await this.logRuleAction("rule.updated", id, existing.name, actor);
    await this.notifyRuleChange("rule_updated", id, existing.name, actor);
    return this.findOne(id);
  }

  async toggle(id: number, isActive: boolean, actor: ActorInfo): Promise<RuleDto> {
    const existing = await this.rules.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`Rule ${id} not found`);
    await this.rules.update(id, { isActive });
    await this.logRuleAction("rule.updated", id, existing.name, actor);
    await this.notifyRuleChange("rule_updated", id, existing.name, actor);
    return this.findOne(id);
  }

  async remove(id: number, actor: ActorInfo): Promise<{ deleted: boolean }> {
    // capture the name first — the row is gone after the delete
    const existing = await this.rules.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`Rule ${id} not found`);
    const result = await this.rules.delete(id); // conditions live on the row itself
    if (!result.affected) throw new NotFoundException(`Rule ${id} not found`);
    await this.logRuleAction("rule.deleted", id, existing.name, actor);
    // same admin fan-out as create/update — a missing rule is board news too
    await this.notifyRuleChange("rule_deleted", id, existing.name, actor);
    return { deleted: true };
  }

  /**
   * Rule audit trail for /automation/runs and the reports page — who
   * created/edited/deleted a rule, newest first, optionally filtered to one
   * rule and/or a date range (createdFrom/createdTo, yyyy-mm-dd). Reads the
   * shared `activity_logs` table; only `rule.*` rows (card activity lives
   * there too).
   */
  async findActivity(query: {
    ruleId?: string;
    page?: string;
    limit?: string;
    createdFrom?: string;
    createdTo?: string;
  }): Promise<Paginated<RuleActivityDto>> {
    const params = normalizePagination(query);
    const ruleId = Number(query.ruleId);
    const where: FindOptionsWhere<ActivityLog> = { action: Like("rule.%") };
    if (query.ruleId !== undefined && Number.isFinite(ruleId)) where.entityId = ruleId;

    const dayStart = (v?: string): Date | null => {
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
      const d = new Date(`${v}T00:00:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const dayEnd = (v?: string): Date | null => {
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
      const d = new Date(`${v}T23:59:59.999`);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const from = dayStart(query.createdFrom);
    const to = dayEnd(query.createdTo);
    if (from && to) where.createdAt = Between(from, to);
    else if (from) where.createdAt = MoreThanOrEqual(from);
    else if (to) where.createdAt = LessThanOrEqual(to);

    const [rows, total] = await this.activityLogs.findAndCount({
      where,
      order: { createdAt: "DESC", id: "DESC" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      // name/role are read off `users` (+`roles`) — nothing is stored per row
      relations: ["actor", "actor.role"],
    });

    const data: RuleActivityDto[] = rows.map((log) => {
      let ruleName: string | null = null;
      try {
        const parsed = JSON.parse(log.detail ?? "{}") as { ruleName?: string };
        ruleName = parsed.ruleName ?? null;
      } catch {
        // detail is free text — leave the name empty
      }
      return {
        id: log.id,
        action: log.action,
        ruleId: log.entityId,
        ruleName,
        actorName: log.actor?.name ?? null,
        actorRole: log.actor?.role?.name ?? null,
        createdAt: new Date(log.createdAt).toISOString(),
      };
    });

    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
  }
}
