import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IssueStatus } from "./entities/issue-status.entity";
import { Issue } from "../issues/entities/issue.entity";
import { paginate, PaginationParams } from "../../common/pagination";

@Injectable()
export class IssueStatusesService {
  constructor(
    @InjectRepository(IssueStatus)
    private readonly issueStatuses: Repository<IssueStatus>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
  ) {}

  async findAll(params: PaginationParams) {
    const statuses = await this.issueStatuses.find({ order: { sortOrder: "ASC", id: "ASC" } });
    const result = await Promise.all(
      statuses.map(async (s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        isActive: s.isActive,
        sortOrder: s.sortOrder,
        isTimerRunning: s.isTimerRunning,
        isEndStatus: s.isEndStatus,
        issueCount: await this.issues.count({ where: { statusId: s.id } }),
      })),
    );
    return paginate(result, params);
  }

  async create(data: {
    name: string;
    description?: string;
    sortOrder?: number;
    isTimerRunning?: boolean;
    isEndStatus?: boolean;
  }) {
    const existing = await this.issueStatuses.findOne({ where: { name: data.name } });
    if (existing) {
      throw new ConflictException(`Status "${data.name}" already exists`);
    }
    const maxOrder = await this.issueStatuses
      .createQueryBuilder("s")
      .select("MAX(s.sort_order)", "max")
      .getRawOne();
    const nextOrder = (maxOrder?.max ?? -1) + 1;
    const status = await this.issueStatuses.save(
      this.issueStatuses.create({
        name: data.name,
        description: data.description ?? null,
        isActive: true,
        sortOrder: data.sortOrder ?? nextOrder,
        isTimerRunning: data.isTimerRunning ?? false,
        isEndStatus: data.isEndStatus ?? false,
      }),
    );
    return {
      id: status.id,
      name: status.name,
      description: status.description,
      isActive: status.isActive,
      sortOrder: status.sortOrder,
      isTimerRunning: status.isTimerRunning,
      isEndStatus: status.isEndStatus,
    };
  }

  async update(
    id: number,
    data: {
      name?: string;
      description?: string;
      sortOrder?: number;
      isTimerRunning?: boolean;
      isEndStatus?: boolean;
    },
  ) {
    const status = await this.issueStatuses.findOne({ where: { id } });
    if (!status) {
      throw new NotFoundException(`Status with id ${id} not found`);
    }
    if (data.name !== undefined) {
      const existing = await this.issueStatuses.findOne({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Status "${data.name}" already exists`);
      }
      status.name = data.name;
    }
    if (data.description !== undefined) status.description = data.description;
    if (data.sortOrder !== undefined) status.sortOrder = data.sortOrder;
    if (data.isTimerRunning !== undefined) status.isTimerRunning = data.isTimerRunning;
    if (data.isEndStatus !== undefined) status.isEndStatus = data.isEndStatus;
    await this.issueStatuses.save(status);
    return {
      id: status.id,
      name: status.name,
      description: status.description,
      isActive: status.isActive,
      sortOrder: status.sortOrder,
      isTimerRunning: status.isTimerRunning,
      isEndStatus: status.isEndStatus,
    };
  }

  async reorder(items: Array<{ id: number; sortOrder: number }>) {
    await this.issueStatuses.manager.transaction(async (em) => {
      for (const item of items) {
        await em.update(IssueStatus, item.id, { sortOrder: item.sortOrder });
      }
    });
    return { reordered: items.length };
  }

  async updateActive(id: number, isActive: boolean) {
    const status = await this.issueStatuses.findOne({ where: { id } });
    if (!status) {
      throw new NotFoundException(`Status with id ${id} not found`);
    }
    status.isActive = isActive;
    await this.issueStatuses.save(status);
    return { id: status.id, name: status.name, isActive: status.isActive };
  }

  async check(id: number) {
    const status = await this.issueStatuses.findOne({ where: { id } });
    if (!status) {
      throw new NotFoundException(`Status with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { statusId: id } });
    return { canDelete: issueCount === 0, issueCount };
  }

  async remove(id: number) {
    const status = await this.issueStatuses.findOne({ where: { id } });
    if (!status) {
      throw new NotFoundException(`Status with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { statusId: id } });
    if (issueCount > 0) {
      throw new ConflictException(
        `Cannot delete status "${status.name}" because it has ${issueCount} issue(s) assigned`,
      );
    }
    await this.issueStatuses.delete(id);
    const remaining = await this.issueStatuses.find({ order: { sortOrder: "ASC", id: "ASC" } });
    await this.issueStatuses.manager.transaction(async (em) => {
      for (let i = 0; i < remaining.length; i++) {
        await em.update(IssueStatus, remaining[i].id, { sortOrder: i + 1 });
      }
    });
    return { deleted: true };
  }
}
