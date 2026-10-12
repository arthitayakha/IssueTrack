import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BoardColumn } from "./entities/board-column.entity";
import { Issue } from "../issues/entities/issue.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { IssueStatus } from "../issue-statuses/entities/issue-status.entity";
import { paginate, PaginationParams } from "../../common/pagination";

@Injectable()
export class ColumnsService {
  constructor(
    @InjectRepository(BoardColumn)
    private readonly columns: Repository<BoardColumn>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    @InjectRepository(ActivityLog)
    private readonly activityLogs: Repository<ActivityLog>,
    @InjectRepository(IssueStatus)
    private readonly issueStatuses: Repository<IssueStatus>,
  ) {}

  async findAll(params: PaginationParams) {
    const columns = await this.columns
      .createQueryBuilder("col")
      .leftJoinAndSelect("col.status", "status")
      .orderBy("status.sort_order", "ASC")
      .addOrderBy("col.position", "ASC")
      .getMany();
    const result = await Promise.all(
      columns.map(async (c) => ({
        id: c.id,
        statusId: c.statusId,
        statusName: c.status?.name ?? "",
        customName: c.customName,
        isHidden: c.isHidden,
        isLocked: c.isLocked,
        position: c.position,
        issueCount: await this.issues.count({ where: { columnId: c.id } }),
      })),
    );
    return paginate(result, params);
  }

  async create(statusId: number) {
    const status = await this.issueStatuses.findOne({ where: { id: statusId } });
    if (!status) {
      throw new NotFoundException(`Issue status ${statusId} not found`);
    }
    const maxPosition = await this.columns
      .createQueryBuilder("col")
      .select("MAX(col.position)", "max")
      .getRawOne();
    const nextPosition = Math.max(status.sortOrder, (maxPosition?.max ?? 0) + 1);
    const column = await this.columns.save(
      this.columns.create({
        statusId: status.id,
        position: nextPosition,
      }),
    );
    return {
      id: column.id,
      statusId: column.statusId,
      statusName: status.name,
      customName: column.customName,
      isHidden: column.isHidden,
      isLocked: column.isLocked,
      position: column.position,
    };
  }

  async update(
    id: number,
    data: { customName?: string; isHidden?: boolean; isLocked?: boolean; position?: number },
  ) {
    const column = await this.columns.findOne({ where: { id } });
    if (!column) {
      throw new NotFoundException(`Column ${id} not found`);
    }
    if (data.customName !== undefined) column.customName = data.customName;
    if (data.isHidden !== undefined) column.isHidden = data.isHidden;
    if (data.isLocked !== undefined) column.isLocked = data.isLocked;
    if (data.position !== undefined) column.position = data.position;
    await this.columns.save(column);
    const status = column.statusId
      ? await this.issueStatuses.findOne({ where: { id: column.statusId } })
      : null;
    return {
      id: column.id,
      statusId: column.statusId,
      statusName: status?.name ?? "",
      customName: column.customName,
      isHidden: column.isHidden,
      isLocked: column.isLocked,
      position: column.position,
    };
  }

  async reorder(items: Array<{ id: number; position: number }>) {
    await this.columns.manager.transaction(async (em) => {
      for (const item of items) {
        await em.update(BoardColumn, item.id, { position: item.position });
      }
    });
    return { reordered: items.length };
  }

  async remove(id: number) {
    const column = await this.columns.findOne({ where: { id } });
    if (!column) {
      throw new NotFoundException(`Column ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { columnId: id } });
    if (issueCount > 0) {
      const status = await this.issueStatuses.findOne({ where: { id: column.statusId } });
      throw new ConflictException(
        `Cannot delete column "${status?.name ?? column.statusId}" because it has ${issueCount} issue(s)`,
      );
    }
    await this.columns.delete(id);
    return { deleted: true };
  }
}
