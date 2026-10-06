import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Board } from "./entities/board.entity";
import { BoardColumn } from "../columns/entities/board-column.entity";
import { Issue } from "../issues/entities/issue.entity";

@Injectable()
export class BoardsService {
  constructor(
    @InjectRepository(Board)
    private readonly boards: Repository<Board>,
    @InjectRepository(BoardColumn)
    private readonly columns: Repository<BoardColumn>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
  ) {}

  async findAll() {
    const boards = await this.boards.find({ order: { id: "ASC" } });
    const result = await Promise.all(
      boards.map(async (b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        columnCount: await this.columns.count({ where: { boardId: b.id } }),
      })),
    );
    return result;
  }

  async findOne(id: number) {
    const board = await this.boards.findOne({ where: { id } });
    if (!board) {
      throw new NotFoundException(`Board ${id} not found`);
    }
    const columns = await this.columns.find({
      where: { boardId: id },
      order: { position: "ASC" },
    });
    const columnIds = columns.map((c) => c.id);
    const issues = columnIds.length
      ? await this.issues.find({
          where: { columnId: In(columnIds) },
          order: { id: "ASC" },
        })
      : [];
    return {
      id: board.id,
      name: board.name,
      description: board.description,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
      columns: columns.map((c) => ({
        id: c.id,
        status: c.status,
        customName: c.customName,
        isHidden: c.isHidden,
        position: c.position,
        issueCount: issues.filter((i) => i.columnId === c.id).length,
      })),
      issues: issues.map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        columnId: i.columnId,
        statusId: i.statusId,
        priorityId: i.priorityId,
        programmerId: i.programmerId,
        customerId: i.customerId,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
      })),
    };
  }

  async create(name: string, description?: string) {
    const existing = await this.boards.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`Board "${name}" already exists`);
    }
    const board = await this.boards.save(
      this.boards.create({ name, description: description ?? null }),
    );
    return {
      id: board.id,
      name: board.name,
      description: board.description,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    };
  }

  async update(id: number, data: { name?: string; description?: string }) {
    const board = await this.boards.findOne({ where: { id } });
    if (!board) {
      throw new NotFoundException(`Board ${id} not found`);
    }
    if (data.name !== undefined) {
      const existing = await this.boards.findOne({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Board "${data.name}" already exists`);
      }
      board.name = data.name;
    }
    if (data.description !== undefined) {
      board.description = data.description;
    }
    await this.boards.save(board);
    return {
      id: board.id,
      name: board.name,
      description: board.description,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
    };
  }

  async remove(id: number) {
    const board = await this.boards.findOne({ where: { id } });
    if (!board) {
      throw new NotFoundException(`Board ${id} not found`);
    }
    const columnCount = await this.columns.count({ where: { boardId: id } });
    if (columnCount > 0) {
      throw new ConflictException(
        `Cannot delete board "${board.name}" because it has ${columnCount} column(s)`,
      );
    }
    await this.boards.delete(id);
    return { deleted: true };
  }
}
