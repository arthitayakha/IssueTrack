import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Notification,
  type NotificationPriority,
} from "./entities/notification.entity";
import { User } from "../auth/entities/user.entity";
import { MailService } from "../mail/mail.service";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/**
 * หน้าต่างเตือนซ้ำของแต่ละระดับ — **นับจากอายุแถวเดิม** (ไม่มีตาราง state):
 * แถวอายุ < window จะถูกเตือนทุกครั้งที่ cron รัน ดังนั้นหนึ่งแถวจะได้
 * digest row พอดี N วัน (cron ห่างกัน 24h → แถวแรกที่เจอ age < window เสมอ):
 * สูง 7 วัน · กลาง 3 วัน · ต่ำ 1 วัน (เด้งเช้าวันรุ่งขึ้นครั้งเดียว) ·
 * อ่าน/ล้างกล่อง = แถวหาย = เงียบเอง (อ่าน = ลบ อยู่แล้ว)
 *
 * ⚠️ หน้าต่างเป็นแค่ **gate** (จะส่งไหม + อีเมลวันแรก) — **ตัวเลข**ใน title/context
 * นับ**ทุก**แถวยังไม่อ่าน ให้เท่ากับเลขบนกระดิ่ง (`GET /notifications/count`)
 */
const REMINDER_WINDOWS: Record<NotificationPriority, number> = {
  high: 7 * DAY_MS,
  medium: 3 * DAY_MS,
  low: DAY_MS,
};

/** ไม่ให้วนซ้ำถ้า cron รัน 2 รอบ (สตาร์ทซ้ำ/หลาย instance) — 20h < ช่วงห่าง 24h */
const DIGEST_DEDUP_MS = 20 * HOUR_MS;

/**
 * ไม่รู้จักค่า (ข้อมูลเก่า/เพี้ยน) → เงียบสุด = ปรับเป็นต่ำ — fail toward quiet
 */
function normalizePriority(value: string): NotificationPriority {
  return value === "high" || value === "medium" ? value : "low";
}

/**
 * **เสียงเตือนรายวัน 09:00** — สร้าง digest row + (เฉพาะวันแรก) อีเมล ให้ผู้ใช้
 * ที่ยังมีแถวยังไม่อ่านภายในหน้าต่างของระดับนั้น
 *
 * กติกาที่ควรรู้:
 * - **แถวเดียวต่อผู้ใช้ต่อวัน**: `type: "daily_digest"`, `priority` = ระดับสูงสุดของ
 *   **ทุก**แถว, `title` = `"N รายการยังไม่อ่าน"` (N = ทุกแถวยังไม่อ่าน = เลขบนกระดิ่ง),
 *   `context` แยกจำนวนตามระดับ (`สูง 3 · กลาง 2` — บวกกันได้เท่า N), link `/notifications`
 * - **หน้าต่าง 7/3/1 วัน = gate เท่านั้น**: ไม่มีแถวใหม่ในหน้าต่าง = ไม่ส่ง (กัน spam)
 *   และยังใช้ตัดสินอีเมลวันแรก — แต่ไม่ได้ใช้ต่อตัวเลขอีกแล้ว
 * - **ไม่นับตัวเอง**: แถว digest ถูกกันออกจาก `active` (gate/อีเมล) → ไม่ทบตัวเอง;
 *   ส่วนตัวเลขรวมแถว digest เก่าที่ยังไม่อ่านด้วย เพราะ badge ก็นับมัน — แถวที่กำลัง
 *   จะสร้างยังไม่มีใน DB จึงไม่มีทางนับตัวเอง
 * - **อีเมลเฉพาะสูงวันแรกเท่านั้น** (แถวสูงอายุ < 24 ชม.) — หนึ่ง episode ได้เมล
 *   สูงสุด 1 ครั้ง · ถ้า API ดับตอนวันแรก =  episode นั้นเงียบ (fail-open) แต่แถว
 *   in-app ยังทำงานวันถัดไป — เหมือนข้อตกลง "เมลครั้งเดียวต่อ episode"
 * - **สวิตซ์ต่อผู้ใช้**: query ลง `users.daily_reminder_enabled = true` → ปิดแล้วคนนั้น
 *   ไม่ได้ทั้งแถวเตือนและอีเมล การแจ้งเตือนปกติไม่เกี่ยว
 * - fail-open ทั้งหมด: try/catch + `logger.warn` — sweep ห้ามเอา API ล้ม
 *   (แพตเทิร์นเดียวกับ `stale-cards.service` / `app-expiry.service`)
 */
@Injectable()
export class DailyReminderService {
  private readonly logger = new Logger(DailyReminderService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly mail: MailService,
  ) {}

  /** Every day, once — the window only moves when the calendar does. */
  @Cron("0 9 * * *", { name: "daily-notification-reminder", timeZone: "Asia/Bangkok" })
  async remind(): Promise<void> {
    try {
      const users = await this.users.find({
        where: { isActive: true, dailyReminderEnabled: true },
      });
      const now = Date.now();
      for (const user of users) await this.remindUser(user, now);
    } catch (error) {
      this.logger.warn(`daily reminder failed: ${(error as Error).message}`);
    }
  }

  /** One user's digest — own try/catch so a bad row never stops the others. */
  private async remindUser(user: User, now: number): Promise<void> {
    try {
      /**
       * **ทุก** แถวยังไม่อ่านของคนนั้น — ชุดเดียวกับที่ `GET /notifications/count`
       * (เลขบนกระดิ่ง) นับ จึงไม่มีทางเพี้ยนจาก badge (เดิมกรองด้วยหน้าต่างใหญ่สุด
       * 7 วัน ตั้งแต่ query → เลขใน digest จึงน้อยกว่า badge เสมอ เช่น บอก 391 แต่ badge 739)
       */
      const rows = await this.notifications.find({
        where: { userId: user.id },
        order: { createdAt: "DESC" },
      });
      if (rows.length === 0) return;
      // digest ของวันนี้มีแล้ว (รันซ้ำ) → อย่าโพสต์ซ้ำ
      const postedToday = rows.some(
        (row) => row.type === "daily_digest" && now - row.createdAt.getTime() < DIGEST_DEDUP_MS,
      );
      if (postedToday) return;

      /**
       * หน้าต่าง 7/3/1 วันยังเป็น **gate** — ไม่มีแถวใหม่ในหน้าต่าง = ไม่ส่ง (กัน spam)
       * และยังใช้ตัดสินอีเมลวันแรกด้วย — แต่**ไม่ได้ใช้ต่อตัวเลข**อีกแล้ว
       */
      const active = rows.filter(
        (row) =>
          row.type !== "daily_digest" &&
          now - row.createdAt.getTime() < REMINDER_WINDOWS[normalizePriority(row.priority)],
      );
      if (active.length === 0) return;

      // นับ**ทุก**แถวตามระดับ — priority ใน DB ถูก CHECK คุมแล้ว แต่ normalize กันข้อมูลเก่า
      const counts: Record<NotificationPriority, number> = { high: 0, medium: 0, low: 0 };
      for (const row of rows) counts[normalizePriority(row.priority)] += 1;
      // ระดับของ digest row ก็มาจากทุกแถว — ไม่งั้น chip (สี/ลำดับ) จะขัดกับ context ที่พิมพ์
      const top: NotificationPriority =
        counts.high > 0 ? "high" : counts.medium > 0 ? "medium" : "low";
      const total = rows.length;
      // แถวเตือนตัวเองก็สูง (ถ้ามีของสูงค้าง) — ให้ลอยขึ้นบนสุดเหมือนของจริง
      const context = (
        [
          counts.high > 0 ? `สูง ${counts.high}` : null,
          counts.medium > 0 ? `กลาง ${counts.medium}` : null,
          counts.low > 0 ? `ต่ำ ${counts.low}` : null,
        ].filter(Boolean) as string[]
      ).join(" · ");

      await this.notifications.save(
        this.notifications.create({
          userId: user.id,
          issueId: null,
          // system sender — ไม่มีคนกระทำ ไม่มีใครถูกข้าม
          actorId: null,
          type: "daily_digest",
          priority: top,
          title: `${total} รายการยังไม่อ่าน`,
          context,
          link: "/notifications",
        }),
      );

      // อีเมล = เฉพาะตอนมีแถว "สูง" ที่ยังอยู่ในวันแรก (< 24 ชม.) — ครั้งเดียวต่อ episode
      // นับจาก `active` (ไม่ใช่ `counts.high` ของทุกแถว) — ให้ count กับ titles ตรงกัน
      const freshHigh = active.some(
        (row) =>
          normalizePriority(row.priority) === "high" &&
          now - row.createdAt.getTime() < DAY_MS,
      );
      if (!freshHigh || !user.email) return;
      const highActive = active.filter((row) => normalizePriority(row.priority) === "high");
      const titles = highActive.slice(0, 10).map((row) => row.title);
      void this.mail
        .sendDailyReminder({
          to: user.email,
          name: user.name,
          count: highActive.length,
          titles,
          url: `${this.webBase()}/notifications`,
        })
        .catch((error) => this.logger.warn(`daily reminder mail failed: ${(error as Error).message}`));
    } catch (error) {
      this.logger.warn(
        `daily reminder for user #${user.id} failed: ${(error as Error).message}`,
      );
    }
  }

  /** Absolute base for links inside e-mails — same env the other mails use. */
  private webBase(): string {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  }
}
