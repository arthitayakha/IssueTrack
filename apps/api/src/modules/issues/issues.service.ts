import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DeepPartial, In, Repository } from "typeorm";
import { Issue } from "./entities/issue.entity";
import { BoardColumn } from "../columns/entities/board-column.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { User } from "../auth/entities/user.entity";
import { IssueStatus } from "../issue-statuses/entities/issue-status.entity";
import { WorkSessionsService } from "../work-sessions/work-sessions.service";

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
    private readonly workSessions: WorkSessionsService,
  ) {}

  async findByBoard(boardId: number) {
    const columns = await this.columns.find({
      where: { boardId },
      order: { position: "ASC" },
    });
    const columnIds = columns.map((c) => c.id);
    if (!columnIds.length) return [];
    const issues = await this.issues.find({
      where: { columnId: In(columnIds) },
      order: { id: "ASC" },
    });
    return issues.map((i) => this.toResponse(i));
  }

  async findOne(id: number) {
    const issue = await this.issues.findOne({ where: { id } });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    return this.toResponse(issue);
  }

  async create(
    boardId: number,
    data: {
      title: string;
      description: string;
      columnId: number;
      priorityId?: number;
      categoryId?: number;
      programmerId?: number;
      customerId?: number;
    },
  ) {
    const column = await this.columns.findOne({
      where: { id: data.columnId, boardId },
    });
    if (!column) {
      throw new NotFoundException(`Column ${data.columnId} not found in board ${boardId}`);
    }
    const issue = this.issues.create({
      title: data.title,
      description: data.description,
      columnId: data.columnId,
      priorityId: data.priorityId ?? null,
      categoryId: data.categoryId ?? null,
      programmerId: data.programmerId ?? null,
      customerId: data.customerId ?? null,
    } as DeepPartial<Issue>);
    await this.issues.save(issue);
    await this.logActivity({
      action: "card.created",
      boardId,
      entityId: issue.id,
      detail: JSON.stringify({ title: issue.title }),
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
    },
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
    if (changes.length === 0) return this.toResponse(issue);
    await this.issues.save(issue);
    await this.logActivity({
      action: "card.edited",
      boardId: issue.columnId
        ? (await this.columns.findOne({ where: { id: issue.columnId } }))?.boardId ?? null
        : null,
      entityId: issue.id,
      detail: JSON.stringify({ fields: changes }),
    });
    return this.toResponse(issue);
  }

  async move(id: number, columnId: number) {
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

    const sourceStatus = sourceColumn
      ? await this.issueStatuses.findOne({ where: { name: sourceColumn.status } })
      : null;
    const targetStatus = await this.issueStatuses.findOne({
      where: { name: targetColumn.status },
    });

    if (sourceStatus?.isTimerRunning && !targetStatus?.isTimerRunning) {
      await this.workSessions.stop(id);
    }
    if (!sourceStatus?.isTimerRunning && targetStatus?.isTimerRunning) {
      await this.workSessions.start(id, issue.programmerId ?? 0);
    }

    issue.columnId = columnId;
    if (targetStatus?.isEndStatus) {
      issue.completedAt = new Date();
      await this.workSessions.stop(id);
    } else {
      issue.completedAt = null;
    }
    await this.issues.save(issue);
    await this.recalculateTrackedDuration(id);
    await this.logActivity({
      action: "card.moved",
      boardId: targetColumn.boardId,
      entityId: issue.id,
      detail: JSON.stringify({
        from: sourceColumn?.status ?? null,
        to: targetColumn.status,
      }),
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

  async assign(id: number, programmerId: number | null) {
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
    const column = issue.columnId
      ? await this.columns.findOne({ where: { id: issue.columnId } })
      : null;
    await this.logActivity({
      action: "card.assigned",
      boardId: column?.boardId ?? null,
      entityId: issue.id,
      detail: JSON.stringify({
        from: oldAssignee,
        to: programmerId,
      }),
    });
    return this.toResponse(issue);
  }

  async remove(id: number) {
    const issue = await this.issues.findOne({ where: { id } });
    if (!issue) {
      throw new NotFoundException(`Issue ${id} not found`);
    }
    const column = issue.columnId
      ? await this.columns.findOne({ where: { id: issue.columnId } })
      : null;
    await this.logActivity({
      action: "card.deleted",
      boardId: column?.boardId ?? null,
      entityId: issue.id,
      detail: JSON.stringify({ title: issue.title }),
    });
    await this.issues.delete(id);
    return { deleted: true };
  }

  private async logActivity(data: {
    action: string;
    boardId: number | null;
    entityId: number;
    detail: string;
  }) {
    await this.activityLogs.save(
      this.activityLogs.create({
        action: data.action,
        boardId: data.boardId,
        entityId: data.entityId,
        detail: data.detail,
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
      categoryId: issue.categoryId,
      programmerId: issue.programmerId,
      customerId: issue.customerId,
      trackedDuration: issue.trackedDuration,
      actualFixDuration: issue.actualFixDuration,
      assignedAt: issue.assignedAt,
      completedAt: issue.completedAt,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    };
  }
}
