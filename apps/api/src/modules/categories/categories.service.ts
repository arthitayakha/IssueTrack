import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Category } from "./entities/category.entity";
import { Issue } from "../issues/entities/issue.entity";
import { paginateTotal, PaginationParams } from "../../common/pagination";

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
  ) {}

  async findAll(params: PaginationParams) {
    /** SQL page — เดิมโหลดทุกแถว + `issueCount` รายแถว แล้วค่อย slice (ดู companies) */
    const [rows, total] = await this.categories.findAndCount({
      order: { id: "ASC" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });
    const result = await Promise.all(
      rows.map(async (c) => ({
        id: c.id,
        name: c.name,
        isVisible: c.isVisible,
        issueCount: await this.issues.count({ where: { categoryId: c.id } }),
      })),
    );
    return paginateTotal(result, total, params);
  }

  async create(name: string) {
    const existing = await this.categories.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`Category "${name}" already exists`);
    }
    const category = await this.categories.save(
      this.categories.create({ name, isVisible: true }),
    );
    return {
      id: category.id,
      name: category.name,
      isVisible: category.isVisible,
    };
  }

  async update(id: number, data: { name?: string }) {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    if (data.name !== undefined) {
      const existing = await this.categories.findOne({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Category "${data.name}" already exists`);
      }
      category.name = data.name;
    }
    await this.categories.save(category);
    return {
      id: category.id,
      name: category.name,
      isVisible: category.isVisible,
    };
  }

  async updateActive(id: number, isActive: boolean) {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    category.isVisible = isActive;
    await this.categories.save(category);
    return { id: category.id, name: category.name, isVisible: category.isVisible };
  }

  async check(id: number) {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { categoryId: id } });
    return { canDelete: issueCount === 0, issueCount };
  }

  async remove(id: number) {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { categoryId: id } });
    if (issueCount > 0) {
      throw new ConflictException(
        `Cannot delete category "${category.name}" because it has ${issueCount} issue(s) assigned`,
      );
    }
    await this.categories.delete(id);
    return { deleted: true };
  }
}
