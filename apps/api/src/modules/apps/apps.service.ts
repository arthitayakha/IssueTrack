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

/**
 * 1 รายการข้อมูลที่ฟอร์มส่งมา — **append หรือแก้แถวเดียว** ไม่ใช่ส่ง list
 * ทั้งชุดมาแทนที่ (คู่เดิมมีได้หลายช่วงเวลาหลัง migration 1812)
 */
export interface AppRecordInput {
  /** บริษัทของรายการนี้ — ตอนเพิ่มต้องระบุ · ตอนแก้ไขส่งมา = เปลี่ยนบริษัท */
  companyId?: number | null;
  /** `YYYY-MM-DD` — วันที่เริ่มใช้งานของช่วงนี้, `null` = ยังไม่กรอก */
  startedAt?: string | null;
  /** `YYYY-MM-DD` — วันหมดอายุของช่วงนี้, `null` = ไม่กำหนด */
  expiresAt?: string | null;
  /** ชั่วโมง MA ของช่วงนี้, `null` = ยังไม่กำหนด · รับ string ด้วย (ช่องกรอกในฟอร์ม) */
  maHours?: number | string | null;
}

/** What `POST /apps` / `PATCH /apps/:id` accept — **ชื่อล้วน** (แท็บแอปใน `/master-data`) */
export interface AppWriteInput {
  name?: string;
}

/**
 * payload ของ `POST /apps/:id/companies/:recordId/renew` — **ครบทั้ง 3 ฟิลด์**
 * (ต่างจาก `AppRecordInput` ที่ทุกช่อง optional เพราะเป็น PATCH semantics)
 *
 * การต่ออายุ = ปิดช่วงเก่า แล้วเปิดช่วงใหม่ให้คู่เดิม — ช่วงใหม่ต้องมี
 * วันที่ครบทุกช่อง ไม่งั้นจะเกิดช่วงกำพร้าที่ status คำนวณไม่ได้
 */
export interface AppRenewInput {
  /** `YYYY-MM-DD` — วันที่เริ่มใช้งานของช่วงใหม่ (บังคับ) */
  startedAt?: string | null;
  /** `YYYY-MM-DD` — วันหมดอายุของช่วงใหม่ (บังคับ, ต้องมากกว่า `startedAt`) */
  expiresAt?: string | null;
  /** ชั่วโมง MA ของช่วงใหม่ (บังคับ) — รับ string ด้วย (ช่องกรอกในฟอร์ม) */
  maHours?: number | string | null;
}

/**
 * payload ของ `POST /apps/:id/companies/:recordId/buy-hours` — **ซื้อชั่วโมง MA เพิ่ม**
 *
 * ต่างจาก `AppRenewInput`: กรอก**แค่จำนวนชั่วโมงที่ซื้อ** (บังคับ, > 0) — วันที่
 * สัญญา**คงเดิมทุกประการ** ระบบ append แถวใหม่ให้คู่เดิมด้วย
 * `maHours = ของเดิม + ที่ซื้อ` (`kind = 'buy'`) เพื่อให้แท็บ "ประวัติการต่ออายุ"
 * เห็นว่าซื้อเมื่อไหร่/กี่ชม.
 */
export interface AppBuyInput {
  /** จำนวนชั่วโมงที่ซื้อเพิ่ม (บังคับ — จำนวนเต็ม > 0) */
  hours?: number | string | null;
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

  /**
   * **ขอบเขตการอ่านรายการแอป** — `scope.visible` มาจาก `?visible=1` ของฟอร์ม
   * รายงานปัญหา (`/issues/new` → `fetchVisibleApps()`) เมื่อตั้ง flag จะคืนเฉพาะ
   * แอปที่ **เปิดใช้งาน** (`is_visible = true`) เท่านั้น — **ไม่สนว่าแอปนั้นจะผูก
   * กับบริษัทของผู้เรียกหรือไม่** (ข้อสรุปจากพี่: เชื่อมหรือไม่เชื่อม ลูกค้าก็
   * เห็นแอปทุกตัว การผูก `app_companies` จึงไม่ได้ปิดกั้นอะไรอีกแล้ว)
   *
   * ไม่ส่ง flag (แท็บแอปใน `/master-data`, `/systems`, `/reports`, ชิปบนบอร์ด)
   * = พฤติกรรมเดิมทุกประการ: คืน **ทุกแอปรวมที่ปิดสถานะ** เพราะหน้าเหล่านั้น
   * ต้องเห็นแอปที่ปิดเพื่อเปิดกลับได้ / ดูชั่วโมง MA ย้อนหลัง
   *
   * **ไม่กรองอายุสัญญา** — คู่เดิมมีได้หลายช่วงต่ออายุ (append แถวใหม่) การจะ
   * บอกว่า "หมดอายุ" ต้องดูช่วงล่าสุด ไม่ใช่แถวเก่าที่ expiresAt ผ่านไปแล้ว
   */
  async findAll(params: PaginationParams, scope: { visible?: boolean } = {}) {
    const apps = scope.visible
      ? await this.apps
          .createQueryBuilder("app")
          .where("app.is_visible = true")
          .orderBy("app.id", "ASC")
          .getMany()
      : await this.apps.find({ order: { id: "ASC" } });
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

  /**
   * สร้าง "ชื่อแอป" อย่างเดียว — หน้าที่ของแท็บแอปใน `/master-data`
   * (ข้อมูลระบบเพิ่มทีหลังผ่าน `addRecord()` ที่ `/systems`)
   */
  async create(data: AppWriteInput) {
    if (!data.name) {
      throw new BadRequestException("App name is required");
    }
    const existing = await this.apps.findOne({ where: { name: data.name } });
    if (existing) {
      throw new ConflictException(`App "${data.name}" already exists`);
    }
    const app = await this.apps.save(
      this.apps.create({ name: data.name, isVisible: true }),
    );
    return this.toResponse(app, [], new Map());
  }

  /** เปลี่ยนชื่อแอป — ไม่แตะข้อมูลระบบ (`app_companies`) แม้แต่แถวเดียว */
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
    return this.appPayload(app);
  }

  /* ------------------------------------------------------------------ */
  /* รายการข้อมูลระบบ — 1 แถวต่อ 1 ช่วงเวลา (append / patch / delete)    */
  /* ------------------------------------------------------------------ */

  /**
   * เพิ่ม 1 รายการข้อมูลให้แอป — **append เสมอ** คู่เดิมซ้ำได้ (คนละช่วงเวลา
   * ต่ออายุ MA) จึงไม่มีทางเขียนทับช่วงเก่า
   */
  async addRecord(appId: number, data: AppRecordInput) {
    const app = await this.apps.findOne({ where: { id: appId } });
    if (!app) {
      throw new NotFoundException(`App with id ${appId} not found`);
    }
    const companyId = await this.resolveCompanyId(data.companyId);
    await this.appCompanies.save(
      this.appCompanies.create({
        appId,
        companyId,
        startedAt: this.normalizeDate(data.startedAt, "startedAt"),
        expiresAt: this.normalizeDate(data.expiresAt, "expiresAt"),
        maHours: this.normalizeHours(data.maHours),
        expiryStatus: "none",
        expiryNotified: "none",
      }),
    );
    return this.appPayload(app);
  }

  /**
   * แก้ **แถวเดียว** — ฟิลด์ที่ไม่ส่งมา = คงเดิมไว้ (ส่ง `null` = ล้างค่า)
   * แถวต้องอยู่ใต้แอปที่ระบุ ไม่งั้น 404 (กันแก้ข้ามแอปโดยบังเอิญ)
   */
  async updateRecord(appId: number, recordId: number, data: AppRecordInput) {
    const app = await this.apps.findOne({ where: { id: appId } });
    if (!app) {
      throw new NotFoundException(`App with id ${appId} not found`);
    }
    const row = await this.appCompanies.findOne({ where: { id: recordId } });
    if (!row || row.appId !== appId) {
      throw new NotFoundException(`Record with id ${recordId} not found`);
    }
    if (data.companyId !== undefined) {
      row.companyId = await this.resolveCompanyId(data.companyId);
    }
    if (data.startedAt !== undefined) {
      row.startedAt = this.normalizeDate(data.startedAt, "startedAt");
    }
    if (data.expiresAt !== undefined) {
      row.expiresAt = this.normalizeDate(data.expiresAt, "expiresAt");
    }
    if (data.maHours !== undefined) {
      const next = this.normalizeHours(data.maHours);
      // เติมชั่วโมงให้มากขึ้น → ล้าง latch "แจ้ง MA หมดแล้ว" ของแถวนี้ เพื่อให้
      // รอบการหมดครั้งต่อไป (หลังใช้จนหมดอีก) แจ้งใหม่ได้ — ไม่งั้นค้างว่า
      // "แจ้งแล้ว" ทั้งที่มีชั่วโมงใหม่ · ลดลง/เท่าเดิมไม่แตะ (ยังไม่หมดไม่แจ้งอยู่แล้ว)
      const raised = next !== null && (row.maHours == null || next > row.maHours);
      row.maHours = next;
      if (raised) row.maNotifiedAt = null;
    }
    await this.appCompanies.save(row);
    return this.appPayload(app);
  }

  /** ลบ 1 รายการข้อมูล — **แอปไม่หาย** (การลบแอปเป็นหน้าที่ `remove()`) */
  async removeRecord(appId: number, recordId: number) {
    const row = await this.appCompanies.findOne({ where: { id: recordId } });
    if (!row || row.appId !== appId) {
      throw new NotFoundException(`Record with id ${recordId} not found`);
    }
    await this.appCompanies.delete({ id: recordId });
    return { deleted: true };
  }

  /**
   * **ต่ออายุ** — ปิดช่วงเก่าแล้วเปิดช่วงใหม่ให้ **คู่เดิม** (`appId` +
   * `companyId` ยืมจากแถวตั้งต้น ฟอร์มไม่ต้องเลือกใหม่ และเปลี่ยนไม่ได้)
   *
   * ต่างจาก `addRecord()` ตรงที่ **ทั้ง 3 ฟิลด์บังคับ** และมีเพิ่มกฎวันที่:
   * ช่วงใหม่ที่ไม่ครบหรือกลับด้านจะกลายเป็นแถวที่ `AppExpiryService`
   * คำนวณสถานะไม่ได้ จึง reject ตั้งแต่ก่อนเขียน (400)
   *
   * **append เสมอ** — ช่วงเก่าไม่ถูกแตะ กลายเป็น 1 แถวของ "ประวัติการต่ออายุ"
   * โดยปริยาย (ตาราง `id ASC` ใน `loadLinks()` คือลำดับในหน้า `/systems`)
   */
  async renewRecord(appId: number, recordId: number, data: AppRenewInput) {
    const app = await this.apps.findOne({ where: { id: appId } });
    if (!app) {
      throw new NotFoundException(`App with id ${appId} not found`);
    }
    const source = await this.appCompanies.findOne({ where: { id: recordId } });
    if (!source || source.appId !== appId) {
      throw new NotFoundException(`Record with id ${recordId} not found`);
    }

    const startedAt = this.requireDate(data.startedAt, "startedAt");
    const expiresAt = this.requireDate(data.expiresAt, "expiresAt");
    const maHours = this.requireHours(data.maHours);
    if (expiresAt <= startedAt) {
      throw new BadRequestException("expiresAt must be later than startedAt");
    }

    await this.appCompanies.save(
      this.appCompanies.create({
        appId,
        companyId: source.companyId,
        startedAt,
        expiresAt,
        maHours,
        // ช่วงใหม่เริ่มจากศูนย์ — `reconcile()` จะคำนวณสถานะ/รอบแจ้งเตือนให้เอง
        expiryStatus: "none",
        expiryNotified: "none",
      }),
    );
    return this.appPayload(app);
  }

  /**
   * **ซื้อชั่วโมง MA เพิ่ม** — append แถวใหม่ให้คู่เดิมโดย**คงวันที่สัญญาเท่า
   * เดิม** (คัดลอก `startedAt` / `expiresAt` จากแถวนั้น) ต่างจาก `renewRecord()`
   * ที่เปิดช่วงใหม่ด้วยวันใหม่ · `maHours` = ของแถวนั้น (`null` = ยังไม่กรอก →
   * นับเป็น 0) + จำนวนชั่วโมงที่ซื้อ
   *
   * แถวใหม่ได้ `kind = 'buy'` เพื่อให้แท็บ "ประวัติการต่ออายุ" แยกออกว่าเป็น
   * การซื้อ — สองแถบนั้นมีวันที่เท่ากันแต่ `maHours` ต่างกัน ดูจากตัวเลขอย่าง
   * เดียวไม่ได้ว่าแถวไหนคือการซื้อ · แถวใหม่มี `id` ใหญ่สุด → ขึ้นเป็นช่วง
   * ล่าสุดของคู่ ตาราง `/systems` เห็นค่า MA ใหม่ทันที แถบเดิมตกลงเป็น history
   *
   * `expiryStatus` / `expiryNotified` **คัดลอกจากแถบตั้งต้น** (ไม่รีเซ็ตเป็น
   * `none` เหมือนต่ออายุ) เพราะวันที่ไม่เปลี่ยน — รีเซ็ตจะทำให้รอบแจ้งเตือน
   * d30/d7/expired ของวันเดิมถูกยิงซ้ำอีกรอบหลังซื้อชั่วโมง
   */
  async buyHours(appId: number, recordId: number, data: AppBuyInput) {
    const app = await this.apps.findOne({ where: { id: appId } });
    if (!app) {
      throw new NotFoundException(`App with id ${appId} not found`);
    }
    const source = await this.appCompanies.findOne({ where: { id: recordId } });
    if (!source || source.appId !== appId) {
      throw new NotFoundException(`Record with id ${recordId} not found`);
    }

    const hours = this.requirePurchasedHours(data.hours);

    await this.appCompanies.save(
      this.appCompanies.create({
        appId,
        companyId: source.companyId,
        startedAt: source.startedAt,
        expiresAt: source.expiresAt,
        maHours: (source.maHours ?? 0) + hours,
        kind: "buy",
        expiryStatus: source.expiryStatus,
        expiryNotified: source.expiryNotified,
      }),
    );
    return this.appPayload(app);
  }

  /**
   * บังคับกรอก — ต้องเป็น**จำนวนชั่วโมงเต็ม > 0** (ต่างจาก `requireHours()` ของ
   * ต่ออายุที่ยอม `0`: ซื้อ 0 ชม. ไม่มีความหมายและจะสร้างแถบ history เปล่า ๆ)
   */
  private requirePurchasedHours(value: number | string | null | undefined): number {
    const hours = this.normalizeHours(value);
    if (hours === null || hours <= 0) {
      throw new BadRequestException("hours must be a positive whole number of hours");
    }
    return hours;
  }

  /** บังคับกรอก — ฟิลด์ของช่วงใหม่ห้ามว่าง (`""` / `null` = 400 ไม่ใช่ `null`) */
  private requireDate(
    value: string | null | undefined,
    field: "startedAt" | "expiresAt",
  ): string {
    const normalized = this.normalizeDate(value, field);
    if (normalized === null) {
      throw new BadRequestException(`${field} is required for a renewal`);
    }
    return normalized;
  }

  /** บังคับกรอกชั่วโมง — ต่างจากช่องอื่นที่ `null` = "ยังไม่กำหนด" ยอมได้ */
  private requireHours(value: number | string | null | undefined): number {
    const normalized = this.normalizeHours(value);
    if (normalized === null) {
      throw new BadRequestException("maHours is required for a renewal");
    }
    return normalized;
  }

  /** โหลดคู่ทั้งหมดของแอป + รีเฟรชสถานะอายุทุกแถว แล้วคืน payload ของแอป */
  private async appPayload(app: App) {
    const { links, companyName } = await this.loadLinks([app.id]);
    for (const link of links) {
      await this.expiry.reconcile(link, {
        appName: app.name,
        companyName: companyName.get(link.companyId) ?? "",
      });
    }
    return this.toResponse(app, links, companyName);
  }

  /** ตรวจว่าบริษัทมีจริงก่อนเขียน — 400 ถ้าไม่มี (ไม่ insert แถวกำพร้า) */
  private async resolveCompanyId(value: number | string | null | undefined): Promise<number> {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException("companyId is required");
    }
    const company = await this.companies.findOne({ where: { id } });
    if (!company) {
      throw new BadRequestException("Company does not exist");
    }
    return id;
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
   * `undefined` / `null` / `""` = ยังไม่กำหนด (`null`); อย่างอื่นต้องเป็น
   * **จำนวนชั่วโมงเต็ม ≥ 0** — ไม่รับทศนิยม/ติดลบ/NaN เพราะคอลัมน์เป็น `INT`
   * และตอนนี้ยังไม่มีการคำนวณใด ๆ ต่อท้าย (การหักเวลาจริงรอบถัดไป)
   */
  private normalizeHours(value: number | string | null | undefined): number | null {
    if (value === undefined || value === null || value === "") return null;
    const hours = typeof value === "string" ? Number(value) : value;
    if (!Number.isInteger(hours) || hours < 0) {
      throw new BadRequestException("maHours must be a non-negative whole number of hours");
    }
    return hours;
  }

  /**
   * Join rows + every company name, in two queries. Master data holds a
   * handful of rows, and the names are needed both for the chips and for the
   * notification text — `AppCompany` maps no relation on purpose.
   *
   * เรียง `id ASC` (ลำดับที่เพิ่ม) — รายการใหม่ต้องโผล่ **ใต้** รายการเดิม
   * ในตาราง `/systems` ไม่ใช่กระโดดขึ้นข้างบน
   */
  private async loadLinks(appIds?: number[]): Promise<LoadedLinks> {
    const links = await this.appCompanies.find({
      where: appIds ? { appId: In(appIds) } : {},
      order: { id: "ASC" },
    });
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

  /**
   * รายการทั้งหมดของแอป เรียงตามลำดับที่เพิ่ม (`id ASC`) — 1 แถวต่อ 1 ช่วง
   * เวลา คู่เดิมจึงโผล่หลายแถวได้ · `id` ที่ส่งกลับไป = **companyId** (ฝั่ง
   * boards/reports ใช้กรองบริษัทด้วยค่านี้) ส่วน `recordId` คือ PK ของแถว
   *
   * `createdAt` = **วันที่บันทึกช่วงนั้น** — คอลัมน์ "วันที่" ของตาราง
   * ประวัติการต่ออายุ (ต่างจาก `startedAt` ที่เป็นวันที่ของสัญญา)
   */
  private companyLinks(links: AppCompany[], companyName: Map<number, string>) {
    return links
      .map((link) => ({
        recordId: link.id,
        id: link.companyId,
        name: companyName.get(link.companyId) ?? "",
        startedAt: link.startedAt ? toIsoDate(link.startedAt) : null,
        expiresAt: link.expiresAt ? toIsoDate(link.expiresAt) : null,
        /** ชั่วโมง MA ของช่วงนี้ — `null` = ยังไม่กำหนด */
        maHours: link.maHours ?? null,
        /** แถวนี้มาจากอะไร — `renew` (ต่ออายุ/เพิ่มรายการ) หรือ `buy` (ซื้อชั่วโมง) */
        kind: link.kind,
        expiryStatus: link.expiryStatus,
        /** ISO datetime — แถวเก่าที่สร้างก่อน migration 1819 ได้ค่าตอน migrate */
        createdAt: link.createdAt ? link.createdAt.toISOString() : null,
      }))
      .sort((a, b) => a.recordId - b.recordId);
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
