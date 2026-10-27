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

/**
 * Runs automation rules when a hook fires.
 *
 * Phase 2 covers every card/content action: move, assign/unassign, labels,
 * lock/unlock, delete/restore and auto-comments (with Thai placeholder tokens).
 * Timer actions (`work_session.*`, `issue.set_time`) and `issue.set_due_date`
 * are skipped until their semantics are settled.
 *
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
          try {
            if (!this.conditionsPass(rule, triggerKey, ctx)) continue;
            await this.runAction(rule, triggerKey, ctx);
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

  private async runAction(rule: Rule, triggerKey: EngineTrigger, ctx: RuleContext): Promise<void> {
    const issueId = Number(ctx.issueId);
    if (!Number.isFinite(issueId) || issueId <= 0) return;
    const config = (rule.actionConfig ?? {}) as Record<string, unknown>;
    const log = (message: string) => this.logger.log(`rule "${rule.name}": ${message}`);

    switch (rule.actionKey) {
      case "issue.set_priority": {
        const priorityId = Number(config.priority);
        if (!Number.isFinite(priorityId)) return;
        await this.issues.update(issueId, { priorityId });
        log(`set priority ${priorityId} on #${issueId}`);
        return;
      }
      case "issue.set_category": {
        const categoryId = Number(config.category);
        if (!Number.isFinite(categoryId)) return;
        await this.issues.update(issueId, { categoryId });
        log(`set category ${categoryId} on #${issueId}`);
        return;
      }
      case "issue.move_status": {
        const statusId = Number(config.targetStatus);
        if (!Number.isFinite(statusId)) return;
        const status = await this.statuses.findOne({ where: { id: statusId } });
        if (!status) {
          this.logger.warn(`rule "${rule.name}": status ${statusId} not found — skipped`);
          return;
        }
        await this.issues.update(issueId, { statusId });
        log(`moved #${issueId} to status "${status.name}"`);
        return;
      }
      case "issue.assign": {
        const positionId = Number(config.position);
        if (!Number.isFinite(positionId)) return;
        const user = await this.users.findOne({
          where: { positionId, isActive: true },
          order: { id: "ASC" },
        });
        if (!user) {
          this.logger.warn(
            `rule "${rule.name}": no active user holds position ${positionId} — skipped`,
          );
          return;
        }
        await this.issues.update(issueId, { programmerId: user.id });
        log(`assigned #${issueId} to ${user.name} (position ${positionId})`);
        return;
      }
      case "issue.unassign": {
        await this.issues.update(issueId, { programmerId: null });
        log(`unassigned #${issueId}`);
        return;
      }
      case "issue.add_label":
      case "issue.remove_label": {
        const labelId = Number(config.label);
        if (!Number.isFinite(labelId)) return;
        const issue = await this.issues.findOne({ where: { id: issueId }, relations: ["labels"] });
        if (!issue) return;
        const current = issue.labels ?? [];
        const has = current.some((l) => l.id === labelId);
        if (rule.actionKey === "issue.add_label") {
          if (has) return;
          const label = await this.labels.findOne({ where: { id: labelId } });
          if (!label) {
            this.logger.warn(`rule "${rule.name}": label ${labelId} not found — skipped`);
            return;
          }
          issue.labels = [...current, label];
          await this.issues.save(issue);
          // legacy single-label column still drives some board views
          if (issue.labelId == null) await this.issues.update(issueId, { labelId });
          log(`added label ${labelId} to #${issueId}`);
        } else {
          if (!has) return;
          issue.labels = current.filter((l) => l.id !== labelId);
          await this.issues.save(issue);
          if (issue.labelId === labelId) await this.issues.update(issueId, { labelId: null });
          log(`removed label ${labelId} from #${issueId}`);
        }
        return;
      }
      case "issue.lock":
        await this.issues.update(issueId, { isLocked: true });
        log(`locked #${issueId}`);
        return;
      case "issue.unlock":
        await this.issues.update(issueId, { isLocked: false });
        log(`unlocked #${issueId}`);
        return;
      case "issue.delete": {
        const existing = await this.issues.findOne({ where: { id: issueId } });
        if (!existing || existing.deletedAt) return;
        await this.issues.update(issueId, { deletedAt: new Date(), deletedBy: null });
        log(`deleted #${issueId}`);
        return;
      }
      case "issue.restore": {
        // deletedAt is a plain column (not TypeORM soft delete) — plain find works
        const existing = await this.issues.findOne({ where: { id: issueId } });
        if (!existing?.deletedAt) return;
        await this.issues.update(issueId, { deletedAt: null, deletedBy: null });
        log(`restored #${issueId}`);
        return;
      }
      case "issue.comment": {
        const text = typeof config.text === "string" ? config.text : "";
        if (!text.trim()) return;
        const issue = await this.issues.findOne({ where: { id: issueId } });
        if (!issue) return;
        const content = await this.renderMessage(text, triggerKey, issue, ctx);
        const author = await this.resolveCommentAuthor(rule, ctx);
        if (!author) {
          this.logger.warn(
            `rule "${rule.name}": no user available to own the comment — skipped`,
          );
          return;
        }
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
        log(`commented on #${issueId}`);
        return;
      }
      default:
        this.logger.debug(
          `rule "${rule.name}": action ${rule.actionKey} is not supported yet (timer / due-date actions)`,
        );
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
