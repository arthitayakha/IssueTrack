import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { AppCompany } from "./entities/app-company.entity";
import { App } from "./entities/app.entity";
import { Company } from "../companies/entities/company.entity";
import { Issue } from "../issues/entities/issue.entity";
import { User } from "../auth/entities/user.entity";
import { NotificationsService } from "../notifications/notifications.service";
import { pairKey, pickPeriodId, type PeriodRow } from "./ma-attribution";
import { ViewerScope } from "./viewer-scope";
import { DONE_STATUS_ID } from "../../common/done-moves";

/**
 * ประเภทงานที่**หักจาก MA** — ตรงกับฝั่งรายงาน (`GET /reports/usage` ที่หน้าเว็บ
 * ส่ง `taskTypes=ma` มาเอง) · `bug`, `requirement` (เลิกหักตามข้อสรุปผู้ใช้) และ
 * `NULL` (ยังไม่ระบุ) ไม่หัก — ค่า `feature` ถูก rename เป็น `ma` โดย
 * migration `1827000000000`
 *
 * นอกจากประเภทแล้ว **ต้องอยู่ในสถานะ `เสร็จสิ้น` ด้วย** (`deductionRows()` กรอง
 * `status_id = DONE_STATUS_ID`) — ชั่วโมงที่กรอกไว้ขณะงานยังอยู่รีวิว/กำลังทำยัง
 * **ไม่ถูกหัก** แก้ตัวเลขผิดได้จนกว่าจะปิดงาน · พอปิดปุ๊บค่อยนับ (และกระดิ่ง
 * `IssuesService.move()` เช็คตอนนั้นด้วย)
 */
const DEDUCTED_TASK_TYPES = ["ma"] as const;

/** ปัดเป็น 1 ตำแหน่ง — **ตรงกับ `round1()` ใน `reports.service.ts`** ให้ตัวเลขสองฝั่งตรงกัน */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** แถวชั่วโมงที่ "หักจาก MA ได้" — ยัง *ไม่* ผูกกับรอบ (ผูกใน `attribute()`) */
interface DeductionRow {
  id: number;
  appId: number;
  companyId: number;
  seconds: number;
  /** `NULL` = ข้อมูลก่อนระบบ/ยังไม่เคยกรอกเวลา → ตกเป็น "ไม่ระบุรอบ" */
  at: Date | null;
}

/**
 * แถวงานที่จะโชว์ในป๊อปอัพ "รายการที่ตัด" — **คนละชุดกับ `DeductionRow`**:
 * ไม่กรอง `task_type` (บั๊ก / Requirement / ไม่ระบุ โผล่หมด) แต่ยังคงเกณฑ์
 * **เสร็จสิ้น + กรอกเวลาแล้ว** ตามที่ผู้ใช้ขอ · ใช้ผูกเข้ารอบด้วย `actual_fix_at`
 * ตัวเดียวกับ MA เพื่อให้ตารางเดียวกันใช้เกณฑ์เดียวกัน
 */
interface ListedRow {
  id: number;
  appId: number;
  companyId: number;
  at: Date | null;
}

/** ผลลัพธ์ของการผูกชั่วโมงเข้ารอบ — รวมทุกช่องเพื่อให้ `Σรอบ + ไม่ระบุ = ทั้งคู่` */
interface Attribution {
  byPeriod: Map<number, { seconds: number; ids: number[] }>;
  unattributedSeconds: number;
  pairSeconds: number;
}

/** แถวเดียวของรายการที่ถูกตัด — ใช้โชว์ในป๊อปอัพ `/systems` และรายงาน `/reports` */
export interface PeriodIssueRow {
  id: number;
  issueNumber: string | null;
  title: string;
  taskType: string | null;
  hours: number;
  deductedAt: Date | null;
  statusName: string | null;
  assigneeName: string | null;
  /**
   * งานที่กรอกเวลา**หลังวันหมดอายุของสัญญา** → ไม่มีรอบให้หักจริง จึงไม่ตัด MA
   * (โชว์ใน "รายการช่วงหมดอายุ" แทน) · คำนวณที่เซิร์ฟเวอร์เพื่อให้จอ/ไฟล์
   * ตรงกันโดยไม่ต้องเด date อีกรอบหนึ่งฝั่งเว็บ
   */
  afterExpiry: boolean;
}

/** ส่วนของวันที่ `YYYY-MM-DD` — ใช้ local date ของ `Date` เหมือน `dayjs` ฝั่งเว็บ */
function dayKey(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * งานที่กรอกเวลาหลังวันหมดอายุของรอบ — เทียบ**แค่ส่วนวันที่** (ไม่สนเวลา)
 * `null` = ไม่รู้ → ไม่เดา · ใช้ได้กับทั้ง `actual_fix_at` (Date) และ `expires_at` (string)
 */
export function isAfterExpiryDay(
  at: Date | string | null | undefined,
  expiresAt: Date | string | null | undefined,
): boolean {
  if (at == null || expiresAt == null) return false;
  const a = dayKey(at);
  const e = dayKey(expiresAt);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return false;
  return a > e;
}

/** `GET /apps/:id/companies/:recordId/usage` */
export interface PeriodUsageResult {
  recordId: number;
  appId: number;
  companyId: number;
  /** ลำดับของรอบในคู่นี้ (เรียง `id ASC` — ตรงกับ "รอบที่ N" ในแท็บประวัติ) */
  round: number;
  kind: "renew" | "buy";
  startedAt: Date | string | null;
  expiresAt: Date | string | null;
  maHours: number | null;
  /** "ใช้ไป" ระดับคู่ (ตลอดเวลา) — **ตัวเดียวกับที่หน้าจอโชว์อยู่แล้ว ไม่เปลี่ยน** */
  pairUsedHours: number;
  /** ส่วนของรอบนี้ — ทุกรอบบวกกับ `unattributedHours` ได้เท่ากับ `pairUsedHours` */
  periodUsedHours: number;
  /** ชั่วโมงที่ไม่รู้ว่ากรอกตอนไหน (ข้อมูลก่อนระบบ) — pair-level, เล่าตรง ๆ ไม่เดา */
  unattributedHours: number;
  /** จำนวนรายการในรอบนี้ — **สูตร MA ล้วน** (ใช้กับ "ใช้ไป/คงเหลือ" เหมือนเดิม) */
  count: number;
  issues: PeriodIssueRow[];
  /** จำนวนงานที่จะโชว์ในป๊อปอัพ (ทุกประเภทที่เสร็จแล้ว + กรอกเวลาแล้ว) */
  listedCount: number;
  /** รายการงานที่จะโชว์ในป๊อปอัพ (ทุกประเภท) — คนละชุดกับ `issues` */
  listedIssues: PeriodIssueRow[];
  /** จำนวนงานที่แจ้ง**หลังหมดอายุ** — โชว์เป็น "รายการช่วงหมดอายุ" */
  afterExpiryCount: number;
  /** รายการหลังหมดอายุ (คนละชุดกับ `listedIssues` — ไม่ตัด MA) */
  afterExpiryIssues: PeriodIssueRow[];
}

/** `GET /apps/usage-counts?recordIds=` — นับหลายรอบพร้อมกันแบบไม่โหลดรายการ */
export interface UsageCountResult {
  recordId: number;
  count: number;
  periodUsedHours: number;
  /**
   * **จำนวนงานของ "คู่ แอป×บริษัท" แยกตามประเภท** — ระดับ**คู่** (ไม่ผูกกับ
   * รอบ) จึงได้ค่าเดียวกันทุกแถวของคู่เดียวกัน · ฝั่งรายงานเลือกโชว์เฉพาะ
   * **แถวล่าสุดของคู่** เพื่อไม่ให้ตัวเลขซ้ำทุกรอบ (ดู `isLatestOfPair`)
   * · `none` = ยังไม่ระบุ type (`task_type IS NULL` หรือค่าที่ไม่รู้จัก)
   */
  byType: TaskTypeCounts;
  /** จำนวนงานที่จะโชว์ในป๊อปอัพ (ทุกประเภทที่เสร็จแล้ว + กรอกเวลาแล้ว) */
  listedCount: number;
  /** จำนวนงานหลังหมดอายุของรอบนี้ (เฉพาะรอบล่าสุดของคู่) — ไม่ตัด MA */
  afterExpiryCount: number;
}

/**
 * จำนวนงานแยกตาม type — 4 ช่องคงที่ · **ไม่กรอง `task_type`** ตอนนับ
 * (ต่างจาก `DEDUCTED_TASK_TYPES` ที่ใช้กับชั่วโม์) จึงรวมบั๊ก / Requirement /
 * ยังไม่ระบุ ด้วย และ**ไม่ต้องเคยกรอกเวลา**
 */
export interface TaskTypeCounts {
  bug: number;
  ma: number;
  requirement: number;
  none: number;
}

/** คู่ที่ไม่มีงานเลย — คืน 0 ทุกช่อง (รู้จริงว่าเป็น 0 ไม่ใช่ "ดึงไม่ได้") */
function zeroTypeCounts(): TaskTypeCounts {
  return { bug: 0, ma: 0, requirement: 0, none: 0 };
}

/** กันส่ง recordId เป็นพัน ๆ ตัวเข้ามา (หน้ารายงานไม่เกิน 100 แถว/หน้าอยู่แล้ว) */
const MAX_USAGE_COUNT_IDS = 100;

/**
 * **ตรวจว่าชั่วโมง MA ของคู่หมดแล้วหรือยัง** — เรียกหลังกรอกเวลาจริง
 * (`IssuesService.setActualFixDuration`) **และตอนการ์ดเข้า `เสร็จสิ้น`**
 * (`IssuesService.move()`) แบบ fire-and-forget — ทางหลังจำเป็นเพราะชั่วโมงที่
 * กรอกไว้ที่รีวิวจะยังไม่ถูกนับจนกว่าจะปิดงาน (ดู `deductionRows()`)
 *
 * สูตรใช้ไป = **ของ "รอบนั้น"** (แถวล่าสุดของคู่) — งานที่กรอกเข้าคู่นั้นซึ่ง
 * `task_type = 'ma'` และ **ผู้แจ้งอยู่บริษัทคู่นั้น**
 * (`customer_id` → `users.company_id`) ถูก**ผูกเข้ารอบด้วย `pickPeriodId()`**
 * (งานที่กรอก*ก่อน*รอบนั้นจะถูกสร้าง = ของรอบก่อนหน้า) — **ตรงกับคอลัมน์
 * "ใช้ไป"/"คงเหลือ" รายรอบบนจอทุกประการ** (รวมการทิ้งงานถังขยะและงานที่จับคู่
 * ไม่ได้) จึง**ไม่ ring** เมื่อ "เพิ่งซื้อชั่วโม์แต่ยังไม่ได้ใช้" (ข้อสรุปจากผู้ใช้:
 * "ยังไม่ได้ใช้เลยทำไมมีใช้ไป")
 *
 * **Fail-open ทุกขั้น** (ไม่มีแอป/ไม่มีผู้แจ้ง/ผู้แจ้งไม่มีบริษัท/ไม่มีแถว
 * คู่/ยังไม่กรอก MA → หยุดเงียบ ๆ) · **ครั้งเดียวต่อรอบ**: แจ้งแล้ว stamp
 * `ma_notified_at` ที่แถวล่าสุดของคู่; กลับมาไม่หมด (งานถูกย้ายเป็นบั๊ก /
 * แก้ MA ให้มากขึ้น) → ล้าง latch เพื่อให้รอบถัดไปแจ้งใหม่ได้ ·
 * ต่ออายุ/ซื้อชั่วโมงไม่ต้องแตะ — แถบที่ append ใหม่ได้ `NULL` อยู่แล้ว
 *
 * **ไม่เคย throw** — ทุกอย่างห่อ try/catch + logger เพราะคอลเลกชันนี้วิ่ง
 * หลัง `save()` แล้ว การกรอกเวลาต้องไม่พังเพราะการแจ้งเตือน
 */
@Injectable()
export class MaUsageService {
  private readonly logger = new Logger(MaUsageService.name);

  constructor(
    @InjectRepository(AppCompany)
    private readonly links: Repository<AppCompany>,
    @InjectRepository(App)
    private readonly apps: Repository<App>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  /** จุดเรียกจาก `setActualFixDuration` — ไม่รอผล ไม่ throw (ดู docblock) */
  async checkAndNotify(issue: Issue): Promise<void> {
    try {
      // ---- fail-open: จับคู่ไม่ได้ = ไม่หักที่ไหน จึงไม่มีอะไรให้แจ้ง ----
      if (!issue.appId) return;
      const reporterId = issue.customerId;
      if (!reporterId) return;
      const reporter = await this.users.findOne({ where: { id: reporterId } });
      const companyId = reporter?.companyId ?? null;
      if (companyId == null) return;

      // แถวล่าสุดของคู่ = แถบที่ `/systems` โชว์ (`id DESC` เหมือน `rows` memo)
      const [link] = await this.links.find({
        where: { appId: issue.appId, companyId },
        order: { id: "DESC" },
        take: 1,
      });
      if (!link || link.maHours == null) return;
      // สัญญาที่ถูกยกเลิก (1848) — ไม่ยิง "MA หมดแล้ว" และไม่ไปแตะ latch เดิม
      if (link.cancelledAt != null) return;

      // **ใช้ไปของรอบนั้น** (ไม่ใช่ยอดรวมคู่) — ผูกงานเข้ารอบด้วย `pickPeriodId()`
      // เหมือน `usage-counts`/`periodUsage` → แถวที่เพิ่งซื้อชั่วโม์ (ยังไม่ได้ใช้)
      // ใช้ไป = 0 จึงไม่ถือว่าหมด · fail-open: ไม่มี entry = 0
      const usedSeconds = await this.periodUsedSeconds(issue.appId, companyId, link.id);
      const depleted = usedSeconds >= link.maHours * 3600;
      const alreadyRung = link.maNotifiedAt != null;

      if (!depleted) {
        // ชั่วโมงกลับมา (งานย้ายเป็นบั๊ก / MA ถูกแก้ให้มากขึ้น) → เปิดรอบใหม่
        if (alreadyRung) {
          await this.links.update({ id: link.id }, { maNotifiedAt: null });
        }
        return;
      }
      if (alreadyRung) return; // ครั้งเดียวต่อรอบ — เงียบจนกว่าจะมีชั่วโมงใหม่

      // stamp ก่อนแจ้ง: `notify()` ไม่เคย throw แต่กัน case พังกลางคัน
      // ไม่ให้ยิงซ้ำทุกครั้งที่กรอกเวลา ( spam หนักกว่าแจ้งพลาด 1 ครั้ง)
      await this.links.update({ id: link.id }, { maNotifiedAt: new Date() });

      const [app, company] = await Promise.all([
        this.apps.findOne({ where: { id: issue.appId } }),
        this.companies.findOne({ where: { id: companyId } }),
      ]);
      await this.notifications.notifyMaDepleted({
        companyId,
        appId: issue.appId,
        appName: app?.name ?? "",
        companyName: company?.name ?? "",
        maHours: link.maHours,
        usedHours: usedSeconds / 3600,
      });
    } catch (error) {
      this.logger.warn(`ma depletion check failed: ${(error as Error).message}`);
    }
  }

  /**
   * **"ใช้ไป" ของ "รอบนั้น"** (วินาที) — membership ชุดเดียวกับ `deductionRows()`
   * (งานถังขยะถูกทิ้ง, `task_type` ที่หัก, ผู้แจ้งมีบริษัท, **เฉพาะเสร็จสิ้น**)
   * แล้ว**ผูกเข้ารอบด้วย
   * `pickPeriodId()`** — งานที่กรอก*ก่อน*รอบนั้นจะถูกสร้าง = ของรอบก่อนหน้า ·
   * `actual_fix_at IS NULL` (กรอกก่อนระบบ) = "ไม่ระบุรอบ" → ไม่ถูกนับที่นี่
   * (ตรงกับคอลัมน์ "ใช้ไป" รายรอบบนจอ — ชั่วโม์พวกนั้นถูกเล่าผ่าน
   * `unattributedHours` ในแท็บ "งานที่ถูกตัด MA" ไม่ได้หายไปไหน)
   *
   * (เดิมเป็น `usedSeconds()` ระดับ**คู่** — เปลี่ยนเพราะผู้ใช้ทักว่าแถวที่เพิ่ง
   * ซื้อชั่วโม์โชว์ "ใช้ไป 40" ทั้งที่ยังไม่ได้ใช้ แล้วยังถูก ring กระดิ่งด้วย)
   */
  private async periodUsedSeconds(
    appId: number,
    companyId: number,
    recordId: number,
  ): Promise<number> {
    const pairRows = await this.periodRowsFor(appId, companyId);
    const rows = this.forPair(await this.deductionRows([appId]), appId, companyId);
    const { byPeriod } = this.attribute(rows, this.toPeriodRows(pairRows));
    return byPeriod.get(recordId)?.seconds ?? 0;
  }

  /* ------------------------------------------------------------------ */
  /*  รายการที่ถูกตัดจากช่วง MA — รอบต่อรอบ                              */
  /*  (ตอนนี้เป็น**แหล่งของ "ใช้ไป" รายรอบ** ทั้งฝั่งจอและฝั่งกระดิ่ง)       */
  /* ------------------------------------------------------------------ */

  /**
   * ชั่วโม์ที่หักจาก MA ได้ของแอปที่ระบุ — **membership ชุดเดียวกันเป๊ะ** กับ
   * `periodUsedSeconds()` (งานถังขยะถูกทิ้ง, `task_type` ที่หัก, ผู้แจ้งต้องมี
   * บริษัท, **ต้องอยู่ใน `เสร็จสิ้น`**) เพื่อให้ผลรวมทุกช่อง = ตัว "ใช้ไป" ระดับคู่
   * เสมอ · คืนมายัง **ไม่ผูกกับรอบ** เพราะกติกาผูกต้องเห็นแถวทั้งคู่พร้อมกัน
   * (ทำใน `attribute()`)
   *
   * กรอง `status_id = DONE_STATUS_ID` → งานที่ยังไม่ปิด (รอรับเรื่อง / รอดำเนินการ /
   * กำลังดำเนินการ / รีวิว) **หัก 0** แม้จะกรอกชั่วโมงไว้แล้ว · แก้ตัวเลขในรีวิว
   * ได้อิสระ แล้วค่อยถูกนับตอนลากเข้าเสร็จสิ้น
   */
  private async deductionRows(appIds: number[]): Promise<DeductionRow[]> {
    if (appIds.length === 0) return [];
    const raw = await this.issues
      .createQueryBuilder("issue")
      .leftJoin("issue.customer", "reporter")
      .select("issue.id", "id")
      .addSelect("issue.app_id", "app_id")
      .addSelect("reporter.company_id", "company_id")
      .addSelect("issue.actual_fix_duration", "seconds")
      .addSelect("issue.actual_fix_at", "at")
      .where("issue.app_id IN (:...appIds)", { appIds })
      .andWhere("issue.deleted_at IS NULL")
      // นับเฉพาะงานที่ปิดแล้ว — ชั่วโมงที่กรอกไว้ในรีวิวยังไม่หัก (แก้ได้ก่อนปิด)
      .andWhere("issue.status_id = :doneStatusId", { doneStatusId: DONE_STATUS_ID })
      .andWhere("issue.task_type IN (:...types)", { types: [...DEDUCTED_TASK_TYPES] })
      .andWhere("reporter.company_id IS NOT NULL")
      .getRawMany<{
        id: string;
        app_id: string;
        company_id: string;
        seconds: string | null;
        at: Date | string | null;
      }>();

    return raw.map((row) => ({
      id: Number(row.id),
      appId: Number(row.app_id),
      companyId: Number(row.company_id),
      seconds: Number(row.seconds ?? 0),
      at: row.at == null ? null : new Date(row.at),
    }));
  }

  /**
   * ผูกชั่วโมงเข้ารอบด้วย `pickPeriodId()` — ทุกชั่วโมงตกอยู่ในช่องใดช่องหนึ่ง
   * (รอบใดรอบหนึ่ง หรือ "ไม่ระบุรอบ") จึงได้ invariant
   * `Σ byPeriod + unattributedSeconds === pairSeconds` ซึ่งเทสต์คุมไว้
   */
  private attribute(rows: DeductionRow[], periodRows: PeriodRow[]): Attribution {
    const byPeriod = new Map<number, { seconds: number; ids: number[] }>();
    let unattributedSeconds = 0;
    let pairSeconds = 0;

    for (const row of rows) {
      pairSeconds += row.seconds;
      const periodId = pickPeriodId(periodRows, row.at);
      if (periodId == null) {
        unattributedSeconds += row.seconds;
        continue;
      }
      const bucket = byPeriod.get(periodId) ?? { seconds: 0, ids: [] };
      bucket.seconds += row.seconds;
      bucket.ids.push(row.id);
      byPeriod.set(periodId, bucket);
    }

    return { byPeriod, unattributedSeconds, pairSeconds };
  }

  /** แถวชั่วโมงของ **คู่เดียว** (แยกจาก `deductionRows` ที่ดึงหลายแอปในคำสั่งเดียว) */
  private forPair(rows: DeductionRow[], appId: number, companyId: number): DeductionRow[] {
    return rows.filter((row) => row.appId === appId && row.companyId === companyId);
  }

  /**
   * **งานทั้งหมดที่จะโชว์ในป๊อปอัพ "รายการที่ตัด"** — ไม่กรอง `task_type`
   * (บั๊ก / Requirement / ยังไม่ระบุ โผล่หมดตาม review comment) แต่ยังคง
   * เกณฑ์ **เสร็จสิ้น + กรอกเวลาแล้ว** · เส้นคู่ + ทิ้งถังขยะเหมือนสูตร MA
   * ทุกประการ · **ไม่ส่งผลต่อ `count`/`pairUsedHours`/invariant** เพราะไม่ได้
   * ผ่าน `attribute()` เลย
   */
  private async listedRows(appIds: number[]): Promise<ListedRow[]> {
    if (appIds.length === 0) return [];
    const raw = await this.issues
      .createQueryBuilder("issue")
      .leftJoin("issue.customer", "reporter")
      // select ตัวแรกเป็น `actual_fix_at` เพื่อให้ fake query ใน unit test แยก
      // ออกจาก `deductionRows()` ที่เริ่มด้วย `issue.id` (ไม่กระทบ SQL จริง)
      .select("issue.actual_fix_at", "at")
      .addSelect("issue.id", "id")
      .addSelect("issue.app_id", "app_id")
      .addSelect("reporter.company_id", "company_id")
      .where("issue.app_id IN (:...appIds)", { appIds })
      .andWhere("issue.deleted_at IS NULL")
      .andWhere("reporter.company_id IS NOT NULL")
      .andWhere("issue.status_id = :doneStatusId", { doneStatusId: DONE_STATUS_ID })
      .andWhere("issue.actual_fix_duration > 0")
      .getRawMany<{
        id: string;
        app_id: string;
        company_id: string;
        at: Date | string | null;
      }>();
    return raw.map((row) => ({
      id: Number(row.id),
      appId: Number(row.app_id),
      companyId: Number(row.company_id),
      at: row.at == null ? null : new Date(row.at),
    }));
  }

  /** ผูกงานที่จะโชว์เข้ารอบด้วย `actual_fix_at` — กติกาเดียวกับ `attribute()` ของ MA */
  private attributeListed(rows: ListedRow[], periodRows: PeriodRow[]): Map<number, number[]> {
    const out = new Map<number, number[]>();
    for (const row of rows) {
      const periodId = pickPeriodId(periodRows, row.at);
      if (periodId == null) continue;
      out.set(periodId, [...(out.get(periodId) ?? []), row.id]);
    }
    return out;
  }

  /** แถวช่วงทั้งหมดของคู่ — เรียง `id ASC` เพื่อให้ `round` ตรงกับแท็บประวัติ */
  private async periodRowsFor(appId: number, companyId: number): Promise<AppCompany[]> {
    return this.links.find({ where: { appId, companyId }, order: { id: "ASC" } });
  }

  /** แปลงแถวช่วงเป็นรูปที่กติกาผูกต้องใช้ (แค่ 2 คอลัมน์) */
  private toPeriodRows(rows: AppCompany[]): PeriodRow[] {
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
    }));
  }

  /**
   * **รายการที่ถูกตัดจากช่วง MA นี้** — ของ `recordId` ที่ระบุ (ต้องเป็นของ `appId`
   * ด้วย มิฉะนั้น 404) · คืนทั้งตัวเลขสรุปและรายการจริงให้ป๊อปอัพ `/systems`
   * กับ drill-down ของรายงาน `/reports` ใช้ร่วมกัน
   *
   * `contract` (`viewer-scope.ts`) — ลูกค้าอ่านของคู่**บริษัทอื่น**ไม่ได้: คืน 404
   * เหมือน recordId ที่ไม่มีจริง เพราะ payload มีชื่อ/เลขงานของคู่นั้นอยู่
   */
  async periodUsage(
    appId: number,
    recordId: number,
    contract?: ViewerScope,
  ): Promise<PeriodUsageResult> {
    const link = await this.links.findOne({ where: { id: recordId } });
    if (!link || link.appId !== appId) {
      throw new NotFoundException(`App company record ${recordId} not found`);
    }
    if (
      contract?.mode === "own" &&
      (contract.companyId == null || link.companyId !== contract.companyId)
    ) {
      // ข้อความเดิมเป๊ะ — ห้ามบอกคนเรียกว่า "มีแถวอยู่ แต่ไม่ใช่ของคุณ"
      throw new NotFoundException(`App company record ${recordId} not found`);
    }

    const pairRows = await this.periodRowsFor(link.appId, link.companyId);
    const rows = this.forPair(
      await this.deductionRows([link.appId]),
      link.appId,
      link.companyId,
    );
    const { byPeriod, unattributedSeconds, pairSeconds } = this.attribute(
      rows,
      this.toPeriodRows(pairRows),
    );
    const bucket = byPeriod.get(link.id) ?? { seconds: 0, ids: [] };

    /** รายการที่จะโชว์ — คำนวณแยกจาก `bucket` (MA) เสมอ */
    const listedForPair = (await this.listedRows([link.appId])).filter(
      (row) => row.companyId === link.companyId,
    );
    const listedIds =
      this.attributeListed(listedForPair, this.toPeriodRows(pairRows)).get(link.id) ?? [];
    /**
     * งานหลังวันหมดอายุจะโชว์เป็น **"รายการช่วงหมดอายุ"** ต่างหาก · ทำเฉพาะ
     * **รอบล่าสุดของคู่** (ถ้ามีการต่ออายุแล้ว งานในช่วงว่างจะยังอยู่รอบเก่า
     * ตาม `pickPeriodId()` — ห้ามโชว์ซ้ำเป็นรายการใหม่) · แยกออกจาก
     * `listedIssues` ของสัญญาจริงเพื่อไม่ให้รายการเดียวโผล่ 2 ที่
     */
    const atById = new Map(listedForPair.map((row) => [row.id, row.at]));
    const isLatest = pairRows.length > 0 && pairRows[pairRows.length - 1].id === link.id;
    const afterIds = isLatest
      ? listedIds.filter((id) => isAfterExpiryDay(atById.get(id), link.expiresAt))
      : [];
    const withinIds = listedIds.filter((id) => !afterIds.includes(id));

    return {
      recordId: link.id,
      appId: link.appId,
      companyId: link.companyId,
      round: pairRows.findIndex((row) => row.id === link.id) + 1,
      kind: link.kind,
      startedAt: link.startedAt,
      expiresAt: link.expiresAt,
      maHours: link.maHours,
      pairUsedHours: round1(pairSeconds / 3600),
      periodUsedHours: round1(bucket.seconds / 3600),
      unattributedHours: round1(unattributedSeconds / 3600),
      count: bucket.ids.length,
      issues: await this.loadIssues(bucket.ids),
      listedCount: withinIds.length,
      listedIssues: await this.loadIssues(withinIds, link.expiresAt),
      afterExpiryCount: afterIds.length,
      afterExpiryIssues: await this.loadIssues(afterIds, link.expiresAt),
    };
  }

  /**
   * **จำนวนงานของ "คู่ แอป×บริษัท" แยกตามประเภท** — ระดับ**คู่** ไม่ผูกกับรอบ
   * และ**ไม่กรอง `task_type`** (ต่างจาก `deductionRows()` ที่กรองเฉพาะ `ma`
   * เพื่อคำนวณชั่วโม์): บั๊ก / Requirement / ยังไม่ระบุ เข้าหมด และ**ไม่ต้อง
   * เคยกรอกเวลา** จึงตอบคำถาม "โครงการนี้มีงานประเภทอะไรบ้าง" ได้จริง
   *
   * - เส้นผูกงาน→คู่ = **ผู้แจ้งมีบริษัท** (`issues.customer_id` →
   *   `users.company_id`) เหมือนสูตรหัก MA → งานที่ไม่มีผู้แจ้ง/ผู้แจ้งไม่มี
   *   บริษัท ไม่ตกเข้าคู่ไหน (จงใจ: คู่สัญญาบอกไม่ได้ว่างานนั้นของใคร)
   * - งานถังขยะ (`deleted_at`) ถูกทิ้ง
   * - คู่ที่ไม่มีงานเลย → ไม่มีแถวในผลลัพธ์ ให้ caller คืน `0` ทุกช่อง
   *   (รู้จริงว่าเป็น 0 ต่างจาก id ที่ไม่มีแถวจริงซึ่งถูกตัดออกไปก่อนแล้ว)
   * - นับ **ครั้งเดียวต่อหน้า** (ไม่ใช่ต่อแถว) — เรียกจาก `usageCounts()` เท่านั้น
   */
  private async pairTypeCounts(appIds: number[]): Promise<Map<string, TaskTypeCounts>> {
    const out = new Map<string, TaskTypeCounts>();
    if (appIds.length === 0) return out;

    const raw = await this.issues
      .createQueryBuilder("issue")
      .leftJoin("issue.customer", "reporter")
      .select("issue.app_id", "app_id")
      .addSelect("reporter.company_id", "company_id")
      .addSelect("issue.task_type", "task_type")
      .addSelect("COUNT(*)::int", "n")
      .where("issue.app_id IN (:...appIds)", { appIds })
      .andWhere("issue.deleted_at IS NULL")
      .andWhere("reporter.company_id IS NOT NULL")
      .groupBy("issue.app_id")
      .addGroupBy("reporter.company_id")
      .addGroupBy("issue.task_type")
      .getRawMany<{ app_id: string; company_id: string; task_type: string | null; n: string }>();

    for (const row of raw) {
      const key = pairKey(Number(row.app_id), Number(row.company_id));
      // ค่าที่รู้จัก = 3 ค่าของ `IssueTaskType` · `NULL` / ค่าแปลก ๆ → `none`
      const type: keyof TaskTypeCounts =
        row.task_type === "bug" || row.task_type === "ma" || row.task_type === "requirement"
          ? row.task_type
          : "none";
      const bucket = out.get(key) ?? zeroTypeCounts();
      bucket[type] += Number(row.n);
      out.set(key, bucket);
    }
    return out;
  }

  /**
   * **นับหลายรอบพร้อมกัน** — ใช้เติมคอลัมน์ "รายการที่ตัด" ในตาราง (นับอย่างเดียว
   * ไม่โหลดรายการ จึงยิงครั้งเดียวต่อหน้ารายงาน ไม่ใช่ต่อแถว) · `recordIds`
   * เกิน `MAX_USAGE_COUNT_IDS` ถูกตัดทิ้งส่วนที่เกิน และ id ที่ไม่มีแถวจริง
   * **ไม่ถูกคืนเป็น 0** — ไม่มี entry = "ไม่รู้" ให้ฝั่งเว็บโชว์ `—` (ห้ามเดา)
   *
   * `contract` (`viewer-scope.ts`) — ลูกค้าถามได้เฉพาะ recordId ของบริษัทตัวเอง:
   * แถวต่างบริษัทถูก**ตัดทิ้งก่อน** (ผลลัพธ์ = ไม่คืนแถว ไม่ใช่คืน 0 จึงยังตรง
   * กับกติกา "ไม่รู้ = โชว์ `—`" เดิมทุกประการ)
   *
   * ทุกแถวได้ `byType` (ระดับคู่ — ค่าเดียวกันทุกรอบของคู่เดียวกัน) กับ
   * `listedCount` (งานทุกประเภทที่เสร็จและกรอกเวลาแล้ว — ใช้เติมตัวเลขใน
   * คอลัมน์ "รายการที่ตัด") ด้วย · ไม่กระทบ `count` / `periodUsedHours`
   * ซึ่งยังเป็นสูตร MA เดิมทุกประการ
   */
  async usageCounts(recordIds: number[], contract?: ViewerScope): Promise<UsageCountResult[]> {
    const ids = [...new Set(recordIds)]
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, MAX_USAGE_COUNT_IDS);
    if (ids.length === 0) return [];

    const found = await this.links.find({ where: { id: In(ids) } });
    const links =
      contract?.mode === "own"
        ? found.filter(
            (link) => contract.companyId != null && link.companyId === contract.companyId,
          )
        : found;
    if (links.length === 0) return [];

    // ต้องเอาแถว *ทั้งคู่* มาผูกด้วย (ไม่ใช่แค่ recordIds ที่ขอ) เพราะกติกาผูก
    // ต้องเทียบกับ "แถวอื่นของคู่เดียวกัน" — โหลดคู่ที่เกี่ยวข้องในคำสั่งเดียว
    const pairWhere = links.map((link) => ({
      appId: link.appId,
      companyId: link.companyId,
    }));
    const pairRows = await this.links.find({ where: pairWhere, order: { id: "ASC" } });

    const periodRowsByPair = new Map<string, PeriodRow[]>();
    for (const row of pairRows) {
      const key = pairKey(row.appId, row.companyId);
      periodRowsByPair.set(key, [...(periodRowsByPair.get(key) ?? []), {
        id: row.id,
        createdAt: row.createdAt,
      }]);
    }

    const appIds = [...new Set(links.map((link) => link.appId))];
    // เรียงแบบนี้ใน `usageCounts` — `deductionRows` (round 1 ของ QB) แล้วค่อย
    // `pairTypeCounts` (round 2) เพื่อไม่ให้กระทบเทสต์เดิมที่ assert ผล callแรก
    const deductionRows = await this.deductionRows(appIds);
    const typeCounts = await this.pairTypeCounts(appIds);
    // query ที่ 3 — รายการที่จะโชว์ (ทุกประเภท) แยกจากสูตร MA เสมอ
    const listedRows = await this.listedRows(appIds);
    const listedByPair = new Map<string, Map<number, number[]>>();
    const listedAtByPair = new Map<string, Map<number, Date | null>>();
    for (const [key, rows] of periodRowsByPair) {
      const [appId, companyId] = key.split(":").map(Number);
      const pairListed = listedRows.filter(
        (row) => row.appId === appId && row.companyId === companyId,
      );
      listedByPair.set(key, this.attributeListed(pairListed, rows));
      listedAtByPair.set(key, new Map(pairListed.map((row) => [row.id, row.at])));
    }

    return links.map((link) => {
      const key = pairKey(link.appId, link.companyId);
      const { byPeriod } = this.attribute(
        this.forPair(deductionRows, link.appId, link.companyId),
        periodRowsByPair.get(key) ?? [],
      );
      const bucket = byPeriod.get(link.id);
      /** งานหลังหมดอายุ — เฉพาะรอบล่าสุดของคู่ (มีรอบใหม่แล้ว = อยู่รอบเก่า) */
      const periods = periodRowsByPair.get(key) ?? [];
      const isLatest = periods.length > 0 && periods[periods.length - 1].id === link.id;
      const atById = listedAtByPair.get(key) ?? new Map();
      const afterExpiryCount = isLatest
        ? (listedByPair.get(key)?.get(link.id) ?? []).filter((id) =>
            isAfterExpiryDay(atById.get(id), link.expiresAt),
          ).length
        : 0;
      return {
        recordId: link.id,
        count: bucket?.ids.length ?? 0,
        periodUsedHours: round1((bucket?.seconds ?? 0) / 3600),
        // คู่ไม่มีงาน → zeros (รู้จริงว่า 0) · คู่มีงานแต่ไม่มี MA เลยก็ได้ zeros
        // ที่มีช่องอื่นเป็น 0 จริง — ต่างจาก id ที่ไม่มีแถวจริงซึ่งถูกตัดออกไปแล้ว
        byType: typeCounts.get(key) ?? zeroTypeCounts(),
        listedCount: listedByPair.get(key)?.get(link.id)?.length ?? 0,
        afterExpiryCount,
      };
    });
  }

  /**
   * โหลดรายการจริงของรอบ — ตามลำดับที่กรอกชั่วโมง (ใหม่ → เก่า)
   * `expiresAt` ใส่เฉพาะตอนโหลดรายการที่จะโชว์ในป๊อปอัพ (เพื่อ mark งานหลังหมดอายุ)
   */
  private async loadIssues(
    ids: number[],
    expiresAt?: Date | string | null,
  ): Promise<PeriodIssueRow[]> {
    if (ids.length === 0) return [];
    const issues = await this.issues.find({
      where: { id: In(ids) },
      relations: ["status", "programmer"],
      order: { actualFixAt: "DESC", id: "DESC" },
    });
    return issues.map((issue) => ({
      id: issue.id,
      issueNumber: issue.issueNumber ?? null,
      title: issue.title,
      taskType: issue.taskType ?? null,
      hours: round1((issue.actualFixDuration ?? 0) / 3600),
      deductedAt: issue.actualFixAt ?? null,
      statusName: issue.status?.name ?? null,
      assigneeName: issue.programmer?.name ?? null,
      afterExpiry: isAfterExpiryDay(issue.actualFixAt, expiresAt),
    }));
  }
}
