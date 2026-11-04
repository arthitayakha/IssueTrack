import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { App } from "./entities/app.entity";
import { AppCompany } from "./entities/app-company.entity";
import { Company } from "../companies/entities/company.entity";
import { Issue } from "../issues/entities/issue.entity";
import { AppExpiryService } from "./app-expiry.service";
import { isIsoDate, toIsoDate } from "../../common/dates";
import { paginate, PaginationParams } from "../../common/pagination";

/** 1 แถวของตารางย่อยในฟอร์ม — บริษัท 1 แห่ง พร้อมวันที่ของตัวเอง */
export interface AppCompanyInput {
  /** บริษัทที่ผูก — อย่างน้อย 1 รายการต่อการบันทึก */
  id?: number | null;
  /** `YYYY-MM-DD` — วันที่เริ่มใช้งานของคู่นี้, `null` = ยังไม่กรอก */
  startedAt?: string | null;
  /** `YYYY-MM-DD` — วันหมดอายุของคู่นี้, `null` = ไม่กำหนด */
  expiresAt?: string | null;
}

/** What `POST /apps` / `PATCH /apps/:id` accept. */
export interface AppWriteInput {
  name?: string;
  /** อย่างน้อย 1 รายการ · `undefined` = คงเดิมไว้ (PATCH ที่ไม่ได้แตะบริษัท) */
  companies?: AppCompanyInput[];
}

/** แถวเชื่อมหลัง validate — id ตรวจแล้ว วันที่ normalize เป็น `YYYY-MM-DD` แล้ว */
interface AppLinkInput {
  companyId: number;
  startedAt: string | null;
  expiresAt: string | null;
}

/** แถวเชื่อม + ชื่อบริษัทที่ join มาแล้ว — ใช้ทั้งตอนทำ response และแจ้งเตือน */
interface LoadedLinks {
  links: AppCompany[];
  companyName: Map<number, string>;
}

@Injectable()
export class AppsService {
  constructor(
    @InjectRepository(App)
    private readonly apps: Repository<App>,
    @InjectRepository(AppCompany)
    private readonly appCompanies: Repository<AppCompany>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly expiry: AppExpiryService,
  ) {}

  async findAll(params: PaginationParams) {
    const apps = await this.apps.find({ order: { id: "ASC" } });
    const { links, companyName } = await this.loadLinks();
    const linksByApp = this.groupByApp(links);

    // The tab is the most reliable clock we have: refresh each pair's stored
    // status (and ring the bell on a transition) while the list is being built.
    for (const app of apps) {
      for (const link of linksByApp.get(app.id) ?? []) {
        await this.expiry.reconcile(link, {
          appName: app.name,
          companyName: companyName.get(link.companyId) ?? "",
        });
      }
    }

    const result = await Promise.all(
      apps.map(async (a) => ({
        id: a.id,
        name: a.name,
        isVisible: a.isVisible,
        companies: this.companyLinks(linksByApp.get(a.id) ?? [], companyName),
        createdAt: a.createdAt,
        issueCount: await this.issues.count({ where: { appId: a.id } }),
      })),
    );
    return paginate(result, params);
  }

  async create(data: AppWriteInput) {
    if (!data.name) {
      throw new BadRequestException("App name is required");
    }
    const existing = await this.apps.findOne({ where: { name: data.name } });
    if (existing) {
      throw new ConflictException(`App "${data.name}" already exists`);
    }
    const wanted = await this.resolveCompanies(data.companies);
    const app = await this.apps.save(
      this.apps.create({ name: data.name, isVisible: true }),
    );
    await this.writeLinks(app.id, wanted);

    const { links, companyName } = await this.loadLinks([app.id]);
    for (const link of links) {
      await this.expiry.reconcile(link, {
        appName: app.name,
        companyName: companyName.get(link.companyId) ?? "",
      });
    }
    return this.toResponse(app, links, companyName);
  }

  async update(id: number, data: AppWriteInput) {
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

    // `undefined` = leave the join rows alone (a partial PATCH must not wipe them)
    if (data.companies !== undefined) {
      await this.writeLinks(id, await this.resolveCompanies(data.companies));
    }

    const { links, companyName } = await this.loadLinks([id]);
    for (const link of links) {
      await this.expiry.reconcile(link, {
        appName: app.name,
        companyName: companyName.get(link.companyId) ?? "",
      });
    }
    return this.toResponse(app, links, companyName);
  }

  async updateActive(id: number, isActive: boolean) {
    const app = await this.apps.findOne({ where: { id } });
    if (!app) {
      throw new NotFoundException(`App with id ${id} not found`);
    }
    // column-only write: never rewrites the join rows
    await this.apps.update({ id }, { isVisible: isActive });
    app.isVisible = isActive;
    const { links, companyName } = await this.loadLinks([id]);
    return this.toResponse(app, links, companyName);
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
    await this.apps.delete(id); // `app_companies` goes with it (ON DELETE CASCADE)
    return { deleted: true };
  }

  /**
   * The form posts the whole list of pairs. At least one company is required
   * and every id must exist — a silent partial match would unlink companies
   * the user never deselected — and each date is validated here so a bad one
   * never reaches `app_companies`.
   */
  private async resolveCompanies(rows?: AppCompanyInput[]): Promise<AppLinkInput[]> {
    if (!Array.isArray(rows)) {
      throw new BadRequestException("At least one company is required");
    }
    const seen = new Set<number>();
    const wanted: AppLinkInput[] = [];
    for (const row of rows) {
      const id = Number(row?.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new BadRequestException("One or more companies are invalid");
      }
      if (seen.has(id)) {
        throw new BadRequestException(`Company ${id} is listed twice`);
      }
      seen.add(id);
      wanted.push({
        companyId: id,
        startedAt: this.normalizeDate(row.startedAt, "startedAt"),
        expiresAt: this.normalizeDate(row.expiresAt, "expiresAt"),
      });
    }
    if (wanted.length === 0) {
      throw new BadRequestException("At least one company is required");
    }
    const companies = await this.companies.find({ where: { id: In([...seen]) } });
    if (companies.length !== seen.size) {
      throw new BadRequestException("One or more companies do not exist");
    }
    return wanted;
  }

  /**
   * Sync the join rows with what the form sent: keep the pairs still listed
   * (touching only their dates), insert the new ones, drop the rest.
   *
   * Never rebuilds the table from scratch — that would reset
   * `expiry_notified` on pairs the user never touched and re-ring their
   * bells. A changed date is left for `reconcile()` to interpret (it decides
   * whether the announcement column resets or advances).
   */
  private async writeLinks(appId: number, wanted: AppLinkInput[]): Promise<void> {
    const existing = await this.appCompanies.find({ where: { appId } });
    const held = new Map(existing.map((row) => [row.companyId, row]));
    const keep = new Set<number>();

    for (const row of wanted) {
      keep.add(row.companyId);
      const current = held.get(row.companyId);
      if (!current) {
        await this.appCompanies.insert({
          appId,
          companyId: row.companyId,
          startedAt: row.startedAt,
          expiresAt: row.expiresAt,
          expiryStatus: "none",
          expiryNotified: "none",
        });
        continue;
      }
      const started = current.startedAt ? toIsoDate(current.startedAt) : null;
      const expires = current.expiresAt ? toIsoDate(current.expiresAt) : null;
      if (started !== row.startedAt || expires !== row.expiresAt) {
        await this.appCompanies.update(
          { appId, companyId: row.companyId },
          { startedAt: row.startedAt, expiresAt: row.expiresAt },
        );
      }
    }

    for (const row of existing) {
      if (!keep.has(row.companyId)) {
        await this.appCompanies.delete({ appId, companyId: row.companyId });
      }
    }
  }

  /** `undefined` / `null` / `""` = leave it empty; anything else must be a date. */
  private normalizeDate(
    value: string | null | undefined,
    field: "startedAt" | "expiresAt",
  ): string | null {
    if (value === undefined || value === null || value === "") return null;
    if (!isIsoDate(value)) {
      throw new BadRequestException(`${field} must be a YYYY-MM-DD date`);
    }
    return value;
  }

  /**
   * Join rows + every company name, in two queries. Master data holds a
   * handful of rows, and the names are needed both for the chips and for the
   * notification text — `AppCompany` maps no relation on purpose.
   */
  private async loadLinks(appIds?: number[]): Promise<LoadedLinks> {
    const links = await this.appCompanies.find(
      appIds ? { where: { appId: In(appIds) } } : {},
    );
    const companies = await this.companies.find();
    return {
      links,
      companyName: new Map(companies.map((c) => [c.id, c.name])),
    };
  }

  private groupByApp(links: AppCompany[]): Map<number, AppCompany[]> {
    const grouped = new Map<number, AppCompany[]>();
    for (const link of links) {
      const bucket = grouped.get(link.appId);
      if (bucket) bucket.push(link);
      else grouped.set(link.appId, [link]);
    }
    return grouped;
  }

  /** คู่ทั้งหมดของแอป เรียงตามชื่อบริษัท — นี่คือสิ่งที่ชิปในตารางโชว์ */
  private companyLinks(links: AppCompany[], companyName: Map<number, string>) {
    return links
      .map((link) => ({
        id: link.companyId,
        name: companyName.get(link.companyId) ?? "",
        startedAt: link.startedAt ? toIsoDate(link.startedAt) : null,
        expiresAt: link.expiresAt ? toIsoDate(link.expiresAt) : null,
        expiryStatus: link.expiryStatus,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }

  private toResponse(app: App, links: AppCompany[], companyName: Map<number, string>) {
    return {
      id: app.id,
      name: app.name,
      isVisible: app.isVisible,
      companies: this.companyLinks(links, companyName),
      createdAt: app.createdAt,
    };
  }
}
