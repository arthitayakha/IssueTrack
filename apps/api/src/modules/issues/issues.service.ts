import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DeepPartial, Not, IsNull, Repository } from "typeorm";
import { Issue } from "./entities/issue.entity";
import { BoardColumn } from "../columns/entities/board-column.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { User } from "../auth/entities/user.entity";
import { IssueStatus } from "../issue-statuses/entities/issue-status.entity";
import { Category } from "../categories/entities/category.entity";
import { Label } from "../labels/entities/label.entity";
import { WorkSessionsService } from "../work-sessions/work-sessions.service";
import { ActorInfo } from "../activity-logs/activity-logs.service";
import { paginate, PaginationParams } from "../../common/pagination";

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    @InjectRepository(BoardColumn)
    private readonly columns: Repository<BoardColumn>,
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
  ) {}

  async findAll(
    params: PaginationParams,
    statuses: number[] = [],
    user?: { id: string; roleName: string | null } | null,
    search?: string,
  ) {
    const qb = this.issues.createQueryBuilder("issue").where("issue.deleted_at IS NULL");

    if (statuses.length > 0) {
      qb.andWhere("issue.status_id IN (:...statuses)", { statuses });
    }

    if (user && user.roleName === "programmer") {
      qb.andWhere("issue.programmer_id = :uid", { uid: Number(user.id) });
    } else if (user && user.roleName === "customer") {
      qb.andWhere("issue.customer_id = :uid", { uid: Number(user.id) });
    }

    if (search && search.trim()) {
      qb.andWhere("(issue.title ILIKE :q OR issue.description ILIKE :q)", {
        q: `%${search.trim()}%`,
      });
    }

    qb.orderBy("issue.id", "ASC");

    const issues = await qb
      .leftJoinAndSelect("issue.priority", "priority")
      .leftJoinAndSelect("issue.category", "category")
      .leftJoinAndSelect("issue.label", "label")
      .leftJoinAndSelect("issue.labels", "labels")
      .leftJoinAndSelect("issue.programmer", "programmer")
      .leftJoinAndSelect("issue.customer", "customer")
      .getMany();

    const mapped = issues.map((i) => this.toResponse(i));
    return paginate(mapped, params);
  }

  async findOne(id: number) {
    const issue = await this.issues.findOne({
      where: { id },
      relations: ["label", "labels"],
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
      columnId: number;
      priorityId?: number;
      categoryId?: number;
      customCategory?: string;
      programmerId?: number;
      customerId?: number;
      labelId?: number;
    },
    actor?: ActorInfo | null,
  ) {
    const column = await this.columns.findOne({
      where: { id: data.columnId },
    });
    if (!column) {
      throw new NotFoundException(`Column ${data.columnId} not found`);
    }
    const status = await this.issueStatuses.findOne({
      where: { id: column.statusId },
    });
    const issue = this.issues.create({
      title: data.title,
      description: data.description,
      columnId: data.columnId,
      statusId: status?.id ?? null,
      priorityId: data.priorityId ?? null,
      categoryId: data.categoryId ?? null,
      customCategory: data.customCategory?.trim() || null,
      programmerId: data.programmerId ?? null,
      customerId: data.customerId ?? null,
      labelId: data.labelId ?? null,
    } as DeepPartial<Issue>);
    await this.issues.save(issue);
    await this.logActivity({
      action: "card.created",
      entityId: issue.id,
      detail: JSON.stringify({ title: issue.title }),
      actor,
    });
    return this.toResponse(issue);
  }

  async update(
    id: number,
    data: {
      title?: string;
      description?: string;
      priorityId?: number;
      categoryId?: number;
      labelId?: number;
      labelIds?: number[];
    },
    actor?: ActorInfo | null,
  ) {
    const issue = await this.issues.findOne({ where: { id } });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    const changes: string[] = [];
    if (data.title !== undefined && data.title !== issue.title) {
      issue.title = data.title;
      changes.push("title");
    }
    if (data.description !== undefined && data.description !== issue.description) {
      issue.description = data.description;
      changes.push("description");
    }
    if (data.priorityId !== undefined && data.priorityId !== issue.priorityId) {
      issue.priorityId = data.priorityId;
      changes.push("priority");
    }
    if (data.categoryId !== undefined && data.categoryId !== issue.categoryId) {
      issue.categoryId = data.categoryId;
      changes.push("category");
    }
    if (data.labelId !== undefined && data.labelId !== issue.labelId) {
      issue.labelId = data.labelId;
      changes.push("label");
    }
    if (data.labelIds !== undefined) {
      issue.labels = data.labelIds.length
        ? await this.labels.find({ where: data.labelIds.map((labelId) => ({ id: labelId })) })
        : [];
      changes.push("labels");
    }
    if (changes.length === 0) return this.toResponse(issue);
    await this.issues.save(issue);
    await this.logActivity({
      action: "card.edited",
      entityId: issue.id,
      detail: JSON.stringify({ fields: changes }),
      actor,
    });
    return this.toResponse(issue);
  }

  async move(id: number, columnId: number, actor?: ActorInfo | null) {
    const issue = await this.issues.findOne({ where: { id } });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    const targetColumn = await this.columns.findOne({ where: { id: columnId } });
    if (!targetColumn) {
      throw new NotFoundException(`Column ${columnId} not found`);
    }
    const sourceColumn = issue.columnId
      ? await this.columns.findOne({ where: { id: issue.columnId } })
      : null;
    if (issue.columnId === columnId) return this.toResponse(issue);

    issue.columnId = columnId;
    issue.completedAt = null;
    issue.isLocked = false;
    await this.issues.save(issue);
    await this.logActivity({
      action: "card.moved",
      entityId: issue.id,
      detail: JSON.stringify({
        from: sourceColumn?.status ?? null,
        to: targetColumn.status,
      }),
      actor,
    });
    return this.toResponse(issue);
  }

  async setActualFixDuration(id: number, duration: number) {
    const issue = await this.issues.findOne({ where: { id } });
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
    const issue = await this.issues.findOne({ where: { id } });
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
    issue.programmerId = programmerId;
    await this.issues.save(issue);
    await this.logActivity({
      action: "card.assigned",
      entityId: issue.id,
      detail: JSON.stringify({
        from: oldAssignee,
        to: programmerId,
      }),
      actor,
    });
    return this.toResponse(issue);
  }

  async unlock(id: number) {
    const issue = await this.issues.findOne({ where: { id } });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    issue.isLocked = false;
    await this.issues.save(issue);
    return this.toResponse(issue);
  }

  async remove(id: number, actor?: ActorInfo | null) {
    const issue = await this.issues.findOne({
      where: { id },
      relations: ["status"],
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
    await this.logActivity({
      action: "card.deleted",
      entityId: issue.id,
      detail: JSON.stringify({ title: issue.title }),
      actor,
    });
    return { deleted: true };
  }

  async restore(id: number, actor?: ActorInfo | null) {
    const issue = await this.issues.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!issue || !issue.deletedAt) {
      throw new NotFoundException(`Issue ${id} not found in trash`);
    }
    issue.deletedAt = null;
    issue.deletedBy = null;
    await this.issues.save(issue);
    await this.logActivity({
      action: "card.restored",
      entityId: issue.id,
      detail: JSON.stringify({ title: issue.title }),
      actor,
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
      title: issue.title,
      description: issue.description,
      columnId: issue.columnId,
      statusId: issue.statusId,
      priorityId: issue.priorityId,
      priorityName: issue.priority?.name ?? null,
      categoryId: issue.categoryId,
      categoryName: issue.category?.name ?? null,
      customCategory: issue.customCategory,
      labelId: issue.labelId,
      labelIds: (issue.labels ?? []).map((l) => l.id).sort((a, b) => a - b),
      labelName: issue.labels?.[0]?.name ?? issue.label?.name ?? null,
      labelColor: issue.labels?.[0]?.color ?? issue.label?.color ?? null,
      programmerId: issue.programmerId,
      programmerName: issue.programmer?.name ?? null,
      customerId: issue.customerId,
      customerName: issue.customer?.name ?? null,
      commentCount: issue.comments?.length ?? 0,
      attachmentCount: issue.attachments?.length ?? 0,
      trackedDuration: issue.trackedDuration,
      actualFixDuration: issue.actualFixDuration,
      assignedAt: issue.assignedAt,
      completedAt: issue.completedAt,
      isLocked: issue.isLocked,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  }
}
