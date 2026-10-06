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

@Injectable()
export class ColumnsService {
  constructor(
    @InjectRepository(BoardColumn)
    private readonly columns: Repository<BoardColumn>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    @InjectRepository(ActivityLog)
    private readonly activityLogs: Repository<ActivityLog>,
  ) {}

  async findByBoard(boardId: number) {
    const columns = await this.columns.find({
      where: { boardId },
      order: { position: "ASC" },
    });
    const result = await Promise.all(
      columns.map(async (c) => ({
        id: c.id,
        boardId: c.boardId,
        status: c.status,
        customName: c.customName,
        isHidden: c.isHidden,
        position: c.position,
        issueCount: await this.issues.count({ where: { columnId: c.id } }),
      })),
    );
    return result;
  }

  async create(boardId: number, status: string, customName?: string) {
    const existing = await this.columns.findOne({
      where: { boardId, status },
    });
    if (existing) {
      throw new ConflictException(
        `Column with status "${status}" already exists in this board`,
      );
    }
    const maxPosition = await this.columns
      .createQueryBuilder("col")
      .select("MAX(col.position)", "max")
      .where("col.boardId = :boardId", { boardId })
      .getRawOne();
    const position = (maxPosition?.max ?? -1) + 1;
    const column = await this.columns.save(
      this.columns.create({
        boardId,
        status,
        customName: customName ?? null,
        position,
      }),
    );
    return {
      id: column.id,
      boardId: column.boardId,
      status: column.status,
      customName: column.customName,
      isHidden: column.isHidden,
      position: column.position,
    };
  }

  async update(
    id: number,
    data: { customName?: string; isHidden?: boolean; position?: number },
  ) {
    const column = await this.columns.findOne({ where: { id } });
    if (!column) {
      throw new NotFoundException(`Column ${id} not found`);
    }
    if (data.customName !== undefined) column.customName = data.customName;
    if (data.isHidden !== undefined) column.isHidden = data.isHidden;
    if (data.position !== undefined) column.position = data.position;
    await this.columns.save(column);
    return {
      id: column.id,
      boardId: column.boardId,
      status: column.status,
      customName: column.customName,
      isHidden: column.isHidden,
      position: column.position,
    };
  }

  async remove(id: number) {
    const column = await this.columns.findOne({ where: { id } });
    if (!column) {
      throw new NotFoundException(`Column ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { columnId: id } });
    if (issueCount > 0) {
      throw new ConflictException(
        `Cannot delete column "${column.status}" because it has ${issueCount} issue(s)`,
      );
    }
    await this.columns.delete(id);
    return { deleted: true };
  }
}
