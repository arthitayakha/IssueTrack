import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { getTriggerByKey, type RuleContext, type RuleOperator } from "@kanban/shared";
import { Issue } from "../issues/entities/issue.entity";
import { Rule } from "./entities/rule.entity";

/** Triggers the engine listens for in phase 1 (hooks live in IssuesService). */
export type EngineTrigger =
  | "issue.created"
  | "issue.title_changed"
  | "issue.description_changed"
  | "issue.priority_changed"
  | "issue.category_changed"
  | "issue.moved"
  | "issue.assigned";

/**
 * Runs automation rules when a hook fires.
 *
 * Phase 1 executes `issue.set_priority` and `issue.set_category`; every other
 * action is skipped with a log line until a later phase. Actions apply their
 * changes straight through the Issue repository, so a rule-driven write never
 * re-enters the hooks (the `running` counter is a second line of defence).
 * A failing rule must never break the caller's request.
 */
@Injectable()
export class RulesEngineService {
  private readonly logger = new Logger(RulesEngineService.name);
  /** > 0 while actions are running — nested hook calls are ignored. */
  private running = 0;

  constructor(
    @InjectRepository(Rule)
    private readonly rules: Repository<Rule>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
  ) {}

  async evaluate(triggerKey: EngineTrigger, ctx: RuleContext): Promise<void> {
    try {
      if (this.running > 0) return;
      const active = await this.rules.find({
        where: { triggerKey, isActive: true },
        relations: { conditions: true },
        order: { createdAt: "ASC" },
      });
      if (active.length === 0) return;

      this.running++;
      try {
        for (const rule of active) {
          try {
            if (!this.conditionsPass(rule, triggerKey, ctx)) continue;
            await this.runAction(rule, ctx);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn(`rule #${rule.id} "${rule.name}" failed: ${message}`);
            if (rule.stopOnError) break;
          }
        }
      } finally {
        this.running--;
      }
    } catch (err) {
      // evaluating rules must never break the request that triggered it
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`rule evaluation failed for ${triggerKey}: ${message}`);
    }
  }

  /** All conditions are AND-combined (the wizard has no OR UI yet). */
  private conditionsPass(rule: Rule, triggerKey: string, ctx: RuleContext): boolean {
    const conditions = [...(rule.conditions ?? [])].sort((a, b) => a.position - b.position);
    if (conditions.length === 0) return true;

    const trigger = getTriggerByKey(triggerKey);
    for (const condition of conditions) {
      const fieldDef = trigger?.fields.find((f) => f.key === condition.field);
      const actual = fieldDef ? ctx[fieldDef.contextKey] : undefined;
      const ok = this.compare(condition.operator as RuleOperator, condition.value, actual);
      if (!ok) return false;
    }
    return true;
  }

  private compare(operator: RuleOperator, expected: string | null, actual: unknown): boolean {
    const value = actual == null ? "" : String(actual);
    const target = expected == null ? "" : String(expected);
    switch (operator) {
      case "=":
        return value === target;
      case "!=":
        return value !== target;
      case "in":
        return splitList(target).includes(value);
      case "not_in":
        return !splitList(target).includes(value);
      case "contains":
        return value.includes(target);
      case "not_contains":
        return !value.includes(target);
      case "is_empty":
        return value === "";
      case "is_not_empty":
        return value !== "";
      case ">":
      case ">=":
      case "<":
      case "<=": {
        const a = Number(value);
        const b = Number(target);
        if (Number.isNaN(a) || Number.isNaN(b)) return false;
        if (operator === ">") return a > b;
        if (operator === ">=") return a >= b;
        if (operator === "<") return a < b;
        return a <= b;
      }
      default:
        return false;
    }
  }

  private async runAction(rule: Rule, ctx: RuleContext): Promise<void> {
    const issueId = Number(ctx.issueId);
    if (!Number.isFinite(issueId) || issueId <= 0) return;
    const config = (rule.actionConfig ?? {}) as Record<string, unknown>;

    switch (rule.actionKey) {
      case "issue.set_priority": {
        const priorityId = Number(config.priority);
        if (!Number.isFinite(priorityId)) return;
        await this.issues.update(issueId, { priorityId });
        this.logger.log(`rule "${rule.name}": set priority ${priorityId} on #${issueId}`);
        return;
      }
      case "issue.set_category": {
        const categoryId = Number(config.category);
        if (!Number.isFinite(categoryId)) return;
        await this.issues.update(issueId, { categoryId });
        this.logger.log(`rule "${rule.name}": set category ${categoryId} on #${issueId}`);
        return;
      }
      default:
        this.logger.debug(
          `rule "${rule.name}": action ${rule.actionKey} not supported yet (engine phase 1)`,
        );
    }
  }
}

function splitList(target: string): string[] {
  return target
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}
