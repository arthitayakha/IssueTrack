import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IssuePriority } from "./entities/issue-priority.entity";
import { Issue } from "../issues/entities/issue.entity";

@Injectable()
export class IssuePrioritiesService {
  constructor(
    @InjectRepository(IssuePriority)
    private readonly issuePriorities: Repository<IssuePriority>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
  ) {}

  async findAll() {
    const priorities = await this.issuePriorities.find({ order: { sortOrder: "ASC", id: "ASC" } });
    const result = await Promise.all(
      priorities.map(async (p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        sortOrder: p.sortOrder,
        isActive: p.isActive,
        issueCount: await this.issues.count({ where: { priorityId: p.id } }),
      })),
    );
    return result;
  }

  async create(data: {
    name: string;
    description?: string;
    sortOrder?: number;
  }) {
    const existing = await this.issuePriorities.findOne({ where: { name: data.name } });
    if (existing) {
      throw new ConflictException(`Priority "${data.name}" already exists`);
    }
    const priority = await this.issuePriorities.save(
      this.issuePriorities.create({
        name: data.name,
        description: data.description ?? null,
        sortOrder: data.sortOrder ?? 0,
        isActive: true,
      }),
    );
    return {
      id: priority.id,
      name: priority.name,
      description: priority.description,
      sortOrder: priority.sortOrder,
      isActive: priority.isActive,
    };
  }

  async update(
    id: number,
    data: {
      name?: string;
      description?: string;
      sortOrder?: number;
    },
  ) {
    const priority = await this.issuePriorities.findOne({ where: { id } });
    if (!priority) {
      throw new NotFoundException(`Priority with id ${id} not found`);
    }
    if (data.name !== undefined) {
      const existing = await this.issuePriorities.findOne({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Priority "${data.name}" already exists`);
      }
      priority.name = data.name;
    }
    if (data.description !== undefined) priority.description = data.description;
    if (data.sortOrder !== undefined) priority.sortOrder = data.sortOrder;
    await this.issuePriorities.save(priority);
    return {
      id: priority.id,
      name: priority.name,
      description: priority.description,
      sortOrder: priority.sortOrder,
      isActive: priority.isActive,
    };
  }

  async updateActive(id: number, isActive: boolean) {
    const priority = await this.issuePriorities.findOne({ where: { id } });
    if (!priority) {
      throw new NotFoundException(`Priority with id ${id} not found`);
    }
    priority.isActive = isActive;
    await this.issuePriorities.save(priority);
    return { id: priority.id, name: priority.name, isActive: priority.isActive };
  }

  async check(id: number) {
    const priority = await this.issuePriorities.findOne({ where: { id } });
    if (!priority) {
      throw new NotFoundException(`Priority with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { priorityId: id } });
    return { canDelete: issueCount === 0, issueCount };
  }

  async remove(id: number) {
    const priority = await this.issuePriorities.findOne({ where: { id } });
    if (!priority) {
      throw new NotFoundException(`Priority with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { priorityId: id } });
    if (issueCount > 0) {
      throw new ConflictException(
        `Cannot delete priority "${priority.name}" because it has ${issueCount} issue(s) assigned`,
      );
    }
    await this.issuePriorities.delete(id);
    return { deleted: true };
  }
}
