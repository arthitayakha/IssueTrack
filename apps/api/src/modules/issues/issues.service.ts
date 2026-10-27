import {
  Injectable,
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
import { Position } from "../positions/position.entity";
import { WorkSessionsService } from "../work-sessions/work-sessions.service";
import { ActorInfo } from "../activity-logs/activity-logs.service";
import { PermissionsService } from "../permissions/permissions.service";
import { RulesEngineService } from "../rules/rules-engine.service";
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

@Injectable()
export class IssuesService {
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
    @InjectRepository(Position)
    private readonly positions: Repository<Position>,
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
    } = {},
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

    const total = await qb.clone().getCount();

    // Newest first: `created_at` must also be selected because Postgres
    // requires every ORDER BY expression to appear in a SELECT DISTINCT list.
    const idRows = await qb
      .clone()
      .distinct(true)
      .select("issue.id", "id")
      .addSelect("issue.createdAt", "createdAt")
      .orderBy("issue.createdAt", "DESC")
      .addOrderBy("issue.id", "DESC")
      .offset((params.page - 1) * params.limit)
      .limit(params.limit)
      .getRawMany();
    const ids = idRows.map((row) => Number(row.id));

    const totalPages = Math.max(1, Math.ceil(total / params.limit));

    if (ids.length === 0) {
      return { data: [], total, page: params.page, limit: params.limit, totalPages };
    }

    const issues = await this.issues
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
      .where("issue.id IN (:...ids)", { ids })
      .orderBy("issue.createdAt", "DESC")
      .addOrderBy("issue.id", "DESC")
      .getMany();

    return {
      data: issues.map((i) => this.toResponse(i)),
      total,
      page: params.page,
      limit: params.limit,
      totalPages,
    };
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
    const resolvedProgrammerId =
      data.programmerId ??
      (data.categoryId ? await this.resolveAutoAssign(data.categoryId) : null);

    const issue = this.issues.create({
      title: data.title,
      description: data.description,
      statusId: status.id,
      priorityId: data.priorityId ?? null,
      categoryId: data.categoryId ?? null,
      customCategory: data.customCategory?.trim() || null,
      appId: data.appId ?? null,
      programmerId: resolvedProgrammerId,
      customerId: resolvedCustomerId,
      labelId: data.labelId ?? null,
      issueNumber,
    } as DeepPartial<Issue>);
    await this.issues.save(issue);
    // notify the assignee (auto-assign included) — best-effort, never blocks create
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

    const sourceStatus = issue.statusId
      ? await this.issueStatuses.findOne({ where: { id: issue.statusId } })
      : null;
    await this.issues.update(id, { statusId });

    // notify assignee + reporter about the status change
    await this.notifications.notifyIssueEvent({
      issue,
      action: "moved",
      recipients: [issue.programmerId, issue.customerId],
      actor,
    });

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

  async setActualFixDuration(id: number, duration: number) {
    const issue = await this.issues.findOne({ where: { id }, relations: ISSUE_DETAIL_RELATIONS });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    issue.actualFixDuration = duration;
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
    // notify the new assignee + the reporter (notify() skips the actor themselves)
    await this.notifications.notifyIssueEvent({
      issue,
      action: "assigned",
      recipients: [programmerId, issue.customerId],
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











  async remove(id: number, actor?: ActorInfo | null) {
    const issue = await this.issues.findOne({
      where: { id },
      relations: ["status", "category"],
    });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    if (actor?.actorRole === "customer" && issue.status?.name !== "BACKLOG") {
      throw new ForbiddenException("Customer can only delete issues in BACKLOG");
    }
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
    return issues.map((i) => ({
      ...this.toResponse(i),
      deletedAt: i.deletedAt,
      deletedBy: i.deletedBy,
      deletedByName: i.deletedByUser?.name ?? null,
    }));
  }

  private async resolveAutoAssign(categoryId: number): Promise<number | null> {
    const category = await this.categories.findOne({ where: { id: categoryId } });
    if (!category?.position) return null;

    const position = await this.positions.findOne({
      where: { name: category.position },
    });
    if (!position) return null;

    const programmers = await this.users
      .createQueryBuilder("user")
      .innerJoin("user.role", "role")
      .where("user.position_id = :positionId", { positionId: position.id })
      .andWhere("role.name = :roleName", { roleName: "programmer" })
      .andWhere("user.is_active = true")
      .getMany();

    if (programmers.length === 0) return null;

    const openCounts = await Promise.all(
      programmers.map(async (p) => {
        const count = await this.issues
          .createQueryBuilder("issue")
          .innerJoin("issue.status", "status")
          .where("issue.programmer_id = :pid", { pid: p.id })
          .andWhere("issue.deleted_at IS NULL")
          .andWhere("status.name != :done", { done: "DONE" })
          .getCount();
        return { userId: p.id, count };
      }),
    );

    openCounts.sort((a, b) => a.count - b.count);
    return openCounts[0].userId;
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
        actorId: data.actor?.actorId ?? null,
        actorName: data.actor?.actorName ?? null,
        actorRole: data.actor?.actorRole ?? null,
      }),
    );
  }

  private toResponse(issue: Issue) {
    return {
      id: issue.id,
      issueNumber: issue.issueNumber,
      title: issue.title,
      description: issue.description,
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
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  }
}
