import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { App } from "./entities/app.entity";
import { AppCompany } from "./entities/app-company.entity";
import { Company } from "../companies/entities/company.entity";
import { Issue } from "../issues/entities/issue.entity";
import { AppExpiryService } from "./app-expiry.service";
import { MaUsageService } from "./ma-usage.service";
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
  /**
   * **ชั่วโมงที่ทบมาจากช่วงแรก** (แสดงผลเท่านั้น, ไม่บังคับ) — ฟอร์มต่ออายุ
   * คำนวณไว้แล้ว (`carryShown`) ส่งมาให้เก็บ เพื่อโชว์ย้อนหลังในป๊อปอัพ
   * `/systems` · ไม่ส่ง / ไม่ทบ → `NULL` · ต้องเป็นจำนวนเต็ม ≥ 0 และ **ไม่เกิน
   * `maHours`** (เกิน = 400) · ค่านี้**ไม่ป้อนตัวเลขหลัก** (`maHours` / ใช้ไป /
   * คงเหลือ ยังมาจากสูตรเดิม) จึงถูก spoof ได้แค่ทำให้ label ผิด
   */
  carriedHours?: number | string | null;
}

/**
 * payload ของ `POST /apps/:id/companies/:recordId/buy-hours` — **ซื้อชั่วโมง MA เพิ่ม**
 *
 * ต่างจาก `AppRenewInput`: กรอก**แค่จำนวนชั่วโมงที่ซื้อ** (บังคับ, > 0) — วันที่
 * สัญญา**คงเดิมทุกประการ** ระบบ append แถวใหม่ให้คู่เดิมด้วย
 * `maHours = ที่ซื้อ + ทบ` (`kind = 'buy'`) เพื่อให้แท็บ "ประวัติการต่ออายุ"
 * เห็นว่าซื้อเมื่อไหร่/กี่ชม.
 *
 * **`carriedHours` = สิทธิ์คงเหลือของแถวก่อนที่ถูกทบเข้ามา** (ข้อสรุปจากผู้ใช้:
 * "มันเป็นช่วงเดียวกัน แต่แค่ซื้อชั่วโมง" → แถวซื้อต้องเห็นชั่วโมงที่ยังใช้ได้
 * ทั้งหมดของช่วงนั้น) — ฝั่งฟอร์มคำนวณเอง (`MA แถวนั้น − ใช้ไปของแถวนั้น`) แล้ว
 * ส่งมาให้เก็บ · **ไม่บังคับ**: ไม่ส่ง/ส่ง 0 = ไม่ทบ (เก็บ `NULL`) · ต้องเป็น
 * จำนวนเต็ม ≥ 0 และ **ไม่เกิน MA ของแถวต้นทาง** (เกิน = 400)
 */
export interface AppBuyInput {
  /** จำนวนชั่วโมงที่ซื้อเพิ่ม (บังคับ — จำนวนเต็ม > 0) */
  hours?: number | string | null;
  /** สิทธิ์คงเหลือของแถวก่อนที่ทบเข้ามา (แสดงผล + บวกเป็น MA ใหม่) */
  carriedHours?: number | string | null;
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
    private readonly maUsage: MaUsageService,
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

  /**
   * ลบ **ทุกแถวของคู่** `appId` × `companyId` — ปุ่มถังขยะในตาราง `/systems`
   * คือ "แถว = คู่ แอป×บริษัท" (โชว์แค่ช่วงล่าสุด) ผู้ใช้กดแถวเดียวแต่คาดว่า
   * **ประวัติทั้งคู่หายไปด้วย** (ข้อสรุปจากผู้ใช้: "ลบทีละรอบ มันต้องลบทั้งหมด")
   * → เดิมลบแค่ 1 แถวนั้นทิ้ง ทำให้ป๊อปอัพยังโชว์ช่วงเก่าค้างอยู่
   *
   * `recordId` ยังเป็นตัวระบุ (แถวใดของคู่ก็ได้ — ตารางส่งแถวล่าสุด) · **แอป
   * ไม่หาย** (การลบแอปเป็นหน้าที่ `remove()`) และคู่อื่น/แอปอื่นไม่กระทบ ·
   * งาน (`issues`) ไม่เกี่ยว — FK ชี้ `apps` ไม่ใช่ `app_companies`
   *
   * คืน `deletedRows` = จำนวนแถวที่ลบ (ข้อความยืนยันฝั่งเว็บใช้โชว์ "{n} รายการ")
   */
  async removeRecord(appId: number, recordId: number) {
    const row = await this.appCompanies.findOne({ where: { id: recordId } });
    if (!row || row.appId !== appId) {
      throw new NotFoundException(`Record with id ${recordId} not found`);
    }
    const result = await this.appCompanies.delete({
      appId,
      companyId: row.companyId,
    });
    return { deleted: true, deletedRows: result.affected ?? 0 };
  }

  /**
   * **ย้อนกลับการต่ออายุ/ซื้อชั่วโมง** — ลบ **ช่วงเดียว** (แถวล่าสุดของคู่)
   * ต่างจาก `removeRecord()` ที่ลบทั้งคู่ · เหตุผลที่ทำได้จริง: ทั้ง `renewRecord()`
   * และ `buyHours()` เป็น **append ล้วน ๆ ไม่แตะช่วงเก่า** → ลบแถวล่าสุดทิ้งแล้ว
   * คู่จะกลับเป็นสภาพก่อนต่ออายุเป๊ะ (ช่วงก่อนหน้ากลับเป็น latest เอง)
   *
   * **4 เงื่อนไข** (ย้อนได้เฉพาะสิ่งที่เพิ่งทำ = LIFO):
   * - แถวต้องอยู่ใต้แอปนั้น (ไม่งั้น 404)
   * - คู่ต้องเหลือ **≥ 2 แถว** — เหลือแถวกี่เดียว = ใช้ถังขยะ (`removeRecord`)
   *   ลบทั้งคู่แทน · ป้องกันการย้อนจนคู่หายไปเกลี้ยง
   * - แถวต้องเป็น **ช่วงใหม่สุด** ของคู่ — กันลบช่วงเก่าที่มีชั่วโมงผูกอยู่
   *   (ชั่วโมงจะถูกผูกย้อนไปช่วงเก่ากว่าอีกที ประวัติงง)
   * - ช่วงนั้นต้อง **ยังไม่ "คิด MA"** (`periodUsedHours === 0`) — ปุ่มฝั่ง UI
   *   หายไปเองตั้งแต่เริ่มหักชั่วโมง (ข้อสรุปจากผู้ใช้: "จะขึ้นแล้วจะหายตอนคิด
   *   ma เล้ว") ฝั่งเซิร์ฟเวอร์ต้องเช็กตรงกัน ไม่งั้นข้าม UI ย้อนได้เอง ·
   *   ไม่รู้ค่า (หา `usageCounts` ไม่เจอ) = fail-open ผ่านไป — แถวมีอยู่จริง
   *   ต้องถูกคืนเสมอ กรณีนี้จึงไม่ควรเกิด
   *
   * **ชั่วโมงที่หักไปแล้ว (กรณีที่หลุดมาได้จริง)** จะถูกผูกกลับรอบก่อนหน้าเอง
   * เพราะ `pickPeriodId()` เลือกแถวจาก `created_at <= actual_fix_at` → invariant
   * `Σ ทุกรอบ + unattributed = pairUsed` ยังคง (ไม่ต้องเขียนอะไรเพิ่ม)
   *
   * คืน payload ของแอป (เหมือน renew/buy) — หน้า `/systems` ดึงซ้ำอยู่แล้ว
   */
  async removePeriod(appId: number, recordId: number) {
    const app = await this.apps.findOne({ where: { id: appId } });
    if (!app) throw new NotFoundException(`App with id ${appId} not found`);

    const row = await this.appCompanies.findOne({ where: { id: recordId } });
    if (!row || row.appId !== appId) {
      throw new NotFoundException(`Record with id ${recordId} not found`);
    }

    const pair = await this.appCompanies.find({
      where: { appId, companyId: row.companyId },
      order: { id: "ASC" },
    });
    if (pair.length < 2) {
      throw new BadRequestException(
        "This is the only period left — delete the whole record instead",
      );
    }
    // หา "ใหม่สุด" ด้วย max ไม่ใช่ element สุดท้ายของ array — ไม่ผูกกับลำดับที่
    // query คืนมา (ผลลัพธ์จาก mock/DB อาจไม่เรียงก็ยังถูก)
    const newestId = pair.reduce((max, r) => Math.max(max, r.id), 0);
    if (recordId !== newestId) {
      throw new BadRequestException("Only the newest period can be undone");
    }

    // **ยังไม่ "คิด MA"** — ปุ่มฝั่ง UI หายไปเองตั้งแต่ช่วงนั้นมีชั่วโมงถูกหัก
    // (`system-detail-dialog` ซ่อนปุ่ม/ขึ้น "ใช้ MA แล้ว") ต้องเช็กตรงกันตรงนี้
    // ไม่งั้นข้าม UI ย้อนได้เอง · `usageCounts` คืนทุกแถวที่มีจริง (0 เมื่อยัง
    // ไม่เคยหัก) — หาไม่เจอ = fail-open เพราะแถวเพิ่งเช็กว่ามีอยู่แล้ว
    const [usage] = await this.maUsage.usageCounts([recordId]);
    if (usage && (usage.count > 0 || usage.periodUsedHours > 0)) {
      throw new BadRequestException("This period already has hours deducted");
    }

    await this.appCompanies.delete({ id: recordId });
    return this.appPayload(app);
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
    // ชั่วโมงที่ทบมา — ค่าแสดงผลของแถวนี้ (ไม่บังคับ, ดู `requireCarriedHours`)
    const carriedHours = this.requireCarriedHours(data.carriedHours, maHours);
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
        // `NULL` = แถวนี้ไม่ได้ทบ (แถวเก่า/แถวที่ทบไม่ได้/ไม่ส่งค่า) — UI ซ่อนเอง
        carriedHours,
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
   * ที่เปิดช่วงใหม่ด้วยวันใหม่
   *
   * **`maHours = ที่ซื้อ + ทบ`** — "ทบ" = **สิทธิ์คงเหลือของแถวก่อน** (`carriedHours`
   * ที่ฟอร์มส่งมา = `MA แถวนั้น − ใช้ไปของแถวนั้น`) เพราะการซื้อเป็นการเพิ่ม
   * ชั่วโมง**ให้ช่วงสัญญาเดิม** (วันที่คัดลอกมาเป๊ะ) ไม่ใช่เปิดช่วงใหม่ —
   * แถวก่อนยังเหลือ 30 แล้วซื้อ 40 → ใช้ได้ **70** ไม่ใช่ 40 (ข้อสรุปจากผู้ใช้:
   * "มันเป็นช่วงเดียวกัน แต่แค่ซื้อชั่วโมง") · **ไม่ส่ง `carriedHours` = ไม่ทบ**
   * (แถวเดิมใช้หมดพอดี → MA = ที่ซื้อล้วน) · **ต่างจากต่ออายุ** ที่ทบเฉพาะ
   * "การต่ออายุครั้งแรก" — การซื้อทบ**ทุกครั้ง** เพราะทุกแถวซื้ออยู่ช่วงเดียวกัน
   *
   * **"ใช้ไป" ของแถวนี้ = รายรอบ** (`usage-counts`) — แถวนี้เพิ่งถูกสร้างจึงยังไม่มี
   * งานถูกผูกเข้า → โชว์ 0 / คงเหลือ = เต็ม `maHours` ที่เพิ่งบันทึก
   *
   * แถวใหม่ได้ `kind = 'buy'` เพื่อให้แท็บ "ประวัติการต่ออายุ" แยกออกว่าเป็น
   * การซื้อ — สองแถบนั้นมีวันที่เท่ากัน (แถว `renew` = ยอดของช่วง, แถว `buy` =
   * ที่ซื้อ + ทบ → ดูจาก `kind` ไม่ใช่ตัวเลข) · แถวใหม่มี `id` ใหญ่สุด → ขึ้นเป็น
   * ช่วงล่าสุดของคู่ ตาราง `/systems` เห็นค่า MA ใหม่ทันที แถบเดิมตกลงเป็น history
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
    /**
     * สิทธิ์คงเหลือของแถวก่อนที่ทบเข้ามา — เพดานคือ **MA ของแถวนั้น** เพราะ
     * `ทบ = MA − ใช้ไป ≤ MA` (เกิน = payload เพี้ยน → 400) · `0` / ไม่ส่ง → `NULL`
     */
    const carriedHours = this.requireCarriedHours(data.carriedHours, source.maHours ?? 0);

    await this.appCompanies.save(
      this.appCompanies.create({
        appId,
        companyId: source.companyId,
        startedAt: source.startedAt,
        expiresAt: source.expiresAt,
        // **ที่ซื้อ + ทบ** = สิทธิ์คงเหลือทั้งช่วง (ดู docblock) — ไม่ส่งทบ = ที่ซื้อล้วน
        maHours: hours + (carriedHours ?? 0),
        carriedHours,
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

  /**
   * **ชั่วโมงที่ทบมาจากช่วงแรก** (แสดงผลเท่านั้น) — `undefined` / `null` / `""` /
   * `0` = **ไม่ทบ** → เก็บเป็น `NULL` ให้ UI ซ่อน chip/บรรทัดนี้ได้ทันที · อย่างอื่น
   * ต้องเป็น **จำนวนเต็ม ≥ 0** และ **ไม่เกิน `maHours`** ของช่วงใหม่ที่เพิ่งบันทึก
   * (สูตรฟอร์มคือ `maHours = ที่พิมพ์ + ทบ` ดังนั้นทบเกิน `maHours` เป็นไปไม่ได้
   * → ถือว่า payload เพี้ยน → 400)
   */
  private requireCarriedHours(
    value: number | string | null | undefined,
    maHours: number,
  ): number | null {
    if (value === undefined || value === null || value === "") return null;
    const hours = typeof value === "string" ? Number(value) : value;
    if (!Number.isInteger(hours) || hours < 0) {
      throw new BadRequestException("carriedHours must be a non-negative whole number of hours");
    }
    if (hours > maHours) {
      throw new BadRequestException("carriedHours cannot exceed maHours");
    }
    return hours === 0 ? null : hours;
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

  /**
   * `canDelete` — **นับเฉพาะงานปกติ** (`deleted_at IS NULL`): `Issue.deletedAt` เป็น
   * `@Column` ธรรมดา (ไม่ใช่ `@DeleteDateColumn`) TypeORM จึง**ไม่กรองงานในถังขยะ**
   * ให้เอง — เดิม `count({ where: { appId } })` นับรวมถังขยะด้วย ทำให้ย้ายงานลง
   * ถังขยะหมดแล้วก็ยังลบแอปไม่ได้ตลอดกาล (ระบบมีแค่ soft delete + restore
   * ไม่มี "ลบทถาวร") · **กฎ "มีงานจริง = เตือน + บล็อก" คงเดิม** (ข้อความเตือน
   * ของแอปมี key แยก `Settings.deleteAppInUse`) และถ้าการลบเกิดขึ้นจริง FK
   * `issues.app_id … ON DELETE SET NULL` จะย้ายงานที่เหลือไป "ไม่มีแอป" เอง
   */
  async check(id: number) {
    const app = await this.apps.findOne({ where: { id } });
    if (!app) {
      throw new NotFoundException(`App with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { appId: id, deletedAt: IsNull() } });
    return { canDelete: issueCount === 0, issueCount };
  }

  async remove(id: number) {
    const app = await this.apps.findOne({ where: { id } });
    if (!app) {
      throw new NotFoundException(`App with id ${id} not found`);
    }
    // live issues only — same rule as `check()` (งานในถังขยะไม่จองการลบถาวร)
    const issueCount = await this.issues.count({ where: { appId: id, deletedAt: IsNull() } });
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
        /**
         * ชั่วโมงที่ทบมาจากช่วงแรกตอนต่ออายุ (migration 1824) — `null`/`0` =
         * แถวนี้ไม่ได้ทบ → UI ซ่อน chip "ทบมา" กับบรรทัดในข้อมูลทั่วไปเอง
         */
        carriedHours: link.carriedHours ?? null,
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
