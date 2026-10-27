import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { getTriggerByKey, type RuleContext, type RuleOperator } from "@kanban/shared";
import { Issue } from "../issues/entities/issue.entity";
import { Comment } from "../comments/entities/comment.entity";
import { User } from "../auth/entities/user.entity";
import { Label } from "../labels/entities/label.entity";
import { Position } from "../positions/position.entity";
import { IssueStatus } from "../issue-statuses/entities/issue-status.entity";
import { IssuePriority } from "../issue-priorities/entities/issue-priority.entity";
import { Category } from "../categories/entities/category.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { Rule } from "./entities/rule.entity";
import { RuleRun, type RuleRunStatus } from "./entities/rule-run.entity";

/** Triggers the engine listens for — one per hook placed in the services. */
export type EngineTrigger =
  | "issue.created"
  | "issue.title_changed"
  | "issue.description_changed"
  | "issue.priority_changed"
  | "issue.category_changed"
  | "issue.moved"
  | "issue.assigned"
  | "issue.deleted"
  | "issue.restored"
  | "comment.created"
  | "attachment.created"
  | "work_session.started"
  | "work_session.stopped";

/** What an action did — `reason` explains a skip and is stored on the run. */
interface ActionResult {
  applied: boolean;
  reason?: string;
}

/**
 * Runs automation rules when a hook fires and records every execution in
 * `rule_runs` (only when the conditions pass, so the table stays readable).
 *
 * Phase 2 covers every card/content action; timer actions and
 * `issue.set_due_date` are skipped until their semantics are settled.
 * Actions write through repositories directly, so a rule-driven change never
 * re-enters the hooks; the `running` counter is a second line of defence. A
 * failing rule must never break the caller's request.
 */
@Injectable()
export class RulesEngineService {
  private readonly logger = new Logger(RulesEngineService.name);
  /** > 0 while actions are running — nested hook calls are ignored. */
  private running = 0;

  constructor(
    @InjectRepository(Rule) private readonly rules: Repository<Rule>,
    @InjectRepository(RuleRun) private readonly runs: Repository<RuleRun>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Label) private readonly labels: Repository<Label>,
    @InjectRepository(Position) private readonly positions: Repository<Position>,
    @InjectRepository(IssueStatus) private readonly statuses: Repository<IssueStatus>,
    @InjectRepository(IssuePriority) private readonly priorities: Repository<IssuePriority>,
    @InjectRepository(Category) private readonly categories: Repository<Category>,
    @InjectRepository(ActivityLog) private readonly activityLogs: Repository<ActivityLog>,
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
          // conditions that do not pass are not recorded — only real executions
          if (!this.conditionsPass(rule, triggerKey, ctx)) continue;

          const startedAt = Date.now();
          let status: RuleRunStatus;
          let detail: string | null = null;
          try {
            const result = await this.runAction(rule, triggerKey, ctx);
            status = result.applied ? "applied" : "skipped";
            detail = result.reason ?? null;
          } catch (err) {
            status = "failed";
            detail = err instanceof Error ? err.message : String(err);
            this.logger.warn(`rule #${rule.id} "${rule.name}" failed: ${detail}`);
          }

          await this.recordRun(rule, triggerKey, ctx, status, detail, Date.now() - startedAt);

          if (status === "failed" && rule.stopOnError) break;
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

  /** Store the execution; a failing insert must not break anything either. */
  private async recordRun(
    rule: Rule,
    triggerKey: string,
    ctx: RuleContext,
    status: RuleRunStatus,
    detail: string | null,
    durationMs: number,
  ): Promise<void> {
    try {
      const issueId = Number(ctx.issueId);
      await this.runs.save(
        this.runs.create({
          ruleId: rule.id,
          ruleName: rule.name.slice(0, 150),
          triggerKey,
          issueId: Number.isFinite(issueId) && issueId > 0 ? issueId : null,
          status,
          actionKey: rule.actionKey,
          detail,
          durationMs: Math.max(0, Math.round(durationMs)),
        }),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`could not record run for rule #${rule.id}: ${message}`);
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

  private async runAction(
    rule: Rule,
    triggerKey: EngineTrigger,
    ctx: RuleContext,
  ): Promise<ActionResult> {
    const issueId = Number(ctx.issueId);
    if (!Number.isFinite(issueId) || issueId <= 0) {
      return { applied: false, reason: "no issue in context" };
    }
    const config = (rule.actionConfig ?? {}) as Record<string, unknown>;
    const applied = (message: string): ActionResult => {
      this.logger.log(`rule "${rule.name}": ${message}`);
      return { applied: true };
    };

    switch (rule.actionKey) {
      case "issue.set_priority": {
        const priorityId = Number(config.priority);
        if (!Number.isFinite(priorityId)) return { applied: false, reason: "no priority configured" };
        await this.issues.update(issueId, { priorityId });
        return applied(`set priority ${priorityId} on #${issueId}`);
      }
      case "issue.set_category": {
        const categoryId = Number(config.category);
        if (!Number.isFinite(categoryId)) return { applied: false, reason: "no category configured" };
        await this.issues.update(issueId, { categoryId });
        return applied(`set category ${categoryId} on #${issueId}`);
      }
      case "issue.move_status": {
        const statusId = Number(config.targetStatus);
        if (!Number.isFinite(statusId)) return { applied: false, reason: "no target status configured" };
        const status = await this.statuses.findOne({ where: { id: statusId } });
        if (!status) return { applied: false, reason: `status ${statusId} not found` };
        await this.issues.update(issueId, { statusId });
        return applied(`moved #${issueId} to status "${status.name}"`);
      }
      case "issue.assign": {
        const positionId = Number(config.position);
        if (!Number.isFinite(positionId)) return { applied: false, reason: "no position configured" };
        const user = await this.users.findOne({
          where: { positionId, isActive: true },
          order: { id: "ASC" },
        });
        if (!user) {
          return { applied: false, reason: `no active user holds position ${positionId}` };
        }
        await this.issues.update(issueId, { programmerId: user.id });
        return applied(`assigned #${issueId} to ${user.name} (position ${positionId})`);
      }
      case "issue.unassign": {
        await this.issues.update(issueId, { programmerId: null });
        return applied(`unassigned #${issueId}`);
      }
      case "issue.add_label":
      case "issue.remove_label": {
        const labelId = Number(config.label);
        if (!Number.isFinite(labelId)) return { applied: false, reason: "no label configured" };
        const issue = await this.issues.findOne({ where: { id: issueId }, relations: ["labels"] });
        if (!issue) return { applied: false, reason: `issue ${issueId} not found` };
        const current = issue.labels ?? [];
        const has = current.some((l) => l.id === labelId);
        if (rule.actionKey === "issue.add_label") {
          if (has) return { applied: false, reason: "label already present" };
          const label = await this.labels.findOne({ where: { id: labelId } });
          if (!label) return { applied: false, reason: `label ${labelId} not found` };
          issue.labels = [...current, label];
          await this.issues.save(issue);
          // legacy single-label column still drives some board views
          if (issue.labelId == null) await this.issues.update(issueId, { labelId });
          return applied(`added label ${labelId} to #${issueId}`);
        }
        if (!has) return { applied: false, reason: "label not present" };
        issue.labels = current.filter((l) => l.id !== labelId);
        await this.issues.save(issue);
        if (issue.labelId === labelId) await this.issues.update(issueId, { labelId: null });
        return applied(`removed label ${labelId} from #${issueId}`);
      }
      case "issue.lock":
        await this.issues.update(issueId, { isLocked: true });
        return applied(`locked #${issueId}`);
      case "issue.unlock":
        await this.issues.update(issueId, { isLocked: false });
        return applied(`unlocked #${issueId}`);
      case "issue.delete": {
        const existing = await this.issues.findOne({ where: { id: issueId } });
        if (!existing) return { applied: false, reason: `issue ${issueId} not found` };
        if (existing.deletedAt) return { applied: false, reason: "already deleted" };
        await this.issues.update(issueId, { deletedAt: new Date(), deletedBy: null });
        return applied(`deleted #${issueId}`);
      }
      case "issue.restore": {
        const existing = await this.issues.findOne({ where: { id: issueId } });
        if (!existing?.deletedAt) return { applied: false, reason: "not in trash" };
        await this.issues.update(issueId, { deletedAt: null, deletedBy: null });
        return applied(`restored #${issueId}`);
      }
      case "issue.comment": {
        const text = typeof config.text === "string" ? config.text : "";
        if (!text.trim()) return { applied: false, reason: "no message configured" };
        const issue = await this.issues.findOne({ where: { id: issueId } });
        if (!issue) return { applied: false, reason: `issue ${issueId} not found` };
        const content = await this.renderMessage(text, triggerKey, issue, ctx);
        const author = await this.resolveCommentAuthor(rule, ctx);
        if (!author) return { applied: false, reason: "no user available to own the comment" };
        const saved = await this.comments.save(
          this.comments.create({ issueId, comment: content, userId: author.id }),
        );
        await this.activityLogs.save(
          this.activityLogs.create({
            action: "comment.created",
            entityId: issueId,
            detail: JSON.stringify({ commentId: saved.id, automated: true }),
            actorId: author.id,
            actorName: author.name,
            actorRole: author.role?.name ?? null,
          }),
        );
        return applied(`commented on #${issueId}`);
      }
      default:
        return {
          applied: false,
          reason: `action ${rule.actionKey} is not supported yet (timer / due-date actions)`,
        };
    }
  }

  /** Comment author = who triggered the rule, falling back to the rule's owner. */
  private async resolveCommentAuthor(rule: Rule, ctx: RuleContext): Promise<User | null> {
    const candidates = [Number(ctx.actorId), Number(rule.createdBy)].filter(
      (id) => Number.isFinite(id) && id > 0,
    );
    for (const id of candidates) {
      const user = await this.users.findOne({ where: { id }, relations: ["role"] });
      if (user) return user;
    }
    return null;
  }

  /**
   * Replace the Thai placeholder tokens the wizard offers. Unknown tokens are
   * left untouched so a half-supported message still reads sensibly.
   */
  private async renderMessage(
    text: string,
    triggerKey: EngineTrigger,
    issue: Issue,
    ctx: RuleContext,
  ): Promise<string> {
    if (!text.includes("{")) return text;
    const out = new Map<string, string>();
    const has = (token: string) => text.includes(token);

    if (has("{ชื่อการ์ด}")) out.set("{ชื่อการ์ด}", issue.title ?? "");
    if (has("{ผู้กระทำ}")) {
      const actorId = Number(ctx.actorId);
      const actor =
        Number.isFinite(actorId) && actorId > 0
          ? await this.users.findOne({ where: { id: actorId } })
          : null;
      out.set("{ผู้กระทำ}", actor?.name ?? "");
    }
    if (has("{ข้อความคอมเมนต์}") && triggerKey === "comment.created") {
      out.set("{ข้อความคอมเมนต์}", String(ctx.newValue ?? ""));
    }
    if (has("{ชื่อไฟล์}") && triggerKey === "attachment.created") {
      out.set("{ชื่อไฟล์}", String(ctx.filename ?? ""));
    }
    if (has("{สถานะเดิม}")) {
      out.set("{สถานะเดิม}", (await this.statusName(Number(ctx.fromStatusId))) ?? "");
    }
    if (has("{สถานะใหม่}")) {
      out.set("{สถานะใหม่}", (await this.statusName(Number(ctx.toStatusId))) ?? "");
    }
    if (has("{ตำแหน่ง}")) {
      const positionId = Number(ctx.assigneePositionId);
      const position =
        Number.isFinite(positionId) && positionId > 0
          ? await this.positions.findOne({ where: { id: positionId } })
          : null;
      out.set("{ตำแหน่ง}", position?.name ?? "");
    }
    if (has("{ชื่อใหม่}")) out.set("{ชื่อใหม่}", String(ctx.newValue ?? ""));
    if (has("{รายละเอียดใหม่}")) out.set("{รายละเอียดใหม่}", String(ctx.newValue ?? ""));
    if (has("{ความสำคัญใหม่}") && triggerKey === "issue.priority_changed") {
      out.set("{ความสำคัญใหม่}", (await this.priorityName(Number(ctx.newValue))) ?? "");
    }
    if (has("{หมวดหมู่ใหม่}") && triggerKey === "issue.category_changed") {
      out.set("{หมวดหมู่ใหม่}", (await this.categoryName(Number(ctx.newValue))) ?? "");
    }
    if (has("{ระยะเวลา}")) out.set("{ระยะเวลา}", String(ctx.durationMinutes ?? ""));

    return text.replace(/\{[^{}]+\}/g, (token) => out.get(token) ?? token);
  }

  private async statusName(id: number): Promise<string | null> {
    if (!Number.isFinite(id) || id <= 0) return null;
    const status = await this.statuses.findOne({ where: { id } });
    return status?.name ?? null;
  }

  private async priorityName(id: number): Promise<string | null> {
    if (!Number.isFinite(id) || id <= 0) return null;
    const priority = await this.priorities.findOne({ where: { id } });
    return priority?.name ?? null;
  }

  private async categoryName(id: number): Promise<string | null> {
    if (!Number.isFinite(id) || id <= 0) return null;
    const category = await this.categories.findOne({ where: { id } });
    return category?.name ?? null;
  }
}

function splitList(target: string): string[] {
  return target
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}
