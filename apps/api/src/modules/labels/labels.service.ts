import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Label } from "./entities/label.entity";
import { Issue } from "../issues/entities/issue.entity";
import { paginate, PaginationParams } from "../../common/pagination";

@Injectable()
export class LabelsService {
  constructor(
    @InjectRepository(Label)
    private readonly labels: Repository<Label>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
  ) {}

  async findAll(params: PaginationParams) {
    const labels = await this.labels.find({ order: { id: "ASC" } });
    const result = await Promise.all(
      labels.map(async (l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        isActive: l.isActive,
        issueCount: await this.issues.count({ where: { labelId: l.id } }),
      })),
    );
    return paginate(result, params);
  }

  async create(name: string, color: string) {
    const existing = await this.labels.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`Label "${name}" already exists`);
    }
    const label = await this.labels.save(
      this.labels.create({ name, color, isActive: true }),
    );
    return {
      id: label.id,
      name: label.name,
      color: label.color,
      isActive: label.isActive,
    };
  }

  async update(id: number, data: { name?: string; color?: string }) {
    const label = await this.labels.findOne({ where: { id } });
    if (!label) {
      throw new NotFoundException(`Label with id ${id} not found`);
    }
    if (data.name !== undefined) {
      const existing = await this.labels.findOne({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Label "${data.name}" already exists`);
      }
      label.name = data.name;
    }
    if (data.color !== undefined) {
      label.color = data.color;
    }
    await this.labels.save(label);
    return {
      id: label.id,
      name: label.name,
      color: label.color,
      isActive: label.isActive,
    };
  }

  async updateActive(id: number, isActive: boolean) {
    const label = await this.labels.findOne({ where: { id } });
    if (!label) {
      throw new NotFoundException(`Label with id ${id} not found`);
    }
    label.isActive = isActive;
    await this.labels.save(label);
    return { id: label.id, name: label.name, isActive: label.isActive };
  }

  async check(id: number) {
    const label = await this.labels.findOne({ where: { id } });
    if (!label) {
      throw new NotFoundException(`Label with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { labelId: id } });
    return { canDelete: issueCount === 0, issueCount };
  }

  async remove(id: number) {
    const label = await this.labels.findOne({ where: { id } });
    if (!label) {
      throw new NotFoundException(`Label with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { labelId: id } });
    if (issueCount > 0) {
      throw new ConflictException(
        `Cannot delete label "${label.name}" because it has ${issueCount} issue(s) assigned`,
      );
    }
    await this.labels.delete(id);
    return { deleted: true };
  }
}
