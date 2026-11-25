import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
import { addYearsIso, daysBetween, isIsoDate, toIsoDate, todayIso } from "../../common/dates";
import { paginateTotal, PaginationParams } from "../../common/pagination";
import { ViewerScope } from "./viewer-scope";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * 1 รายการข้อมูลที่ฟอร์มส่งมา — **เพิ่มแถวเดียวหรือแก้แถวเดียว** ไม่ใช่ส่ง list
 * ทั้งชุดมาแทนที่
 *
 * `POST` ทุกช่อง**บังคับ** (1 คู่ แอป×บริษัท มีได้ 1 แถว — คู่ที่ซ้ำกันให้ใช้
 * "ต่ออายุ"/"ซื้อชั่วโมง" แทน) · `PATCH` ยังเป็น optional ตามเดิม (ส่งเฉพาะช่อง
 * ที่จะเปลี่ยน, ไม่ส่ง = คงเดิม)
 */
export interface AppRecordInput {
  /** บริษัทของรายการนี้ — ตอนเพิ่มต้องระบุ · ตอนแก้ไขส่งมา = เปลี่ยนบริษัท */
  companyId?: number | null;
  /** `YYYY-MM-DD` — วันที่เริ่มใช้งาน (บังคับตอนเพิ่ม, optional ตอนแก้ไข) */
  startedAt?: string | null;
  /** `YYYY-MM-DD` — วันหมดอายุ (บังคับตอนเพิ่ม, ต้องมากกว่า `startedAt`) */
  expiresAt?: string | null;
  /** ชั่วโมง MA (บังคับตอนเพิ่ม, 0 = ตกลงให้ 0 ชม.) · รับ string ด้วย */
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
  private readonly logger = new Logger(AppsService.name);

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
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * ต่ออายุ/ซื้อชม. สำเร็จ → แถวแจ้งเตือนในกล่องเข้าของลูกค้าบริษัทนั้น +
   * แอดมิน (ไม่ส่งอีเมล — ดู `NotificationsService.notifyContractChange`) ·
   * fire-and-forget: ปัญหาการแจ้งเตือน/หาชื่อบริษัทไม่มีทางทำให้การบันทึกที่
   * สำเร็จแล้วดูเหมือนพัง
   */
  private async notifyContractEvent(
    appId: number,
    companyId: number,
    appName: string,
    action: "app_renewed" | "app_hours_purchased",
    context: string,
  ): Promise<void> {
    try {
      const company = await this.companies.findOne({ where: { id: companyId } });
      await this.notifications.notifyContractChange({
        companyId,
        appId,
        appName,
        companyName: company?.name ?? "",
        action,
        context,
      });
    } catch (error) {
      this.logger.warn(`contract change notification failed: ${(error as Error).message}`);
    }
  }

  /**
   * **ขอบเขตการอ่านรายการแอป** — `scope.visible` มาจาก `?visible=1` ของฟอร์ม
   * รายงานปัญหา (`/issues/new` → `fetchVisibleApps()`) เมื่อตั้ง flag จะคืนเฉพาะ
   * แอปที่ **เปิดใช้งาน** (`is_visible = true`) เท่านั้น
   *
   * `scope.mine` มาจาก **`?mine=1`** (ฟอร์มแจ้งปัญหาส่งคู่กับ `visible=1`) —
   * กรองเหลือเฉพาะแอปที่ผูกกับบริษัทของผู้เรียก (`app_companies` คู่กับ
   * `contract.companyId`) **แต่ fail-open ทุกทาง**: ไม่มีบริษัท / บริษัทไม่มี
   * แถวผูก / สตาฟฟ์ (`mode: "all"` → `callerLinks` ว่าง) / แอปที่ผูกถูกปิด
   * สถานะหมด (`linked` ว่าง) → คืนรายการเต็มเหมือนไม่ได้กรอง — กติกาเดียว
   * คือ `scope.mine && linked.length > 0` จึงเป็นไปไม่ได้ที่ dropdown จะว่าง
   * เพราะการกรอง (ช่องแอปบังคับ ว่าง = แจ้งปัญหาไม่ได้) · กรอง **ใน JS
   * หลัง query** ไม่ใช่ `andWhere` — ไม่มีเงื่อนไขบริษัทหลุดเข้า SQL
   *
   * ไม่ส่ง flag (แท็บแอปใน `/master-data`, `/systems`, `/reports`, ชิปบนบอร์ด)
   * = พฤติกรรมเดิมทุกประการ: คืน **ทุกแอปรวมที่ปิดสถานะ** เพราะหน้าเหล่านั้น
   * ต้องเห็นแอปที่ปิดเพื่อเปิดกลับได้ / ดูชั่วโมง MA ย้อนหลัง · ส่ง `visible=1`
   * อย่างเดียว (ไม่ส่ง `mine`) = ทุกแอปที่เปิดใช้งาน ไม่สนการผูก (ข้อสรุปเดิม
   * ของพี่ยังใช้ได้กับ path นี้)
   *
   * **ไม่กรองอายุสัญญา** — คู่เดิมมีได้หลายช่วงต่ออายุ (append แถวใหม่) การจะ
   * บอกว่า "หมดอายุ" ต้องดูช่วงล่าสุด ไม่ใช่แถวเก่าที่ expiresAt ผ่านไปแล้ว
   *
   * `scope.contract` (`viewer-scope.ts`) จำกัด**แถวด้านใน** (`companies`) ไม่ใช่
   * ตัวรายการแอป — จึงแยกกันได้ 3 แบบ: `all` = เหมือนเดิมทุกประการ · `own` =
   * เฉพาะคู่ของบริษัทผู้เรียก (`GET /systems` ของลูกค้า) · `none` = ไม่คืนแถว
   * สัญญาเลย (`GET /apps` ของลูกค้า — รายชื่อแอปยังครบ ฟอร์มแจ้งปัญหาใช้ได้
   * ตามเดิม) · ลูกค้าไม่มีบริษัท (`own` + `companyId: null`) = คืนว่าง**ทั้งหน้า**
   * โดย**ไม่ query รายการแอป**และไม่ reconcile อะไรเลย เพื่อไม่ให้คำสั่งนั้นไป
   * แตะรอบ/ยิงกระดิ่งหมดอายุของบริษัทอื่น (การ expire ยังมี cron 09:00 ของ
   * `AppExpiryService` คุมอยู่แล้ว)
   */
  async findAll(
    params: PaginationParams,
    scope: { visible?: boolean; contract?: ViewerScope; mine?: boolean } = {},
  ) {
    const contract = scope.contract ?? { mode: "all" as const, companyId: null };
    /** ลูกค้าไม่มีบริษัท → ไม่มีแถวสัญญาให้เห็นเลย (คืนว่าง ไม่ query ไม่ reconcile) */
    const noAccess = contract.mode === "own" && contract.companyId == null;
    const apps = noAccess
      ? []
      : scope.visible
        ? await this.apps
            .createQueryBuilder("app")
            .where("app.is_visible = true")
            .orderBy("app.id", "ASC")
            .getMany()
        : await this.apps.find({ order: { id: "ASC" } });
    const loaded = await this.loadLinks();
    const companyName = loaded.companyName;
    // กรอง**ก่อน** loop reconcile ด้านล่าง — ลูกค้าห้ามไปแตะรอบ/ยิงกระดิ่ง
    // หมดอายุของบริษัทอื่น และ `mode: "none"` = ไม่ reconcile อะไรเลย
    // (การ expire รายวันยังมี cron 09:00 ของ `AppExpiryService` คุมอยู่แล้ว)
    const links = noAccess || contract.mode === "none"
      ? []
      : contract.mode === "all"
        ? loaded.links
        : loaded.links.filter((link) => link.companyId === contract.companyId);
    const linksByApp = this.groupByApp(links);

    // **ธง `maExpired`** — ฟอร์มแจ้งปัญหา (`/issues/new`) บล็อกเมื่อ "คู่ของ
    // ผู้เรียก" หมดอายุ แต่ `mode: "none"` (ลูกค้า) ไม่คืนแถวสัญญาอยู่แล้ว
    // (ข้อตกลงใน `viewer-scope.ts`: ลูกค้าอ่านวันที่/ชั่วโมงของตัวเองไม่ได้
    // จากช่องนี้) → คำนวณเป็น **boolean อย่างเดียว** ที่นี่แทน
    //
    // - อ่านจาก `loaded.links` **ตรง ๆ** ไม่สน `links` ด้านบน (ซึ่งว่างสำหรับ
    //   ลูกค้า) และ **ไม่เรียก `reconcile()`** — endpoint นี้ห้ามแตะรอบ/ยิง
    //   กระดิ่งของคู่ไหนเลย (หน้าที่ของ cron 09:00 ใน `AppExpiryService`)
    // - **`mode: "all"` (สตาฟฟ์) → ไม่คำนวณเลย** (`false` ทุกแถว — ไม่ถูกบล็อก
    //   ตาม design) · ที่เหลือใช้ **`contract.companyId`** ซึ่ง `viewerScope()`
    //   ส่งมาเฉพาะลูกค้าเท่านั้น — ⚠️ **ห้ามเช็ค `mode === "own"`** เพราะ
    //   `GET /apps` ของลูกค้ามาในโหมด **`none`** (แถวสัญญาถูกตัด) แต่ยังคง
    //   `companyId` ของผู้เรียกมาด้วย → ฟอร์มแจ้งปัญหาคือจุดที่ต้องการธงนี้ ·
    //   ไม่มีบริษัท / ไม่มีแถวคู่ / ไม่กรอกวันหมดอายุ → fail-open `false`
    // - ดู**ช่วงล่าสุดของคู่เท่านั้น** (max `link.id`) — ช่วงเก่าหมดอายุแต่
    //   เพิ่งต่ออายุ = ยังไม่หมด · คำนวณจาก `expiresAt` สด ๆ ไม่พึ่ง
    //   `expiryStatus` ที่เก็บไว้ (กันค่าเก่า)
    const callerLinks =
      contract.mode !== "all" && contract.companyId != null
        ? loaded.links.filter((link) => link.companyId === contract.companyId)
        : [];
    const latestByApp = new Map<number, AppCompany>();
    for (const link of callerLinks) {
      const prev = latestByApp.get(link.appId);
      if (!prev || link.id > prev.id) latestByApp.set(link.appId, link);
    }
    const expiredAppIds = new Set<number>();
    for (const link of latestByApp.values()) {
      if (this.isPeriodExpired(link)) expiredAppIds.add(link.appId);
    }

    // **`?mine=1` — กรอง dropdown ตามบริษัทผู้แจ้ง** (ดู JSDoc หัว method):
    // เอาเฉพาะแอปที่ผูกกับบริษัทผู้เรียก แล้ว fail-open ทุกทางที่รายการจะ
    // ว่างลง — ไม่มีบริษัท / ไม่มีแถวผูก / สตาฟฟ์ (`callerLinks` ว่างเพราะ
    // `mode: "all"`) / แอปที่ผูกถูกปิดหมด (`linked` ว่าง) → คืน `apps` เต็ม
    const callerAppIds = new Set(callerLinks.map((link) => link.appId));
    const linked = apps.filter((a) => callerAppIds.has(a.id));
    const pickerApps = scope.mine && linked.length > 0 ? linked : apps;

    // The tab is the most reliable clock we have: refresh each pair's stored
    // status (and ring the bell on a transition) while the list is being built.
    for (const app of pickerApps) {
      for (const link of linksByApp.get(app.id) ?? []) {
        await this.expiry.reconcile(link, {
          appName: app.name,
          companyName: companyName.get(link.companyId) ?? "",
        });
      }
    }

    /**
     * `issueCount` นับ**เฉพาะแถวของหน้า** (slice แบบเดียวกับ `paginate` เดิม
     * — ไม่มีแถวถูกทิ้งระหว่าง map → ผลลัพธ์เท่ากันเป๊ะ) · ส่วน loop
     * `reconcile` ด้านบนยังคงวิ่งทุกคู่ของ `pickerApps`: มันคิดสถานะในหน่วย
     * ความจำแล้ว**เขียน DB เฉพาะตอนมีอะไรเปลี่ยน** (ดู `AppExpiryService`)
     * — โหลดหน้าที่ไหนก็อัปเดตชิป/กระดิ่งตรงนั้นทันที ถ้าย้ายไปพึ่ง cron
     * 09:00 อย่างเดียว ชิปจะค้างจนถึงพรุ่งนี้
     */
    const total = pickerApps.length;
    const start = (params.page - 1) * params.limit;
    const pageApps = pickerApps.slice(start, start + params.limit);
    const result = await Promise.all(
      pageApps.map(async (a) => ({
        id: a.id,
        name: a.name,
        isVisible: a.isVisible,
        companies: this.companyLinks(linksByApp.get(a.id) ?? [], companyName),
        /** คู่ของ**ผู้เรียก**หมดอายุแล้วหรือยัง — ฟอร์มแจ้งปัญหาใช้บล็อก (fail-open) */
        maExpired: expiredAppIds.has(a.id),
        createdAt: a.createdAt,
        issueCount: await this.issues.count({ where: { appId: a.id } }),
      })),
    );
    return paginateTotal(result, total, params);
  }

  /**
   * **ช่วงเดียวหมดอายุหรือยัง** — `วันหมดอายุวันนี้พอดี = หมดอายุ` (`<= 0`)
   * ตรงกับชิป "หมดอายุแล้ว" และเงื่อนไขปุ่ม "ต่ออายุ" ฝั่ง UI · **อ่านอย่าง
   * เดียว**: ห้ามเรียก `reconcile()` ที่นี่ (endpoint ต้องไม่ไปแตะรอบ/ยิง
   * กระดิ่งของคู่ไหน — การ expire ยังมี cron 09:00 ของ `AppExpiryService` คุม)
   */
  private isPeriodExpired(link: AppCompany): boolean {
    if (!link.expiresAt) return false;
    return daysBetween(todayIso(), toIsoDate(link.expiresAt)) <= 0;
  }

  /**
   * **คู่ "แอป × บริษัท" หมดอายุแล้วหรือยัง** — จุดถามของ
   * `IssuesService.update()` (ตาข่าย "MA หมดอายุ → รับงาน MA/Requirement ไม่ได้")
   *
   * - ดูเฉพาะ**ช่วงล่าสุดของคู่** (max `id`) — ช่วงเก่าหมดอายุแต่เพิ่งต่ออายุ = ยังไม่หมด
   * - **fail-open**: ไม่มีแอป / ไม่มีบริษัท / ไม่มีแถวคู่ / ไม่กรอกวันหมดอายุ → `false`
   *   (เฉพาะ `mode` ของผู้เรียกไม่เกี่ยว — นี่คือคำถามเรื่องข้อมูลคู่ ไม่ใช่สิทธิ์อ่าน)
   * - **อ่านอย่างเดียว** — ใช้ตัวช่วยตัวเดียวกับธง `maExpired` ใน `findAll()`
   *   และ**ไม่เรียก `reconcile()`** (การ expire ยังเป็นหน้าที่ cron 09:00 ของ
   *   `AppExpiryService`)
   */
  async isPairExpired(
    appId: number | null | undefined,
    companyId: number | null | undefined,
  ): Promise<boolean> {
    if (appId == null || companyId == null) return false;
    const latest = await this.appCompanies.findOne({
      where: { appId, companyId },
      order: { id: "DESC" },
    });
    if (!latest) return false;
    return this.isPeriodExpired(latest);
  }

  /**
   * **วันเหลือก่อนหมดอายุของหลายคู่** — ใช้กับการ์ดบนบอร์ด (กรอบแดง 7 วัน
   * สุดท้าย) · query เดียวต่อหน้า ไม่ใช่ `isPairExpired()` ทีละใบ · ดูแค่
   * **ช่วงล่าสุดของคู่** (max `id`) เหมือนธง `maExpired` · fail-open ทุกกรณี:
   * ไม่มีคู่ / ไม่กรอกวันหมดอายุ / สัญญาถูกยกเลิก → ไม่ใส่ key นั้นในผลลัพธ์
   * (การ์ดก็ไม่ได้กรอบ) · ฝั่งเว็บใช้วาดสีกรอบเท่านั้น
   */
  async daysLeftForPairs(
    pairs: Array<{ appId: number | null; companyId: number | null }>,
  ): Promise<Map<string, number>> {
    const valid = pairs.filter(
      (pair): pair is { appId: number; companyId: number } =>
        pair.appId != null && pair.companyId != null,
    );
    if (valid.length === 0) return new Map();
    const validKeys = new Set(valid.map((pair) => `${pair.appId}:${pair.companyId}`));
    const rows = await this.appCompanies.find({
      where: valid.map((pair) => ({ appId: pair.appId, companyId: pair.companyId })),
      order: { id: "ASC" },
    });
    const latest = new Map<string, AppCompany>();
    for (const row of rows) {
      const key = `${row.appId}:${row.companyId}`;
      const prev = latest.get(key);
      if (!prev || row.id > prev.id) latest.set(key, row);
    }
    const out = new Map<string, number>();
    for (const [key, row] of latest) {
      if (!validKeys.has(key) || row.cancelledAt != null || !row.expiresAt) continue;
      out.set(key, daysBetween(todayIso(), toIsoDate(row.expiresAt)));
    }
    return out;
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
   * เพิ่ม 1 รายการข้อมูลให้แอป — **1 คู่ (แอป×บริษัท) มีได้ 1 แถว**:
   * ทุกช่องบังคับ (วันที่ 2 ช่อง + ชั่วโมง MA + บริษัท) และถ้าคู่นี้มีอยู่แล้ว
   * → **409** (ให้ใช้ปุ่ม "ต่ออายุ"/"ซื้อชั่วโมง" เพื่อเพิ่มรายการให้คู่เดิมแทน)
   *
   * กติกาเดิมที่อนุญาตให้ append คู่ซ้ำหลายช่วงถูกยกเลิกตามคำสั่งผู้ใช้
   * ("เพิ่มตัวที่มีอยู่แล้วไม่ได้") — การต่ออายุ/ซื้อชม. ยัง append แถวใหม่เหมือนเดิม
   * แต่ผ่าน `renewRecord()` / `buyHours()` คนละ route
   */
  async addRecord(appId: number, data: AppRecordInput) {
    const app = await this.apps.findOne({ where: { id: appId } });
    if (!app) {
      throw new NotFoundException(`App with id ${appId} not found`);
    }
    const companyId = await this.resolveCompanyId(data.companyId);
    const startedAt = this.requireDate(data.startedAt, "startedAt");
    const expiresAt = this.requireDate(data.expiresAt, "expiresAt");
    const maHours = this.requireHours(data.maHours);
    if (expiresAt <= startedAt) {
      throw new BadRequestException("expiresAt must be later than startedAt");
    }
    const duplicate = await this.appCompanies.findOne({ where: { appId, companyId } });
    if (duplicate) {
      throw new ConflictException(`Data for app ${appId} and company ${companyId} already exists`);
    }
    await this.appCompanies.save(
      this.appCompanies.create({
        appId,
        companyId,
        startedAt,
        expiresAt,
        maHours,
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
      const nextCompanyId = await this.resolveCompanyId(data.companyId);
      // เปลี่ยนคู่ = ย้ายแถวไปคู่ใหม่ — กันไปทับคู่ที่มีอยู่แล้ว (กฎเดียวกับตอนเพิ่ม)
      if (nextCompanyId !== row.companyId) {
        const duplicate = await this.appCompanies.findOne({
          where: { appId, companyId: nextCompanyId },
        });
        if (duplicate) {
          throw new ConflictException(
            `Data for app ${appId} and company ${nextCompanyId} already exists`,
          );
        }
      }
      row.companyId = nextCompanyId;
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
   * **ยกเลิกสัญญา** (แอดมินเท่านั้น — route กันด้วย `system.update`) — stamp
   * `cancelled_at` **ทุกแถวของคู่** (1 คู่มีได้หลายช่วงเวลา) ตามที่ผู้ใช้เลือก
   * "ยกเลิกทั้งคู่" · ไม่ลบแถว ไม่แตะวันที่/MA/ประวัติ/ latch เดิม
   *
   * ผลทันที: `AppExpiryService.reconcile()`, `MaUsageService.checkAndNotify()`
   * และ `NotificationRepeatsService.isResolved()` ข้ามคู่นี้ → ไม่มีแถว/อีเมล
   * ใหม่ · แถวแจ้งเตือนที่ส่งไปแล้ว**ปล่อยไว้** (อ่านได้ตามปกติ)
   *
   * `restoreContract()` ล้าง stamp เท่านั้น → กลับสภาพเดิมเป๊ะ รวม latch
   * ที่เคยมีอยู่ (ไม่ยิงกระดิ่งซ้ำทันทีที่กดเปิดกลับ — รอ threshold ถัดไป)
   */
  private async findPairRow(
    appId: number,
    recordId: number,
  ): Promise<{ app: App; row: AppCompany }> {
    const app = await this.apps.findOne({ where: { id: appId } });
    if (!app) throw new NotFoundException(`App with id ${appId} not found`);
    const row = await this.appCompanies.findOne({ where: { id: recordId } });
    if (!row || row.appId !== appId) {
      throw new NotFoundException(`Record with id ${recordId} not found`);
    }
    return { app, row };
  }

  async cancelContract(appId: number, recordId: number) {
    const { app, row } = await this.findPairRow(appId, recordId);
    const pair = await this.appCompanies.find({
      where: { appId, companyId: row.companyId },
      order: { id: "ASC" },
    });
    const cancelledAt = new Date();
    for (const link of pair) {
      if (link.cancelledAt == null) {
        await this.appCompanies.save({ ...link, cancelledAt });
      }
    }
    return this.appPayload(app);
  }

  async restoreContract(appId: number, recordId: number) {
    const { app, row } = await this.findPairRow(appId, recordId);
    const pair = await this.appCompanies.find({
      where: { appId, companyId: row.companyId },
      order: { id: "ASC" },
    });
    for (const link of pair) {
      if (link.cancelledAt != null) {
        await this.appCompanies.save({ ...link, cancelledAt: null });
      }
    }
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
    /**
     * ตัดสิทธิ์ทบเมื่อต่อช้าเกิน 1 ปีหลังวันหมดอายุของแถวก่อน (ข้อสรุปจากพี่) —
     * ฟอร์มคำนวณ `carry` ด้วย window เดียวกัน (`dayjs(...).add(1, "year")`)
     * จึงต้องตรงกันเป๊ะ: ต่อวันครบ 1 ปีพอดี**ยังได้** (inclusive), เกิน → 400
     * · ไม่มี `expiresAt` → fail-open (ไม่มีวันเทียบ) · เฉพาะตอนมี `carriedHours`
     * (ไม่ทบ = payload ไม่เกี่ยวกับ window นี้ → ต่อช้าได้ปกติ)
     */
    if (carriedHours !== null && source.expiresAt) {
      const deadline = addYearsIso(toIsoDate(source.expiresAt), 1);
      if (startedAt > deadline) {
        throw new BadRequestException(
          "carried hours require a renewal within 1 year of the previous expiry date",
        );
      }
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
    void this.notifyContractEvent(
      app.id,
      source.companyId,
      app.name,
      "app_renewed",
      `MA ${maHours} ชม.`,
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
    void this.notifyContractEvent(
      app.id,
      source.companyId,
      app.name,
      "app_hours_purchased",
      `+${hours} ชม. (รวม ${hours + (carriedHours ?? 0)} ชม.)`,
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

  /** บังคับกรอก — วันที่ห้ามว่าง (`""` / `null` = 400) ใช้ทั้งตอนเพิ่มและต่ออายุ */
  private requireDate(
    value: string | null | undefined,
    field: "startedAt" | "expiresAt",
  ): string {
    const normalized = this.normalizeDate(value, field);
    if (normalized === null) {
      throw new BadRequestException(`${field} is required`);
    }
    return normalized;
  }

  /** บังคับกรอกชั่วโมง — `0` ยอมได้ (ตกลงให้ 0 ชม.), `null`/`""` = 400 */
  private requireHours(value: number | string | null | undefined): number {
    const normalized = this.normalizeHours(value);
    if (normalized === null) {
      throw new BadRequestException("maHours is required");
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
        /** ISO datetime ตอนแอดมินกด "ยกเลิกสัญญา" — `null` = ยังใช้งานอยู่ */
        cancelledAt: link.cancelledAt ? link.cancelledAt.toISOString() : null,
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
