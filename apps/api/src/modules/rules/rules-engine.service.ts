import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
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
import { WorkSession } from "../work-sessions/entities/work-session.entity";
import { NotificationsService } from "../notifications/notifications.service";
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

/** What an action did — `reason` explains a skip and is stored on the run. */
interface ActionResult {
  applied: boolean;
  reason?: string;
}

/** Statuses covered by the active rules behind one card field each. */
export interface StatusGates {
  timer: Set<number>;
  analysis: Set<number>;
  resolution: Set<number>;
  /** statuses frozen by an active `issue.lock` rule — cards there can't move */
  locked: Set<number>;
}

/**
 * Runs automation rules when a hook fires.
 *
 * Every action it can run is implemented below — including the time actions
 * (`work_session.start` / `.stop` / `.reset`, `issue.allow_time_entry`); only
 * `issue.set_time` is still parked. Actions write through repositories
 * directly, so a rule-driven change never re-enters the hooks; the `running`
 * counter is a second line of defence. A failing rule must never break the
 * caller's request.
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
    @InjectRepository(WorkSession) private readonly workSessions: Repository<WorkSession>,
    // rule-driven moves/assigns notify through the SAME policy as manual ones,
    // so a card finished by automation still reaches the customer
    private readonly notifications: NotificationsService,
  ) {}

  async evaluate(triggerKey: EngineTrigger, ctx: RuleContext): Promise<void> {
    try {
      if (this.running > 0) return;
      const active = await this.rules.find({
        where: { triggerKey, isActive: true },
        order: { createdAt: "ASC" },
      });
      if (active.length === 0) return;

      this.running++;
      try {
        // Timer actions are order-sensitive within one event: a reset must
        // wipe the old total before anything starts, and leaving one timed
        // status for another must stop before it starts again (5 → 3 resets
        // then counts fresh; a → b leaves two clean sessions). Everything
        // else keeps its original creation order in between — sort is stable.
        const rank = (key: string): number =>
          key === "work_session.reset" ? 0 : key === "work_session.stop" ? 1 : key === "work_session.start" ? 3 : 2;
        for (const rule of [...active].sort((a, b) => rank(a.actionKey) - rank(b.actionKey))) {
          // conditions that do not pass mean the rule simply does not run
          if (!this.conditionsPass(rule, triggerKey, ctx)) continue;

          let failed = false;
          try {
            await this.runAction(rule, triggerKey, ctx);
          } catch (err) {
            failed = true;
            const detail = err instanceof Error ? err.message : String(err);
            this.logger.warn(`rule #${rule.id} "${rule.name}" failed: ${detail}`);
          }

          if (failed && rule.stopOnError) break;
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

  /**
   * Which statuses an *active* rule currently covers — asked **when the card
   * is read**, not only when an event fires. A rule created after a card
   * entered its status therefore applies to that card right away (the card
   * detail shows the สาเหตุ / วิธีแก้ไข fields without waiting for the next
   * move), and editing or disabling the rule changes the answer immediately.
   *
   * Only the rules' `to_status` conditions are checked: anything else
   * (actor, role …) varies per request and must not hide a field; a rule
   * without a status condition covers every status.
   *
   * `timer` feeds the card's ⏱ box, `analysis` / `resolution` the two
   * fill-in fields — the card detail shows them from an opening column
   * onward (board order) and lets the value change only inside exactly an
   * opening status (`IssuesService.toResponse()` / `assertFieldEditable()`).
   * The engine still stamps the legacy `is_*_open` flags when it fires,
   * but those no longer drive the display.
   * `locked` freezes a whole status: an active `issue.lock` rule that names
   * its statuses locks every card there (see `IssuesService.move()`), while
   * a lock rule *without* a status condition stays a per-card event lock.
   */
  async statusGates(statusIds: Array<number | null>): Promise<StatusGates> {
    const gates: StatusGates = {
      timer: new Set<number>(),
      analysis: new Set<number>(),
      resolution: new Set<number>(),
      locked: new Set<number>(),
    };
    const candidates = [...new Set(statusIds.filter((id): id is number => id != null))];
    if (candidates.length === 0) return gates;

    const buckets: Record<string, Set<number>> = {
      "work_session.start": gates.timer,
      "issue.open_analysis": gates.analysis,
      "issue.open_resolution": gates.resolution,
      "issue.lock": gates.locked,
    };
    const rules = await this.rules.find({ where: { isActive: true } });
    for (const rule of rules) {
      const target = buckets[rule.actionKey];
      if (!target) continue; // actions without a status gate drive no field
      const statusConditions = (rule.conditions ?? []).filter((c) => c.field === "to_status");
      if (statusConditions.length === 0) {
        // a lock rule with no status filter is a per-card event lock
        // ("created → lock" freezes that one card) — it must never freeze
        // every column on the board; every other gate covers any status
        if (rule.actionKey !== "issue.lock") candidates.forEach((id) => target.add(id));
        continue;
      }
      for (const id of candidates) {
        if (statusConditions.every((c) => this.compare(c.operator as RuleOperator, c.value, id))) {
          target.add(id);
        }
      }
    }
    return gates;
  }

  /** Statuses an active "start timer" rule would time (see `statusGates`). */
  async startTimerApplies(statusIds: Array<number | null>): Promise<Set<number>> {
    return (await this.statusGates(statusIds)).timer;
  }

  /**
   * Is any "unlock card" rule active? The board only offers the one-shot
   * release button on a locked card while at least one `issue.unlock` rule
   * is switched on — without it a locked status stays sealed and admins
   * release cards by pausing the lock rule in /automation instead.
   * Lookup errors fail closed (no button) so a hiccup never hands out
   * unlocks the rules do not allow.
   */
  async isUnlockRuleActive(): Promise<boolean> {
    try {
      const rule = await this.rules.findOne({
        where: { actionKey: "issue.unlock", isActive: true },
      });
      return Boolean(rule);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`unlock rule lookup failed: ${message}`);
      return false;
    }
  }

  /**
   * Is the "one column at a time" drag guard on? One active rule with this
   * action key acts as the switch: pause it in /automation and cards can be
   * dragged across columns freely again. The rule's conditions are ignored on
   * purpose so the board's drop preview and the server's check in
   * `IssuesService.move()` always agree on a single flag. Lookup errors fail
   * open (free dragging) rather than blocking every move.
   */
  async isStepOnlyMoveActive(): Promise<boolean> {
    try {
      const rule = await this.rules.findOne({
        where: { actionKey: "issue.move_step_only", isActive: true },
      });
      return Boolean(rule);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`move guard lookup failed: ${message}`);
      return false;
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
      case "issue.move_step_only":
        // not an event action — `IssuesService.move()` consults it before the
        // write via isStepOnlyMoveActive(); returning early here keeps a rule
        // with this key harmless when the engine runs after a real move
        return { applied: false, reason: "checked before the move, not on it" };
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
        const issue = await this.issues.findOne({ where: { id: issueId }, relations: ["category"] });
        if (!issue) return { applied: false, reason: `issue ${issueId} not found` };
        await this.issues.update(issueId, { statusId });
        // same recipient policy as a manual drag — a card finished by a rule
        // still reaches the customer + admins; a no-op move stays silent
        if (issue.statusId !== statusId) {
          await this.notifications.notifyStatusChange({
            issue,
            statusId,
            actor: this.actorFrom(ctx),
          });
        }
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
        const issue = await this.issues.findOne({ where: { id: issueId }, relations: ["category"] });
        const previousAssigneeId = issue?.programmerId ?? null;
        await this.issues.update(issueId, { programmerId: user.id });
        // the assignee hears about a rule-driven assign exactly like a manual one
        if (issue) {
          await this.notifications.notifyAssignmentChange({
            issue,
            assigneeId: user.id,
            previousAssigneeId,
            actor: this.actorFrom(ctx),
          });
        }
        return applied(`assigned #${issueId} to ${user.name} (position ${positionId})`);
      }
      case "issue.unassign": {
        const issue = await this.issues.findOne({ where: { id: issueId }, relations: ["category"] });
        const previousAssigneeId = issue?.programmerId ?? null;
        await this.issues.update(issueId, { programmerId: null });
        // the person who lost the card + the admins get told to reassign
        if (issue) {
          await this.notifications.notifyAssignmentChange({
            issue,
            assigneeId: null,
            previousAssigneeId,
            actor: this.actorFrom(ctx),
          });
        }
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
        // a lock rule that *names statuses* is a status lock: the gate in
        // `statusGates()` freezes those columns at read/move time, and a
        // per-card flag would outlive pausing the rule — only condition-less
        // rules ("created → lock this card") write the flag.
        if ((rule.conditions ?? []).some((c) => c.field === "to_status")) {
          return { applied: false, reason: "status lock is enforced at read time, not per card" };
        }
        await this.issues.update(issueId, { isLocked: true });
        return applied(`locked #${issueId}`);
      case "issue.unlock":
        // clears the per-card flag and grants the one-shot release, so a
        // rule can free a card from a status lock the same way the unlock
        // button on the board does (the next move consumes the exemption)
        await this.issues.update(issueId, { isLocked: false, lockExempted: true });
        return applied(`unlocked #${issueId}`);
      // The status gate for these two lives in the trigger's conditions
      // (e.g. "card moved to สถานะ X" picked in step ①), so the action itself
      // just flips the lock the moment the rule fires.
      case "issue.open_analysis":
        await this.issues.update(issueId, { isAnalysisOpen: true });
        return applied(`opened analysis field on #${issueId}`);
      case "issue.open_resolution":
        await this.issues.update(issueId, { isResolutionOpen: true });
        return applied(`opened resolution field on #${issueId}`);
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
            // only the id is stored — name/role come off `users` at read time
            actorId: author.id,
          }),
        );
        return applied(`commented on #${issueId}`);
      }
      // ── time actions (rule-driven — the card itself has no buttons) ──
      case "work_session.start": {
        const open = await this.workSessions.findOne({ where: { issueId, endedAt: IsNull() } });
        if (open) return { applied: false, reason: "timer already running" };
        const owner = await this.resolveTimerOwner(issueId, rule, ctx);
        if (!owner) {
          return { applied: false, reason: "no user to own the timer (assign the card first)" };
        }
        await this.workSessions.save(
          this.workSessions.create({
            issueId,
            programmerId: owner.id,
            startedAt: new Date(),
            duration: 0,
          }),
        );
        return applied(`started timer on #${issueId} for ${owner.name}`);
      }
      case "work_session.stop": {
        const open = await this.workSessions.findOne({ where: { issueId, endedAt: IsNull() } });
        if (!open) return { applied: false, reason: "no running timer" };
        open.endedAt = new Date();
        open.duration = Math.max(
          0,
          Math.floor((open.endedAt.getTime() - open.startedAt.getTime()) / 1000),
        );
        await this.workSessions.save(open);
        await this.recalculateTrackedDuration(issueId);
        return applied(`stopped timer on #${issueId} after ${open.duration}s`);
      }
      case "work_session.reset": {
        // wipe every session (a still-running one included) so the next start
        // counts from zero — e.g. a fix bounced back from the "done" status
        const result = await this.workSessions.delete({ issueId });
        await this.issues.update(issueId, { trackedDuration: 0 });
        return applied(
          `reset time on #${issueId} (${result.affected ?? 0} session(s) removed)`,
        );
      }
      case "issue.allow_time_entry": {
        // the *unlocked* flag is cleared again on every move/create, so this
        // grant lasts exactly while the card sits in the status the rule matched
        await this.issues.update(issueId, {
          timeEntryUnlocked: true,
          timeEntryEverGranted: true,
        });
        return applied(`unlocked actual time entry on #${issueId}`);
      }
      default:
        return {
          applied: false,
          reason: `action ${rule.actionKey} is not supported yet`,
        };
    }
  }

  /**
   * `RuleContext.actorId` arrives as `unknown` — only a real id may become an
   * actor, so a missing / zero / garbage value yields `null` instead of a
   * bogus one. Same shape `NotificationActor` expects.
   */
  private actorFrom(ctx: RuleContext): { actorId: number } | null {
    const actorId = Number(ctx.actorId);
    return Number.isFinite(actorId) && actorId > 0 ? { actorId } : null;
  }

  /**
   * Owner of a rule-started session: whoever the card is assigned to, then
   * whoever triggered the rule, then the rule's author. The column is NOT
   * NULL and FK-checked, so the user must actually exist.
   */
  private async resolveTimerOwner(
    issueId: number,
    rule: Rule,
    ctx: RuleContext,
  ): Promise<User | null> {
    const issue = await this.issues.findOne({ where: { id: issueId } });
    const actorId = Number(ctx.actorId);
    const candidates = [
      issue?.programmerId ?? null,
      Number.isFinite(actorId) && actorId > 0 ? actorId : null,
      Number(rule.createdBy) || null,
    ].filter((id): id is number => id != null);
    for (const id of candidates) {
      const user = await this.users.findOne({ where: { id } });
      if (user) return user;
    }
    return null;
  }

  /** `tracked_duration` = the sum of every finished session of the card. */
  private async recalculateTrackedDuration(issueId: number): Promise<void> {
    const sessions = await this.workSessions.find({ where: { issueId } });
    const total = sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0);
    await this.issues.update(issueId, { trackedDuration: total });
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
