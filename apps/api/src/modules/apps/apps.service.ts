import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { App } from "./entities/app.entity";
import { Issue } from "../issues/entities/issue.entity";
import { paginate, PaginationParams } from "../../common/pagination";

@Injectable()
export class AppsService {
  constructor(
    @InjectRepository(App)
    private readonly apps: Repository<App>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
  ) {}

  async findAll(params: PaginationParams) {
    const apps = await this.apps.find({ order: { id: "ASC" } });
    const result = await Promise.all(
      apps.map(async (a) => ({
        id: a.id,
        name: a.name,
        isVisible: a.isVisible,
        issueCount: await this.issues.count({ where: { appId: a.id } }),
      })),
    );
    return paginate(result, params);
  }

  async create(name: string) {
    const existing = await this.apps.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`App "${name}" already exists`);
    }
    const app = await this.apps.save(
      this.apps.create({ name, isVisible: true }),
    );
    return {
      id: app.id,
      name: app.name,
      isVisible: app.isVisible,
    };
  }

  async update(id: number, data: { name?: string }) {
    const app = await this.apps.findOne({ where: { id } });
    if (!app) {
      throw new NotFoundException(`App with id ${id} not found`);
    }
    if (data.name !== undefined) {
      const existing = await this.apps.findOne({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`App "${data.name}" already exists`);
      }
      app.name = data.name;
    }
    await this.apps.save(app);
    return {
      id: app.id,
      name: app.name,
      isVisible: app.isVisible,
    };
  }

  async updateActive(id: number, isActive: boolean) {
    const app = await this.apps.findOne({ where: { id } });
    if (!app) {
      throw new NotFoundException(`App with id ${id} not found`);
    }
    app.isVisible = isActive;
    await this.apps.save(app);
    return { id: app.id, name: app.name, isVisible: app.isVisible };
  }

  async check(id: number) {
    const app = await this.apps.findOne({ where: { id } });
    if (!app) {
      throw new NotFoundException(`App with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { appId: id } });
    return { canDelete: issueCount === 0, issueCount };
  }

  async remove(id: number) {
    const app = await this.apps.findOne({ where: { id } });
    if (!app) {
      throw new NotFoundException(`App with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { appId: id } });
    if (issueCount > 0) {
      throw new ConflictException(
        `Cannot delete app "${app.name}" because it has ${issueCount} issue(s) assigned`,
      );
    }
    await this.apps.delete(id);
    return { deleted: true };
  }
}
