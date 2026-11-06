import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Company } from "./entities/company.entity";
import { AppCompany } from "../apps/entities/app-company.entity";
import { paginate, PaginationParams } from "../../common/pagination";

/**
 * บริษัท CRUD — same contract as `AppsService` (unique name → 409, toggle
 * `is_visible`), plus `appCount`: since migration 1808 an app can belong to
 * several companies (`app_companies`), so a company is only deletable while
 * nothing points at it — the same guard apps already have over issues.
 *
 * นับด้วย `COUNT(DISTINCT app_id)` เพราะหลัง migration 1812 แถว = 1 ช่วงเวลา
 * ไม่ใช่ 1 คู่ — คู่เดิมมีได้หลายแถว และการนับแถวตรง ๆ จะปลอมเป็น "หลายแอป"
 */
@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(AppCompany)
    private readonly appCompanies: Repository<AppCompany>,
  ) {}

  async findAll(params: PaginationParams) {
    const companies = await this.companies.find({ order: { id: "ASC" } });
    // counted one by one — the same shape AppsService uses for `issueCount`,
    // and master data never holds more than a handful of rows
    const result = await Promise.all(
      companies.map(async (c) => ({
        id: c.id,
        name: c.name,
        isVisible: c.isVisible,
        appCount: await this.appCount(c.id),
      })),
    );
    return paginate(result, params);
  }

  async create(name: string) {
    const existing = await this.companies.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`Company "${name}" already exists`);
    }
    const company = await this.companies.save(
      this.companies.create({ name, isVisible: true }),
    );
    return {
      id: company.id,
      name: company.name,
      isVisible: company.isVisible,
      appCount: 0,
    };
  }

  async update(id: number, data: { name?: string }) {
    const company = await this.companies.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
    if (data.name !== undefined) {
      const existing = await this.companies.findOne({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Company "${data.name}" already exists`);
      }
      company.name = data.name;
    }
    await this.companies.save(company);
    return {
      id: company.id,
      name: company.name,
      isVisible: company.isVisible,
      appCount: await this.appCount(id),
    };
  }

  async updateActive(id: number, isActive: boolean) {
    const company = await this.companies.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
    company.isVisible = isActive;
    await this.companies.save(company);
    return {
      id: company.id,
      name: company.name,
      isVisible: company.isVisible,
      appCount: await this.appCount(id),
    };
  }

  /** Pre-flight for the delete dialog — `canDelete` drives the confirm button. */
  async check(id: number) {
    const company = await this.companies.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
    const appCount = await this.appCount(id);
    return { canDelete: appCount === 0, appCount };
  }

  async remove(id: number) {
    const company = await this.companies.findOne({ where: { id } });
    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
    const appCount = await this.appCount(id);
    if (appCount > 0) {
      throw new ConflictException(
        `Cannot delete company "${company.name}" because ${appCount} app(s) still use it`,
      );
    }
    await this.companies.delete(id);
    return { deleted: true };
  }

  /**
   * จำนวน **แอป** ที่ผูกกับบริษัทนี้ — ต้องนับ `DISTINCT app_id` เพราะหลัง
   * migration 1812 คู่เดิมมีได้หลายแถว (หลายช่วงเวลา) การนับแถวตรง ๆ จะ
   * ทำให้แท็บบริษัทโชว์ "จำนวนแอป" ผิด (เช่น 1 แอป มี 2 ช่วง = นับเป็น 2)
   */
  private async appCount(companyId: number): Promise<number> {
    const row = await this.appCompanies
      .createQueryBuilder("ac")
      .select("COUNT(DISTINCT ac.app_id)", "n")
      .where("ac.company_id = :companyId", { companyId })
      .getRawOne<{ n: string }>();
    return Number(row?.n ?? 0);
  }
}
