import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, IsNull, LessThanOrEqual, Repository } from "typeorm";
import { daysBetween, toIsoDate, todayIso } from "../../common/dates";
import { AppCompany } from "../apps/entities/app-company.entity";
import { Issue } from "../issues/entities/issue.entity";
import { Notification } from "./entities/notification.entity";
import { NotificationRepeat } from "./entities/notification-repeat.entity";
import {
  NotificationsService,
  type NotificationAction,
  type NotificationPriority,
} from "./notifications.service";

/** เฉพาะเหตุการณ์ที่ "ต้องจัดการ" — การแจ้งเตือนยืนยัน/ธรรมดาไม่มีสายเตือนซ้ำ */
export const REPEATABLE_ACTIONS = new Set<NotificationAction>([
  "ma_depleted",
  "app_expired",
  "app_expiring",
  "needs_assignment",
  "stale",
]);

export interface RepeatCadence {
  /** วันระหว่างครั้งที่ซ้ำ (นับจากวันที่ควรยิงครั้งต่อไป ไม่ใช่จากตอนนี้) */
  intervalDays: number;
  /** จำนวนครั้งที่**ซ้ำ**ได้ (ไม่นับแถวต้นทาง) */
  maxRepeats: number;
}

/**
 * ความถี่ตามระดับความสำคัญ — วันที่ 0 คือแถวต้นทางที่ถูกสร้างตอนเกิดเหตุอยู่แล้ว
 *   high   = ซ้ำทุกวันไม่จำกัด จนกว่าสถานะในระบบจะเปลี่ยน
 *   medium = ซ้ำอีก 4 วันติด (วันที่ 1–4) รวม 5 ครั้ง
 *   low    = ซ้ำอีก 2 ครั้ง วันเว้นวัน (วันที่ 2 และ 4) รวม 3 ครั้ง
 */
export const REPEAT_CADENCE: Record<NotificationPriority, RepeatCadence> = {
  high: { intervalDays: 1, maxRepeats: Number.POSITIVE_INFINITY },
  medium: { intervalDays: 1, maxRepeats: 4 },
  low: { intervalDays: 2, maxRepeats: 2 },
};

/** 09:00 ของวันในเขต Asia/Bangkok — ตรงกับ cron ของ stale/expiry sweep */
export function bangkok9(from: Date, daysAhead = 0): Date {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);
  const at9 = new Date(`${day}T09:00:00+07:00`);
  at9.setUTCDate(at9.getUTCDate() + daysAhead);
  return at9;
}

/**
 * คนละตัวกับ `DailyReminderService` ที่ถูกถอดไป (แถวสรุป "N รายการยังไม่อ่าน")
 * — อันนี้เตือนซ้ำ**รายแถว**ตามระดับความสำคัญของแถวนั้น ๆ จนกว่าจะจัดการเสร็จ
 *
 * ไม่ inject อะไรที่NotificationsService ต้องพึ่งกลับ (ไม่ให้เกิด circular DI):
 * `NotificationsService.notify()` เรียก registrar ที่ service นี้ตั้งใน
 * `onModuleInit()` หลังบันทึกแถว → สายเตือนใหม่ถูกสร้างแบบ fire-and-forget
 */
@Injectable()
export class NotificationRepeatsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationRepeatsService.name);

  constructor(
    @InjectRepository(NotificationRepeat)
    private readonly repeats: Repository<NotificationRepeat>,
    @InjectRepository(AppCompany)
    private readonly links: Repository<AppCompany>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.notifications.setRepeatRegistrar((row) => {
      void this.register(row);
    });
  }

  /**
   * เปิดสายเตือนของแถวที่เพิ่งบันทึก — กันซ้ำด้วย (ผู้รับ + ประเภท + เป้าหมาย)
   * ถ้ามีสายเก่าที่สถานะเปลี่ยนแล้ว ให้ปิดสายเก่าก่อนเปิดสายใหม่ (เหตุการณ์
   * รอบใหม่ เช่น MA หมดอีกหลังเติมแล้วใช้หมดอีก)
   */
  async register(row: Notification): Promise<void> {
    try {
      if (!row.userId || !REPEATABLE_ACTIONS.has(row.type as NotificationAction)) return;

      const where: FindOptionsWhere<NotificationRepeat> = {
        userId: row.userId,
        type: row.type,
        resolvedAt: IsNull(),
        issueId: row.issueId === null ? IsNull() : row.issueId,
        appId: row.appId === null ? IsNull() : row.appId,
        companyId: row.companyId === null ? IsNull() : row.companyId,
      };
      const existing = await this.repeats.findOne({ where });
      if (existing) {
        if (!(await this.isResolved(existing))) return;
        await this.repeats.update(existing.id, { resolvedAt: new Date() });
      }

      await this.repeats.save(
        this.repeats.create({
          userId: row.userId,
          sourceNotificationId: row.id,
          type: row.type,
          title: row.title,
          context: row.context,
          link: row.link,
          issueId: row.issueId,
          appId: row.appId,
          companyId: row.companyId,
          actorId: row.actorId,
          priority: row.priority,
          sentCount: 0,
          // แถวต้นทางคือวันที่ 0 — เริ่มซ้ำพรุ่งนี้ 09:00
          nextNotifyAt: bangkok9(new Date(), 1),
          resolvedAt: null,
        }),
      );
    } catch (error) {
      this.logger.warn(`could not register notification repeat: ${(error as Error).message}`);
    }
  }

  /** ทุกเช้า 09:00 — สายที่ถึงกำหนดและยังไม่เสร็จเท่านั้น */
  @Cron("0 9 * * *", { name: "notification-repeat-sweep", timeZone: "Asia/Bangkok" })
  async sweep(): Promise<void> {
    try {
      // +1 นาทีกันเคส cron ยิงก่อนวินาทีที่ตั้งไว้เล็กน้อย (miss แล้วต้องรอพรุ่ง)
      const due = await this.repeats.find({
        where: {
          resolvedAt: IsNull(),
          nextNotifyAt: LessThanOrEqual(new Date(Date.now() + 60_000)),
        },
      });
      for (const chain of due) await this.process(chain);
    } catch (error) {
      this.logger.warn(`notification repeat sweep failed: ${(error as Error).message}`);
    }
  }

  /** ยิงแถวซ้ำด้วย `notify()` ตัวเดิม → ข้อความ/ลิงก์/toast เหมือนต้นฉบับ ไม่ส่งอีเมลซ้ำ */
  private async process(chain: NotificationRepeat): Promise<void> {
    try {
      if (await this.isResolved(chain)) {
        await this.repeats.update(chain.id, { resolvedAt: new Date() });
        return;
      }

      const cadence = REPEAT_CADENCE[chain.priority] ?? REPEAT_CADENCE.medium;
      const sentCount = chain.sentCount + 1;
      await this.notifications.notify({
        userId: chain.userId,
        action: chain.type as NotificationAction,
        title: chain.title,
        context: chain.context ?? undefined,
        link: chain.link ?? undefined,
        issueId: chain.issueId ?? undefined,
        appId: chain.appId ?? undefined,
        companyId: chain.companyId ?? undefined,
        actor: chain.actorId ? { actorId: chain.actorId } : undefined,
        priority: chain.priority,
      });

      // อัปเดต**หลัง** notify() เสมอ — registrar จะเห็นสายนี้ว่ายัง active อยู่
      // จึงไม่สร้างสายซ้ำตอนแถวซ้ำถูกบันทึก
      if (sentCount >= cadence.maxRepeats) {
        await this.repeats.update(chain.id, { sentCount, resolvedAt: new Date() });
        return;
      }
      await this.repeats.update(chain.id, {
        sentCount,
        nextNotifyAt: bangkok9(chain.nextNotifyAt, cadence.intervalDays),
      });
    } catch (error) {
      this.logger.warn(`notification repeat ${chain.id} failed: ${(error as Error).message}`);
    }
  }

  /**
   * "ทำสิ่งนั้นแล้ว" — อ่านจาก DB ตอนยิงทุกครั้ง (ไม่ stamp ไว้ล่วงหน้า) ดังนั้น
   * คนที่แก้สถานะระหว่างรอจะหยุดทันทีในรอบถัดไป · lookup พัง = ถือว่ายังค้าง
   * (ข้ามรอบนั้นอีกวันหนึ่ง) เพื่อไม่ให้สายตายเพราะ DB ขัดข้องชั่วคราว
   */
  private async isResolved(chain: NotificationRepeat): Promise<boolean> {
    try {
      switch (chain.type) {
        case "ma_depleted": {
          if (!chain.appId || !chain.companyId) return true;
          const rows = await this.links.find({
            where: { appId: chain.appId, companyId: chain.companyId },
            order: { id: "DESC" },
            take: 1,
          });
          const latest = rows[0];
          // สัญญายกเลิกแล้ว (1848) — ตัดสายทันที ไม่ต้องรอ MA กลับมา
          if (latest?.cancelledAt != null) return true;
          // latch ถูกเคลียร์เมื่อใช้ไปไม่หมดอีกครั้ง (เปลี่ยนเป็นบั๊ก / แก้ MA / ซื้อรอบใหม่)
          return !latest || latest.maNotifiedAt == null;
        }
        case "app_expired":
        case "app_expiring": {
          if (!chain.appId || !chain.companyId) return true;
          const rows = await this.links.find({
            where: { appId: chain.appId, companyId: chain.companyId },
            order: { id: "DESC" },
            take: 1,
          });
          const latest = rows[0];
          if (latest?.cancelledAt != null) return true;
          if (!latest?.expiresAt) return true;
          const left = daysBetween(todayIso(), toIsoDate(latest.expiresAt));
          const current: NotificationAction | null =
            left < 0 ? "app_expired" : left <= 30 ? "app_expiring" : null;
          // 30 วัน → 7 วันยังเป็น "ใกล้หมดอายุ" เสมอ (สายเดิมต่อได้) แต่พอหมดอายุ
          // สายกลางต้องจบ แล้วสาย high ของ app_expired เริ่มใหม่ตาม cron เดิม
          return current !== chain.type;
        }
        case "needs_assignment": {
          if (!chain.issueId) return true;
          const issue = await this.issues.findOne({ where: { id: chain.issueId } });
          return !issue || issue.programmerId != null || issue.deletedAt != null;
        }
        case "stale": {
          if (!chain.issueId) return true;
          const issue = await this.issues.findOne({ where: { id: chain.issueId } });
          return !issue || issue.staleNotifiedAt == null || issue.deletedAt != null;
        }
        default:
          return true;
      }
    } catch (error) {
      this.logger.warn(`could not resolve notification repeat ${chain.id}: ${(error as Error).message}`);
      return false;
    }
  }
}
