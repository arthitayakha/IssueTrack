import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { App } from "./entities/app.entity";
import { AppCompany, AppExpiryStage, AppExpiryStatus } from "./entities/app-company.entity";
import { Company } from "../companies/entities/company.entity";
import { NotificationsService } from "../notifications/notifications.service";
import { daysBetween, toIsoDate, todayIso } from "../../common/dates";

/** แจ้งเตือน "ใกล้หมดอายุ" เมื่อเหลือไม่เกิน 30 วัน */
export const EXPIRY_WARNING_DAYS = 30;
/** แจ้งอีกครั้ง (สถานะ `critical` — UI โชว์ "เหลือ n วัน ใกล้หมดอายุ") เมื่อเหลือไม่เกิน 7 วัน */
export const EXPIRY_CRITICAL_DAYS = 7;

/** `none → d30 → d7 → expired` — how far an announcement has progressed. */
const STAGE_RANK: Record<AppExpiryStage, number> = {
  none: 0,
  d30: 1,
  d7: 2,
  expired: 3,
};

/** ชื่อที่ต้องมีตอนแจ้งเตือน — แถวเชื่อมไม่มี relation จึงส่งมากับแถว */
export interface ExpiryNames {
  /** ชื่อแอป (title ของ notification) */
  appName: string;
  /** ชื่อบริษัทของคู่นี้ (context) — 1 แอปผูกหลายเจ้า ต้องบอกว่าเจ้าไหน */
  companyName: string;
}

/**
 * อายุ **คู่ แอป×บริษัท** — **the only writer** of `app_companies.expiry_status`
 * และ `app_companies.expiry_notified`. นับหนึ่ง "ต่อแถว" ไม่ใช่ต่อแอป:
 * วันหมดอายุของมามี่ฟู้ดกับครัวบ้านสวนเป็นคนละเรื่องกัน
 *
 * Two independent questions, two columns:
 *
 * - **สถานะ** (`expiry_status`) — what the chip shows; refreshed whenever the
 *   list is read, after a save, and by the daily cron.
 * - **รอบที่แจ้งแล้ว** (`expiry_notified`) — each threshold (30 วัน, 7 วัน,
 *   หมดอายุ) rings **exactly once ต่อคู่**; the column is what stops the 09:00
 *   sweep from re-announcing the same pair every day.
 *
 * Every caller goes through `reconcile()`, so whichever gets there first wins
 * and the others become no-ops. A notification is never sent twice for the
 * same threshold; if the server was down when a threshold passed, the *next*
 * run announces the nearest one (and skips the ones already behind it).
 *
 * Moving the due date out — or clearing it — resets the announcement column,
 * so a pair that creeps back towards expiry rings again.
 */
@Injectable()
export class AppExpiryService {
  private readonly logger = new Logger(AppExpiryService.name);

  constructor(
    @InjectRepository(AppCompany)
    private readonly links: Repository<AppCompany>,
    @InjectRepository(App)
    private readonly apps: Repository<App>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly notifications: NotificationsService,
  ) {}

  /** `none` / `normal` / `expiring_soon` / `critical` / `expired`. */
  statusFor(expiresAt: Date | string | null | undefined): AppExpiryStatus {
    const left = this.daysLeft(expiresAt);
    if (left === null) return "none"; // ไม่กำหนดวันหมดอายุ
    if (left < 0) return "expired";
    if (left <= EXPIRY_CRITICAL_DAYS) return "critical";
    if (left <= EXPIRY_WARNING_DAYS) return "expiring_soon";
    return "normal";
  }

  /**
   * Refresh one pair: store the status, then ring a threshold if one was
   * crossed (or jumped over — a server that slept through "30 วัน" still
   * announces when it wakes up five days out). Returns `true` when something
   * visible happened (a chip changed or a bell rang).
   *
   * `names` is passed in rather than loaded here: `AppCompany` maps no
   * relation, and the callers (list read / save / daily sweep) already hold
   * the app and company rows.
   *
   * Uses a targeted `UPDATE` keyed on the composite PK rather than `save()` —
   * it must only ever touch this one row.
   */
  async reconcile(link: AppCompany, names: ExpiryNames): Promise<boolean> {
    const nextStatus = this.statusFor(link.expiresAt);
    const nextStage = this.reachedStage(link.expiresAt);
    const storedStage: AppExpiryStage = link.expiryNotified ?? "none";

    // The date moved away (pushed out, cleared, renewed) — forget the
    // announcements so a later approach can ring again.
    let stage = storedStage;
    if (STAGE_RANK[nextStage] < STAGE_RANK[stage]) stage = "none";

    // Ring only when a threshold is crossed; `announce` is the nearest one.
    const announce: AppExpiryStage | null =
      STAGE_RANK[nextStage] > STAGE_RANK[stage] ? nextStage : null;
    if (announce) stage = nextStage;

    const statusChanged = link.expiryStatus !== nextStatus;
    const stageChanged = stage !== storedStage;
    if (statusChanged) link.expiryStatus = nextStatus;
    if (stageChanged) link.expiryNotified = stage;

    const patch: {
      expiryStatus?: AppExpiryStatus;
      expiryNotified?: AppExpiryStage;
    } = {};
    if (statusChanged) patch.expiryStatus = nextStatus;
    if (stageChanged) patch.expiryNotified = stage;
    if (Object.keys(patch).length > 0) {
      await this.links.update(
        { appId: link.appId, companyId: link.companyId },
        patch,
      );
    }

    if (announce) await this.announce(link, names, announce);
    return statusChanged || announce !== null;
  }

  /** Every pair, once a day — the window only moves when the calendar does. */
  @Cron("0 9 * * *", { name: "app-expiry-sweep", timeZone: "Asia/Bangkok" })
  async reconcileAll(): Promise<void> {
    try {
      const links = await this.links.find();
      if (links.length === 0) return;
      const [apps, companies] = await Promise.all([
        this.apps.find(),
        this.companies.find(),
      ]);
      const appName = new Map(apps.map((a) => [a.id, a.name]));
      const companyName = new Map(companies.map((c) => [c.id, c.name]));

      for (const link of links) {
        await this.reconcile(link, {
          appName: appName.get(link.appId) ?? "",
          companyName: companyName.get(link.companyId) ?? "",
        });
      }
    } catch (error) {
      // a sweep must never take the API down
      this.logger.warn(`expiry sweep failed: ${(error as Error).message}`);
    }
  }

  /** วันที่เหลือ (ลบด้วย "วันนี้" แบบ Asia/Bangkok), `null` = ไม่กำหนดวันที่. */
  private daysLeft(expiresAt: Date | string | null | undefined): number | null {
    if (!expiresAt) return null;
    return daysBetween(todayIso(), toIsoDate(expiresAt));
  }

  /** Which threshold has been *reached* — what `expiry_notified` should say. */
  private reachedStage(expiresAt: Date | string | null | undefined): AppExpiryStage {
    const left = this.daysLeft(expiresAt);
    if (left === null) return "none";
    if (left < 0) return "expired";
    if (left <= EXPIRY_CRITICAL_DAYS) return "d7";
    if (left <= EXPIRY_WARNING_DAYS) return "d30";
    return "none";
  }

  /**
   * Who hears about it: every active admin today. When the policy becomes
   * "the customer / company that uses this app", load the users of
   * `link.companyId` and merge their ids in here — nothing else in the feature
   * has to change.
   *
   * The pair *is* the subject now, so the company name is not decoration: one
   * app can be due on three different dates for three different companies and
   * each one rings on its own day. The popover renders "label + title +
   * context", so the day count rides in `context` next to the company:
   * `ใกล้หมดอายุ POS เหลือ 5 วัน · มามี่ฟู้ด`.
   */
  private async announce(
    link: AppCompany,
    names: ExpiryNames,
    stage: AppExpiryStage,
  ): Promise<void> {
    const left = this.daysLeft(link.expiresAt);
    const context =
      stage === "expired" || left === null
        ? names.companyName
        : `เหลือ ${left} วัน${names.companyName ? ` · ${names.companyName}` : ""}`;
    await this.notifications.notifyAdmins({
      action: stage === "expired" ? "app_expired" : "app_expiring",
      title: names.appName,
      context: context.slice(0, 100) || null,
      // วันที่รายคู่อยู่ที่หน้า `/systems` (ข้อมูลระบบ) — ไม่ใช่ที่แท็บแอป
      link: "/systems",
    });
  }
}
