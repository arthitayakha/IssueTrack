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

/**
 * ประเภทงานที่**หักจาก MA** — ตรงกับฝั่งรายงาน (`GET /reports/usage` ที่หน้าเว็บ
 * ส่ง `taskTypes=feature,requirement` มาเอง) · `bug` กับ `NULL` (ยังไม่ระบุ) ไม่หัก
 */
const DEDUCTED_TASK_TYPES = ["feature", "requirement"] as const;

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
  /** จำนวนรายการในรอบนี้ */
  count: number;
  issues: PeriodIssueRow[];
}

/** `GET /apps/usage-counts?recordIds=` — นับหลายรอบพร้อมกันแบบไม่โหลดรายการ */
export interface UsageCountResult {
  recordId: number;
  count: number;
  periodUsedHours: number;
}

/** กันส่ง recordId เป็นพัน ๆ ตัวเข้ามา (หน้ารายงานไม่เกิน 100 แถว/หน้าอยู่แล้ว) */
const MAX_USAGE_COUNT_IDS = 100;

/**
 * **ตรวจว่าชั่วโมง MA ของคู่หมดแล้วหรือยัง** — เรียกหลังกรอกเวลาจริง
 * (`IssuesService.setActualFixDuration`) แบบ fire-and-forget
 *
 * สูตรใช้ไป = SUM(`issues.actual_fix_duration`) ของงานแอปนั้นซึ่ง
 * **ผู้แจ้งอยู่บริษัทคู่นั้น** (`customer_id` → `users.company_id`) และ
 * `task_type IN ('feature','requirement')` — **ตรงกับ `usageByPair()` ของ
 * `/reports/usage` ทุกประการ** (รวมการทิ้งงานที่จับคู่ไม่ได้และงานถังขยะ)
 * เพื่อให้ "หมด" ที่นี่กับ "คงเหลือ ≤ 0" บนตาราง `/systems` เป็นเลขเดียวกัน
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

      const usedSeconds = await this.usedSeconds(issue.appId, companyId);
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
   * "ใช้ไป" ของคู่ แอป×บริษัท (วินาที) — **สูตรเดียวกับ `usageByPair()`**:
   * กรองงานถังขยะ + `task_type` ที่หัก + ผู้แจ้งอยู่บริษัทนั้น · งานที่จับคู่
   * ไม่ได้ (ผู้แจ้งไม่มีบริษัท) หลุดจาก JOIN เอง = ไม่ถูกหัก (ตรงกติกา)
   */
  private async usedSeconds(appId: number, companyId: number): Promise<number> {
    const raw = await this.issues
      .createQueryBuilder("issue")
      .leftJoin("issue.customer", "reporter")
      .where("issue.app_id = :appId", { appId })
      .andWhere("issue.deleted_at IS NULL")
      .andWhere("issue.task_type IN (:...types)", { types: [...DEDUCTED_TASK_TYPES] })
      .andWhere("reporter.company_id = :companyId", { companyId })
      .select("COALESCE(SUM(issue.actual_fix_duration), 0)", "seconds")
      .getRawOne<{ seconds: string }>();
    return Number(raw?.seconds ?? 0);
  }

  /* ------------------------------------------------------------------ */
  /*  รายการที่ถูกตัดจากช่วง MA — รอบต่อรอบ                              */
  /*  (เสริมข้อมูลใหม่ ไม่แตะตัวเลข "ใช้ไป/คงเหลือ" เดิมแม้แต่ตัวเดียว)     */
  /* ------------------------------------------------------------------ */

  /**
   * ชั่วโมงที่หักจาก MA ได้ของแอปที่ระบุ — **membership ชุดเดียวกันเป๊ะ** กับ
   * `usedSeconds()` / `usageByPair()` (งานถังขยะถูกทิ้ง, `task_type` ที่หัก,
   * ผู้แจ้งต้องมีบริษัท) เพื่อให้ผลรวมทุกช่อง = ตัว "ใช้ไป" เดิม · คืนมายัง
   * **ไม่ผูกกับรอบ** เพราะกติกาผูกต้องเห็นแถวทั้งคู่พร้อมกัน (ทำใน `attribute()`)
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
   */
  async periodUsage(appId: number, recordId: number): Promise<PeriodUsageResult> {
    const link = await this.links.findOne({ where: { id: recordId } });
    if (!link || link.appId !== appId) {
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
    };
  }

  /**
   * **นับหลายรอบพร้อมกัน** — ใช้เติมคอลัมน์ "รายการที่ตัด" ในตาราง (นับอย่างเดียว
   * ไม่โหลดรายการ จึงยิงครั้งเดียวต่อหน้ารายงาน ไม่ใช่ต่อแถว) · `recordIds`
   * เกิน `MAX_USAGE_COUNT_IDS` ถูกตัดทิ้งส่วนที่เกิน และ id ที่ไม่มีแถวจริง
   * **ไม่ถูกคืนเป็น 0** — ไม่มี entry = "ไม่รู้" ให้ฝั่งเว็บโชว์ `—` (ห้ามเดา)
   */
  async usageCounts(recordIds: number[]): Promise<UsageCountResult[]> {
    const ids = [...new Set(recordIds)]
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, MAX_USAGE_COUNT_IDS);
    if (ids.length === 0) return [];

    const links = await this.links.find({ where: { id: In(ids) } });
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
    const deductionRows = await this.deductionRows(appIds);

    return links.map((link) => {
      const key = pairKey(link.appId, link.companyId);
      const { byPeriod } = this.attribute(
        this.forPair(deductionRows, link.appId, link.companyId),
        periodRowsByPair.get(key) ?? [],
      );
      const bucket = byPeriod.get(link.id);
      return {
        recordId: link.id,
        count: bucket?.ids.length ?? 0,
        periodUsedHours: round1((bucket?.seconds ?? 0) / 3600),
      };
    });
  }

  /** โหลดรายการจริงของรอบ — ตามลำดับที่กรอกชั่วโมง (ใหม่ → เก่า) */
  private async loadIssues(ids: number[]): Promise<PeriodIssueRow[]> {
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
    }));
  }
}
