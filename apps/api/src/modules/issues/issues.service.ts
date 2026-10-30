import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DeepPartial, Not, IsNull, Repository } from "typeorm";
import { Issue } from "./entities/issue.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { User } from "../auth/entities/user.entity";
import { IssueStatus } from "../issue-statuses/entities/issue-status.entity";
import { Category } from "../categories/entities/category.entity";
import { Label } from "../labels/entities/label.entity";
import { WorkSessionsService } from "../work-sessions/work-sessions.service";
import { ActorInfo } from "../activity-logs/activity-logs.service";
import { PermissionsService } from "../permissions/permissions.service";
import { RulesEngineService, type StatusGates } from "../rules/rules-engine.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PaginationParams } from "../../common/pagination";
import { AuthUser } from "../auth/auth-user";

const ISSUE_DETAIL_RELATIONS = [
  "status",
  "priority",
  "category",
  "app",
  "label",
  "labels",
  "programmer",
  "customer",
];

/** Work-session aggregates attached per page by `?withTimeline=1`. */
interface WorkTimeline {
  workStartedAt: string | null;
  workEndedAt: string | null;
  durationSeconds: number;
  operatorNames: string[];
}

/**
 * Report/list sorting — whitelist mapping (never interpolate raw query input).
 * `assigneeName` needs the `sortUser` join, which findAll() adds only when
 * that sort is requested.
 */
const SORT_COLUMNS: Record<string, string> = {
  createdAt: "issue.createdAt",
  updatedAt: "issue.updatedAt",
  title: "issue.title",
  receivedAt: "issue.receivedAt",
  hoursActual: "issue.trackedDuration",
  hoursEntered: "issue.actualFixDuration",
  assigneeName: "sortUser.name",
};

/**
 * วันที่เริ่มรับเรื่อง — a card counts as received once it lands in this
 * status ("รอดำเนินการ"). Addressed by id: the status names get renamed
 * (Backlog/Todo → รอรับเรื่อง/รอดำเนินการ), ids do not move.
 */
const RECEIVED_STATUS_ID = 2;

/** yyyy-mm-dd → Date at local midnight / end of day; null when malformed. */
function dayStart(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayEnd(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    @InjectRepository(ActivityLog)
    private readonly activityLogs: Repository<ActivityLog>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(IssueStatus)
    private readonly issueStatuses: Repository<IssueStatus>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Label)
    private readonly labels: Repository<Label>,
    private readonly workSessions: WorkSessionsService,
    private readonly permissions: PermissionsService,
    private readonly rulesEngine: RulesEngineService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(
    params: PaginationParams,
    statuses: number[] = [],
    user?: AuthUser | null,
    search?: string,
    filters: {
      priorityIds?: number[];
      categoryIds?: number[];
      appIds?: number[];
      assigneeIds?: number[];
      reporterIds?: number[];
      createdFrom?: string;
      createdTo?: string;
      sortBy?: string;
      sortOrder?: string;
    } = {},
    withTimeline = false,
  ) {
    const qb = this.issues.createQueryBuilder("issue").where("issue.deleted_at IS NULL");

    if (statuses.length > 0) {
      qb.andWhere("issue.status_id IN (:...statuses)", { statuses });
    }

    const canViewAll = await this.canViewAllIssues(user);
    if (user && !canViewAll) {
      qb.andWhere(
        "(issue.programmer_id = :uid OR issue.customer_id = :uid)",
        { uid: Number(user.id) },
      );
    }

    if (search && search.trim()) {
      qb.leftJoin("issue.labels", "labels").leftJoin("issue.label", "label");
      qb.andWhere(
        "(issue.title ILIKE :q OR issue.description ILIKE :q OR labels.name ILIKE :q OR label.name ILIKE :q)",
        { q: `%${search.trim()}%` },
      );
    }

    if (filters.priorityIds && filters.priorityIds.length > 0) {
      qb.andWhere("issue.priority_id IN (:...priorityIds)", { priorityIds: filters.priorityIds });
    }
    if (filters.categoryIds && filters.categoryIds.length > 0) {
      qb.andWhere("issue.category_id IN (:...categoryIds)", { categoryIds: filters.categoryIds });
    }
    if (filters.appIds && filters.appIds.length > 0) {
      qb.andWhere("issue.app_id IN (:...appIds)", { appIds: filters.appIds });
    }
    if (filters.assigneeIds && filters.assigneeIds.length > 0) {
      qb.andWhere("issue.programmer_id IN (:...assigneeIds)", { assigneeIds: filters.assigneeIds });
    }
    if (filters.reporterIds && filters.reporterIds.length > 0) {
      qb.andWhere("issue.customer_id IN (:...reporterIds)", { reporterIds: filters.reporterIds });
    }

    // report date range — both bounds are yyyy-mm-dd (validated above)
    const from = dayStart(filters.createdFrom);
    if (from) qb.andWhere("issue.created_at >= :createdFrom", { createdFrom: from });
    const to = dayEnd(filters.createdTo);
    if (to) qb.andWhere("issue.created_at <= :createdTo", { createdTo: to });

    // sort — whitelisted above; join early so count/id/data clones all see it
    const sortKey = SORT_COLUMNS[filters.sortBy ?? ""] ?? "issue.createdAt";
    const sortDir: "ASC" | "DESC" = filters.sortOrder === "asc" ? "ASC" : "DESC";
    if (sortKey === "sortUser.name") {
      qb.leftJoin("issue.programmer", "sortUser");
    }

    const total = await qb.clone().getCount();

    // Postgres requires every ORDER BY expression to appear in the SELECT
    // DISTINCT list — mirror the chosen sort column there (issue columns and
    // the optional `sortUser.name` join both land in the select list).
    let idQb = qb
      .clone()
      .distinct(true)
      .select("issue.id", "id")
      .addSelect("issue.createdAt", "createdAt");
    if (sortKey !== "issue.createdAt") {
      idQb = idQb.addSelect(sortKey, "sortValue");
    }
    const idRows = await idQb
      .orderBy(sortKey, sortDir, "NULLS LAST")
      .addOrderBy("issue.createdAt", "DESC")
      .addOrderBy("issue.id", "DESC")
      .offset((params.page - 1) * params.limit)
      .limit(params.limit)
      .getRawMany();
    const ids = idRows.map((row) => Number(row.id));

    const totalPages = Math.max(1, Math.ceil(total / params.limit));

    if (ids.length === 0) {
      return { data: [], total, page: params.page, limit: params.limit, totalPages };
    }

    let dataQb = this.issues
      .createQueryBuilder("issue")
      .leftJoinAndSelect("issue.status", "status")
      .leftJoinAndSelect("issue.priority", "priority")
      .leftJoinAndSelect("issue.category", "category")
      .leftJoinAndSelect("issue.app", "app")
      .leftJoinAndSelect("issue.label", "label")
      .leftJoinAndSelect("issue.labels", "labels")
      .leftJoinAndSelect("issue.programmer", "programmer")
      .leftJoinAndSelect("issue.customer", "customer")
      .leftJoinAndSelect("issue.attachments", "attachments")
      .loadRelationCountAndMap("issue.commentCount", "issue.comments")
      .where("issue.id IN (:...ids)", { ids });
    if (sortKey === "sortUser.name") {
      dataQb = dataQb.leftJoin("issue.programmer", "sortUser");
    }
    const issues = await dataQb
      .orderBy(sortKey, sortDir, "NULLS LAST")
      .addOrderBy("issue.createdAt", "DESC")
      .addOrderBy("issue.id", "DESC")
      .getMany();

    // one rules query for the whole page feeds `timerRuleApplies` and the
    // analysis/resolution gates on every row (the column order rides along)
    const gates = await this.rulesEngine.statusGates(issues.map((i) => i.statusId ?? null));
    const order = await this.fieldOrder(gates);
    const rows = await Promise.all(issues.map((i) => this.toResponse(i, gates, order)));
    const data = withTimeline ? await this.attachWorkTimeline(rows) : rows;
    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
      totalPages,
    };
  }

  /**
   * Report-only enrichment (`?withTimeline=1`): per-issue work-session
   * aggregates — first start, last end, total seconds and every operator.
   * One grouped query for the whole page; the board never passes the flag.
   */
  private async attachWorkTimeline<T extends { id: number }>(
    rows: T[],
  ): Promise<Array<T & WorkTimeline>> {
    if (rows.length === 0) return rows as Array<T & WorkTimeline>;
    const raw: Array<{
      issueId: number;
      workStartedAt: Date | string | null;
      workEndedAt: Date | string | null;
      durationSeconds: string | number;
      operatorNames: string | null;
    }> = await this.issues.manager.query(
      `SELECT ws.issue_id AS "issueId",
              MIN(ws.started_at) AS "workStartedAt",
              MAX(ws.ended_at) AS "workEndedAt",
              COALESCE(SUM(ws.duration), 0) AS "durationSeconds",
              COALESCE(STRING_AGG(DISTINCT u.name, ', ' ORDER BY u.name), '') AS "operatorNames"
       FROM work_sessions ws
       LEFT JOIN users u ON u.id = ws.programmer_id
       WHERE ws.issue_id = ANY($1)
       GROUP BY ws.issue_id`,
      [rows.map((r) => r.id)],
    );

    const byIssue = new Map<number, WorkTimeline>();
    for (const r of raw) {
      byIssue.set(Number(r.issueId), {
        workStartedAt: r.workStartedAt
          ? new Date(r.workStartedAt).toISOString()
          : null,
        workEndedAt: r.workEndedAt ? new Date(r.workEndedAt).toISOString() : null,
        durationSeconds: Number(r.durationSeconds ?? 0),
        operatorNames: (r.operatorNames ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
    }

    for (const row of rows) {
      const t = byIssue.get(row.id);
      Object.assign(row, {
        workStartedAt: t?.workStartedAt ?? null,
        workEndedAt: t?.workEndedAt ?? null,
        durationSeconds: t?.durationSeconds ?? 0,
        operatorNames: t?.operatorNames ?? [],
      });
    }
    return rows as Array<T & WorkTimeline>;
  }

  private async canViewAllIssues(
    user?: AuthUser | null,
  ): Promise<boolean> {
    if (!user) return true;
    const permissions = await this.permissions.getUserPermissions(user.roleId, user.positionId);
    return permissions.includes("issue.all.view");
  }

  async findOne(id: number) {
    const issue = await this.issues.findOne({
      where: { id },
      relations: ISSUE_DETAIL_RELATIONS,
    });
    if (!issue || issue.deletedAt) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    return this.toResponse(issue);
  }

  async create(
    data: {
      title: string;
      description: string;
      statusId: number;
      priorityId?: number;
      categoryId?: number;
      customCategory?: string;
      appId?: number;
      programmerId?: number;
      customerId?: number;
      labelId?: number;
    },
    actor?: ActorInfo | null,
  ) {
    const status = await this.issueStatuses.findOne({
      where: { id: data.statusId },
    });
    if (!status) {
      throw new NotFoundException(`Status ${data.statusId} not found`);
    }
    const issueNumber = await this.generateIssueNumber();
    const resolvedCustomerId =
      actor?.actorRole === "customer"
        ? Number(actor.actorId)
        : (data.customerId ?? null);
    // Assignment stays manual for now: the admin picks the assignee on the board.
    // Category auto-assign (`categories.position` → resolveAutoAssign) is parked —
    // see AGENTS.md. The column still holds data, nothing reads it at runtime.
    const resolvedProgrammerId = data.programmerId ?? null;

    const issue = this.issues.create({
      title: data.title,
      description: data.description,
      statusId: status.id,
      // created straight into the receiving status = already รับเรื่อง
      receivedAt: status.id === RECEIVED_STATUS_ID ? new Date() : null,
      priorityId: data.priorityId ?? null,
      categoryId: data.categoryId ?? null,
      customCategory: data.customCategory?.trim() || null,
      appId: data.appId ?? null,
      programmerId: resolvedProgrammerId,
      customerId: resolvedCustomerId,
      labelId: data.labelId ?? null,
      issueNumber,
      // a fresh card starts with the entry field locked: an
      // `issue.allow_time_entry` rule on `issue.created` may open it right away
      timeEntryUnlocked: false,
      timeEntryEverGranted: false,
    } as DeepPartial<Issue>);
    await this.issues.save(issue);
    // notify the assignee (auto-assign included) + every admin — best-effort,
    // never blocks create; an unassigned card still reaches the admins
    const createdCategory = data.categoryId
      ? await this.categories.findOne({ where: { id: data.categoryId } })
      : null;
    await this.notifications.notifyIssueEvent({
      issue: {
        id: issue.id,
        title: issue.title,
        programmerId: resolvedProgrammerId,
        customerId: resolvedCustomerId,
        category: createdCategory,
      },
      action: "created",
      recipients: [resolvedProgrammerId],
      actor,
      alsoAdmins: true,
    });
    await this.logActivity({
      action: "card.created",
      entityId: issue.id,
      detail: JSON.stringify({ title: issue.title }),
      actor,
    });
    // automation rules run before the reload so their effect shows in the response
    await this.rulesEngine.evaluate("issue.created", {
      issueId: issue.id,
      toStatusId: status.id,
      priorityId: issue.priorityId ?? null,
      categoryId: issue.categoryId ?? null,
      reporterId: issue.customerId ?? null,
      actorId: actor?.actorId ?? null,
      actorRole: actor?.actorRole ?? null,
    });
    // A card born with a category never *changes* one, so rules like
    // "when category is error → assign" would never see it. Emit the
    // category_changed trigger with oldValue = null for that case; rules
    // whose category condition does not match simply do not run (the card
    // stays unassigned), exactly like on a real category change.
    if (issue.categoryId != null) {
      await this.rulesEngine.evaluate("issue.category_changed", {
        issueId: issue.id,
        toStatusId: status.id,
        newValue: issue.categoryId,
        oldValue: null,
        actorId: actor?.actorId ?? null,
        actorRole: actor?.actorRole ?? null,
      });
    }
    const created = await this.issues.findOne({
      where: { id: issue.id },
      relations: ISSUE_DETAIL_RELATIONS,
    });
    return this.toResponse(created!);
  }

  async update(
    id: number,
    data: {
      title?: string;
      description?: string;
      priorityId?: number | null;
      categoryId?: number | null;
      labelId?: number | null;
      labelIds?: number[];
      analysisCause?: string | null;
      resolution?: string | null;
    },
    actor?: ActorInfo | null,
  ) {
    const issue = await this.issues.findOne({ where: { id }, relations: ISSUE_DETAIL_RELATIONS });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    const previous = {
      title: issue.title,
      description: issue.description,
      priorityId: issue.priorityId ?? null,
      categoryId: issue.categoryId ?? null,
      statusId: issue.statusId ?? null,
      analysisCause: issue.analysisCause ?? null,
      resolution: issue.resolution ?? null,
    };
    const changes: string[] = [];
    const updates: Partial<Issue> = {};

    if (data.title !== undefined && data.title !== issue.title) {
      updates.title = data.title;
      changes.push("title");
    }
    if (data.description !== undefined && data.description !== issue.description) {
      updates.description = data.description;
      changes.push("description");
    }
    if (data.analysisCause !== undefined) {
      // empty string is stored as null so the card shows the blank state again
      const next = data.analysisCause?.trim() || null;
      if (next !== (issue.analysisCause ?? null)) {
        // only a status the active rule opens this field for may change it
        await this.assertFieldEditable(issue, "analysis");
        updates.analysisCause = next;
        changes.push("analysisCause");
      }
    }
    if (data.resolution !== undefined) {
      const next = data.resolution?.trim() || null;
      if (next !== (issue.resolution ?? null)) {
        await this.assertFieldEditable(issue, "resolution");
        updates.resolution = next;
        changes.push("resolution");
      }
    }

    if (data.priorityId !== undefined && data.priorityId !== issue.priorityId) {
      updates.priorityId = data.priorityId;
      changes.push("priority");
    }
    if (data.categoryId !== undefined && data.categoryId !== issue.categoryId) {
      updates.categoryId = data.categoryId;
      changes.push("category");
    }
    if (data.labelId !== undefined && data.labelId !== issue.labelId) {
      updates.labelId = data.labelId;
      changes.push("label");
    }
    if (data.labelIds !== undefined) {
      const labels = data.labelIds.length
        ? await this.labels.find({ where: data.labelIds.map((labelId) => ({ id: labelId })) })
        : [];
      await this.issues.save({ id, labels } as Issue);
      changes.push("labels");
    }

    if (changes.length === 0) return this.toResponse(issue);

    if (Object.keys(updates).length > 0) {
      await this.issues.update(id, updates);
    }
    // notify the assignee that their issue was edited
    await this.notifications.notifyIssueEvent({
      issue,
      action: "edited",
      recipients: [issue.programmerId],
      actor,
    });
    await this.logActivity({
      action: "card.edited",
      entityId: issue.id,
      detail: JSON.stringify({ fields: changes }),
      actor,
    });
    // automation rules — one trigger per changed field, before the response reload
    const engineCtx = {
      issueId: id,
      actorId: actor?.actorId ?? null,
      actorRole: actor?.actorRole ?? null,
      toStatusId: issue.statusId ?? null,
    };
    if (changes.includes("priority")) {
      await this.rulesEngine.evaluate("issue.priority_changed", {
        ...engineCtx,
        newValue: updates.priorityId ?? null,
        oldValue: previous.priorityId,
      });
    }
    if (changes.includes("category")) {
      await this.rulesEngine.evaluate("issue.category_changed", {
        ...engineCtx,
        newValue: updates.categoryId ?? null,
        oldValue: previous.categoryId,
      });
    }
    if (changes.includes("title")) {
      await this.rulesEngine.evaluate("issue.title_changed", {
        ...engineCtx,
        newValue: updates.title ?? null,
        oldValue: previous.title,
      });
    }
    if (changes.includes("description")) {
      await this.rulesEngine.evaluate("issue.description_changed", {
        ...engineCtx,
        newValue: updates.description ?? null,
        oldValue: previous.description,
      });
    }
    const fresh = await this.issues.findOne({
      where: { id: issue.id },
      relations: ISSUE_DETAIL_RELATIONS,
    });
    return this.toResponse(fresh!);
  }

  /**
   * The analysis/resolution values may only change while the card sits in a
   * status an *active* rule opens that field for — the same answer
   * `toResponse()` hands the board, so the pencil and the server can never
   * disagree. Asked only when a value would actually change (re-saving the
   * same text must never 400). An unreadable rule list fails open, the same
   * stance as the move lock guard: a lookup hiccup must never wedge a field.
   */
  private async assertFieldEditable(
    issue: Issue,
    field: "analysis" | "resolution",
  ): Promise<void> {
    let gates: StatusGates | null = null;
    try {
      gates = await this.rulesEngine.statusGates([issue.statusId]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`field gate lookup failed for issue ${issue.id}: ${message}`);
    }
    if (!gates) return; // fail open — a broken lookup must not lock the field
    const open = field === "analysis" ? gates.analysis : gates.resolution;
    if (issue.statusId != null && open.has(issue.statusId)) return;
    throw new BadRequestException(`The ${field} field is not editable in this status`);
  }

  async move(id: number, statusId: number, actor?: ActorInfo | null) {
    const issue = await this.issues.findOne({ where: { id }, relations: ISSUE_DETAIL_RELATIONS });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    const targetStatus = await this.issueStatuses.findOne({ where: { id: statusId } });
    if (!targetStatus) {
      throw new NotFoundException(`Status ${statusId} not found`);
    }
    if (issue.statusId === statusId) return this.toResponse(issue);

    // status locks: an active `issue.lock` rule naming the card's status
    // freezes it — checked before anything is written, like the step-only
    // guard, so a rejected drag leaves no notification or activity behind.
    // The board's unlock button (or an `issue.unlock` rule) releases the
    // card exactly once via `lock_exempted`, consumed by the move below.
    // 409 (not 400) so the board can tell this apart from the step-only guard.
    if (!(await this.isMoveAllowedByLock(issue))) {
      throw new ConflictException(
        "This card is locked in its status — unlock it before moving",
      );
    }

    // the "one column at a time" rule (an active issue.move_step_only rule;
    // pause it in /automation for free dragging) — checked before anything is
    // written, so a rejected drag leaves no notification or activity behind
    if (await this.rulesEngine.isStepOnlyMoveActive()) {
      await this.assertAdjacentMove(issue.statusId, statusId);
    }

    const sourceStatus = issue.statusId
      ? await this.issueStatuses.findOne({ where: { id: issue.statusId } })
      : null;
    // moving re-locks the "actual fix time" field: an
    // `issue.allow_time_entry` rule below may grant it again for the target
    // status, everything else stays read-only (or hidden if never granted).
    // A one-shot unlock is consumed here: re-entering a locked status later
    // locks the card again.
    // วันที่เริ่มรับเรื่อง: first landing in the receiving status stamps it once
    const stampReceivedAt =
      targetStatus.id === RECEIVED_STATUS_ID && !issue.receivedAt ? new Date() : undefined;
    await this.issues.update(id, {
      statusId,
      timeEntryUnlocked: false,
      lockExempted: false,
      ...(stampReceivedAt ? { receivedAt: stampReceivedAt } : {}),
    });

    // the recipient policy lives in NotificationsService (milestone columns
    // get their own type; routine drags only reach the two people on the card)
    await this.notifications.notifyStatusChange({ issue, statusId, actor });

    await this.logActivity({
      action: "card.moved",
      entityId: issue.id,
      detail: JSON.stringify({
        from: sourceStatus?.name ?? null,
        to: targetStatus.name,
      }),
      actor,
    });

    await this.rulesEngine.evaluate("issue.moved", {
      issueId: id,
      toStatusId: statusId,
      fromStatusId: issue.statusId ?? null,
      actorId: actor?.actorId ?? null,
      actorRole: actor?.actorRole ?? null,
    });

    const updated = await this.issues.findOne({ where: { id }, relations: ISSUE_DETAIL_RELATIONS });
    return this.toResponse(updated ?? issue);
  }

  /** Board drag policy — what the drop preview and the card menu key off. */
  async movePolicy() {
    return {
      stepOnly: await this.rulesEngine.isStepOnlyMoveActive(),
      // the unlock button on a locked card only exists while a rule offers it
      unlockAvailable: await this.rulesEngine.isUnlockRuleActive(),
    };
  }

  /**
   * The step-only rule allows a move only to the status directly before or
   * after the card's own, in board order (`position`, the order the columns
   * render in). Cards that cannot be placed on that ladder — no status yet
   * (first placement) or a status that no longer exists — always pass, as does
   * an unreadable status list: the guard must never wedge the board shut.
   */
  private async assertAdjacentMove(fromStatusId: number | null, toStatusId: number) {
    if (fromStatusId == null) return;
    const ordered = await this.issueStatuses.find({
      select: { id: true },
      order: { position: "ASC", id: "ASC" },
    });
    const from = ordered.findIndex((s) => s.id === fromStatusId);
    const to = ordered.findIndex((s) => s.id === toStatusId);
    if (from === -1 || to === -1) return;
    if (Math.abs(from - to) === 1) return;
    throw new BadRequestException(
      "Cards can only move one column at a time while the step-by-step move rule is active",
    );
  }

  /**
   * May this card leave its status? Two lock sources — a per-card flag the
   * engine's `issue.lock` action writes when the rule names no status, and
   * the statuses an *active* `issue.lock` rule covers right now (asked at
   * move time, so cards already sitting in the status lock too, and pausing
   * the rule frees them at once). `lock_exempted` (the board's unlock button
   * or an `issue.unlock` rule) releases the card for exactly one move. An
   * unreadable status list fails open — the lock must never wedge a card
   * in place with no way out.
   */
  private async isMoveAllowedByLock(issue: Issue): Promise<boolean> {
    if (issue.lockExempted) return true;
    if (issue.isLocked) return false;
    if (issue.statusId == null) return true;
    try {
      const gates = await this.rulesEngine.statusGates([issue.statusId]);
      return !gates.locked.has(issue.statusId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`status lock lookup failed for issue ${issue.id}: ${message}`);
      return true;
    }
  }

  /**
   * One-shot release from a status lock (`PUT /issues/:id/unlock`, the lock
   * icon on the board's card menu): clears the per-card flag and grants
   * `lock_exempted`, which the next successful move consumes — so moving the
   * card into another locked status locks it again.
   */
  async unlock(id: number, actor?: ActorInfo | null) {
    const issue = await this.issues.findOne({ where: { id }, relations: ISSUE_DETAIL_RELATIONS });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    await this.issues.update(id, { isLocked: false, lockExempted: true });
    await this.logActivity({
      action: "card.unlocked",
      entityId: issue.id,
      detail: JSON.stringify({ status: issue.status?.name ?? null }),
      actor,
    });
    const fresh = await this.issues.findOne({ where: { id }, relations: ISSUE_DETAIL_RELATIONS });
    return this.toResponse(fresh ?? issue);
  }

  async setActualFixDuration(id: number, duration: number) {
    const issue = await this.issues.findOne({ where: { id }, relations: ISSUE_DETAIL_RELATIONS });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    if (!Number.isFinite(duration) || duration < 0) {
      throw new BadRequestException("actualFixDuration must be a positive number of seconds");
    }
    issue.actualFixDuration = Math.round(duration);
    await this.issues.save(issue);
    return this.toResponse(issue);
  }

  private async recalculateTrackedDuration(id: number) {
    const sessions = await this.workSessions.getByIssue(id);
    const total = sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0);
    await this.issues.update(id, { trackedDuration: total });
  }

  async assign(id: number, programmerId: number | null, actor?: ActorInfo | null) {
    // category relation so the notification carries the same context as other events
    const issue = await this.issues.findOne({ where: { id }, relations: ["category"] });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    if (programmerId !== null) {
      const user = await this.users.findOne({ where: { id: programmerId } });
      if (!user) {
        throw new NotFoundException(`User ${programmerId} not found`);
      }
    }
    const oldAssignee = issue.programmerId;
    await this.issues.update(id, { programmerId });
    // same shared policy as the engine: "assigned" → new assignee + reporter,
    // clearing the field → "unassigned" → the person who lost it + admins
    await this.notifications.notifyAssignmentChange({
      issue,
      assigneeId: programmerId,
      previousAssigneeId: oldAssignee,
      actor,
    });
    await this.logActivity({
      action: "card.assigned",
      entityId: id,
      detail: JSON.stringify({
        from: oldAssignee,
        to: programmerId,
      }),
      actor,
    });
    // the trigger works on positions, so resolve the assignee's position first
    const assignee = programmerId ? await this.users.findOne({ where: { id: programmerId } }) : null;
    await this.rulesEngine.evaluate("issue.assigned", {
      issueId: id,
      assigneePositionId: assignee?.positionId ?? null,
      newValue: programmerId ?? null,
      oldValue: oldAssignee ?? null,
      actorId: actor?.actorId ?? null,
      actorRole: actor?.actorRole ?? null,
    });
    const updated = await this.issues.findOne({ where: { id }, relations: ISSUE_DETAIL_RELATIONS });
    return this.toResponse(updated!);
  }











  /**
   * The board's entry column: the status with the lowest `position`, i.e. the
   * first column the API serves. Used by the customer delete rule — the name
   * ("Backlog" / "รอรับเรื่อง") is display-only and must not gate permission.
   */
  private async firstColumnStatusId(): Promise<number | null> {
    const [first] = await this.issueStatuses.find({
      order: { position: "ASC", id: "ASC" },
      take: 1,
    });
    return first?.id ?? null;
  }

  async remove(id: number, actor?: ActorInfo | null) {
    const issue = await this.issues.findOne({
      where: { id },
      relations: ["status", "category"],
    });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    // The rule is "a customer may only clear cards out of the board's first
    // column" (the entry/backlog column). Key it off the column order, never
    // the status name: renaming Backlog → "รอรับเรื่อง" must not lock every
    // customer out of deleting anything.
    if (actor?.actorRole === "customer") {
      const firstColumnId = await this.firstColumnStatusId();
      if (!firstColumnId || issue.statusId !== firstColumnId) {
        throw new ForbiddenException(
          "Customer can only delete issues in the first column",
        );
      }
    }
    // close a still-running timer first, so the trash never keeps one open
    await this.workSessions.stop(id);
    issue.deletedAt = new Date();
    issue.deletedBy = actor?.actorId ?? null;
    await this.issues.save(issue);
    // notify assignee + reporter that the issue was deleted (soft)
    await this.notifications.notifyIssueEvent({
      issue,
      action: "deleted",
      recipients: [issue.programmerId, issue.customerId],
      actor,
    });
    await this.logActivity({
      action: "card.deleted",
      entityId: issue.id,
      detail: JSON.stringify({ title: issue.title }),
      actor,
    });
    await this.rulesEngine.evaluate("issue.deleted", {
      issueId: issue.id,
      fromStatusId: issue.statusId ?? null,
      actorId: actor?.actorId ?? null,
      actorRole: actor?.actorRole ?? null,
    });
    return { deleted: true };
  }

  async restore(id: number, actor?: ActorInfo | null) {
    const issue = await this.issues.findOne({
      where: { id },
      withDeleted: true,
      relations: ISSUE_DETAIL_RELATIONS,
    });
    if (!issue || !issue.deletedAt) {
      throw new NotFoundException(`Issue ${id} not found in trash`);
    }
    issue.deletedAt = null;
    issue.deletedBy = null;
    await this.issues.save(issue);
    // notify assignee + reporter that the issue is back
    await this.notifications.notifyIssueEvent({
      issue,
      action: "restored",
      recipients: [issue.programmerId, issue.customerId],
      actor,
    });
    await this.logActivity({
      action: "card.restored",
      entityId: issue.id,
      detail: JSON.stringify({ title: issue.title }),
      actor,
    });
    await this.rulesEngine.evaluate("issue.restored", {
      issueId: issue.id,
      toStatusId: issue.statusId ?? null,
      actorId: actor?.actorId ?? null,
      actorRole: actor?.actorRole ?? null,
    });
    return this.toResponse(issue);
  }

  async findAllDeleted() {
    const issues = await this.issues.find({
      where: { deletedAt: Not(IsNull()) },
      order: { deletedAt: "DESC" },
      relations: ["priority", "category", "label", "labels", "programmer", "customer", "deletedByUser"],
      withDeleted: true,
    });
    // one rules query for the whole trash page (see `toResponse`)
    const gates = await this.rulesEngine.statusGates(issues.map((i) => i.statusId ?? null));
    const order = await this.fieldOrder(gates);
    return Promise.all(
      issues.map(async (i) => ({
        ...(await this.toResponse(i, gates, order)),
        deletedAt: i.deletedAt,
        deletedBy: i.deletedBy,
        deletedByName: i.deletedByUser?.name ?? null,
      })),
    );
  }

  private async generateIssueNumber(): Promise<string> {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);
    const datePrefix = `${dd}${mm}${yy}`;

    const latest = await this.issues
      .createQueryBuilder("issue")
      .where("issue.issue_number LIKE :prefix", { prefix: `${datePrefix}-%` })
      .orderBy("issue.id", "DESC")
      .getOne();

    let seq = 1;
    if (latest?.issueNumber) {
      const parts = latest.issueNumber.split("-");
      const lastSeq = parseInt(parts[1], 10);
      if (!isNaN(lastSeq)) {
        seq = lastSeq + 1;
      }
    }

    return `${datePrefix}-${String(seq).padStart(3, "0")}`;
  }

  private async logActivity(data: {
    action: string;
    entityId: number;
    detail: string;
    actor?: ActorInfo | null;
  }) {
    await this.activityLogs.save(
      this.activityLogs.create({
        action: data.action,
        entityId: data.entityId,
        detail: data.detail,
        // only the id is stored — name/role come off `users` at read time
        actorId: data.actor?.actorId ?? null,
      }),
    );
  }

  /**
   * Board order (column index per status id) behind the analysis/resolution
   * "visible here or in a later column" check. No active rule opening either
   * field means nothing to order — the common case skips the query entirely.
   */
  private async fieldOrder(gates: StatusGates): Promise<Map<number, number>> {
    if (gates.analysis.size === 0 && gates.resolution.size === 0) return new Map();
    const statuses = await this.issueStatuses.find({
      select: { id: true, position: true },
      order: { position: "ASC", id: "ASC" },
    });
    return new Map(statuses.map((s, index) => [s.id, index]));
  }

  /**
   * API shape of one card. `timerRuleApplies`, `isAnalysisOpen` and
   * `isResolutionOpen` ask the engine which statuses an *active* rule covers
   * (`statusGates`), so a rule created after the card already sat in that
   * status still opens its field — no event has to fire for the card.
   *
   * The analysis/resolution pair splits into two answers, both read from the
   * rules + board order (nothing hardcodes which status):
   * - **visible** — the card sits in an opening status *or a later column*,
   *   or a value is already recorded (a filled field never vanishes, even
   *   upstream of the rule or after the rule is paused);
   * - **editable** (`canEditAnalysis` / `canEditResolution`) — the card sits
   *   in exactly an opening status; `update()` enforces the same answer.
   *
   * Bulk paths pass precomputed gates/order so a 100-card page costs one
   * rules query instead of 100.
   */
  private async toResponse(issue: Issue, precomputed?: StatusGates, order?: Map<number, number>) {
    const statusId = issue.statusId ?? null;
    // a card with no status can never be covered (and costs no rules query)
    const gates = precomputed ?? (await this.rulesEngine.statusGates([statusId]));
    const covered = (set: Set<number>): boolean => statusId != null && set.has(statusId);
    const boardOrder =
      order ?? (statusId != null ? await this.fieldOrder(gates) : new Map<number, number>());
    /** Is some status the rule opens the field for at or before this column? */
    const atOrAfter = (set: Set<number>): boolean => {
      if (statusId == null || set.size === 0) return false;
      const current = boardOrder.get(statusId);
      if (current === undefined) return false;
      for (const gateId of set) {
        const gateIndex = boardOrder.get(gateId);
        if (gateIndex !== undefined && gateIndex <= current) return true;
      }
      return false;
    };
    return {
      id: issue.id,
      issueNumber: issue.issueNumber,
      title: issue.title,
      description: issue.description,
      analysisCause: issue.analysisCause ?? null,
      resolution: issue.resolution ?? null,
      // visible from the opening column onward (board order) or wherever a
      // value already sits; editable only inside exactly an opening status.
      // The legacy `is_*_open` per-card flags no longer drive the display.
      isAnalysisOpen: Boolean(issue.analysisCause) || atOrAfter(gates.analysis),
      canEditAnalysis: covered(gates.analysis),
      isResolutionOpen: Boolean(issue.resolution) || atOrAfter(gates.resolution),
      canEditResolution: covered(gates.resolution),
      // locked = per-card flag or an active `issue.lock` rule covering the
      // status; a one-shot unlock releases it (the move consumes the flag)
      isLocked:
        ((issue.isLocked ?? false) || covered(gates.locked)) && !(issue.lockExempted ?? false),
      statusId: issue.statusId,
      statusName: issue.status?.name ?? null,
      priorityId: issue.priorityId,
      priorityName: issue.priority?.name ?? null,
      categoryId: issue.categoryId,
      categoryName: issue.category?.name ?? null,
      customCategory: issue.customCategory,
      appId: issue.appId,
      appName: issue.app?.name ?? null,
      labelId: issue.labelId,
      labelIds: (issue.labels ?? []).map((l) => l.id).sort((a, b) => a - b),
      labelName: issue.labels?.[0]?.name ?? issue.label?.name ?? null,
      labelColor: issue.labels?.[0]?.color ?? issue.label?.color ?? null,
      labels: (issue.labels ?? []).map((l) => ({ id: l.id, name: l.name, color: l.color })),
      programmerId: issue.programmerId,
      programmerName: issue.programmer?.name ?? null,
      customerId: issue.customerId,
      customerName: issue.customer?.name ?? null,
      commentCount:
        (issue as Issue & { commentCount?: number }).commentCount ??
        issue.comments?.length ??
        0,
      attachmentCount: issue.attachments?.length ?? 0,
      trackedDuration: issue.trackedDuration,
      actualFixDuration: issue.actualFixDuration,
      timeEntryUnlocked: issue.timeEntryUnlocked ?? false,
      timeEntryEverGranted: issue.timeEntryEverGranted ?? false,
      timerRuleApplies: covered(gates.timer),
      receivedAt: issue.receivedAt ?? null,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  }
}
