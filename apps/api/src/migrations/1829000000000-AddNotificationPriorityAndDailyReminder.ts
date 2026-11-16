import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ความสำคัญของการแจ้งเตือน + สวิตซ์เตือนรายวัน — 2 คอลัมน์ของฟีเจอร์เดียว
 *
 * **`notifications.priority`** (`high` / `medium` / `low`):
 *   1. **เรียงกล่องเข้า** — สูง → กลาง → ต่ำ แล้วค่อยใหม่สุดก่อน (`list()` ใช้
 *      CASE order เพราะตัวอักษรเรียง `high < low < medium` อยู่ดี);
 *   2. **สี Chip** บนทุกแถว (แดง/เหลือง/เทา);
 *   3. **หน้าต่างเตือนซ้ำรายวัน** 09:00 — สูง 7 วัน / กลาง 3 วัน / ต่ำ 1 วัน
 *      (`DailyReminderService`)
 *
 * **ที่มาของค่า** (เขียนตอน insert โดย `NotificationsService.notify()`):
 *   - การ์ดที่ผูก `issue_id` → ยืมความสำคัญของบัตร (`issue_priorities.name`)
 *   - ชนิดระบบ → hardcode: `ma_depleted`/`app_expired` = สูง, `app_expiring` =
 *     กลาง, `rule_*` = ต่ำ, ที่เหลือ = กลาง — backfill ด้านล่างใช้ map เดียวกัน
 *
 * **`DEFAULT 'medium'` + `NOT NULL` สำคัญ**: entity ตั้ง `default: "medium"`
 * ซึ่งทำให้ TypeORM **ไม่ใส่คอลัมน์ตอน INSERT** ถ้าผู้เรียกไม่ได้ตั้งค่า —
 * ถ้า DB ไม่มี default แถวจะได้ `NULL` เงียบ ๆ (บทเรียนจาก `app_companies.kind`)
 *
 * **`users.daily_reminder_enabled`** (ค่าเริ่มต้น `true`): สวิตซ์ "แจ้งเตือนรายวัน"
 * ใน popup โปรไฟล์ (`PATCH /auth/profile/reminder`) — ปิดแล้ว `DailyReminderService`
 * ข้ามคนนี้ทั้งแถวเตือนและอีเมล · การแจ้งเตือนปกติทุกอย่าง (แถวแรกตอนเกิดเหตุ +
 * เมล milestone) **ไม่กระทบ** · อ่าน/ล้างกล่องเข้า = แถวนั้นหายไปเอง (อ่าน = ลบ)
 * จึงไม่ต้องมีตาราง state/latch เพิ่ม — หน้าต่างเตือนนับจากอายุแถวเดิม
 *
 * Idempotent — `IF NOT EXISTS` / `WHERE ... IS NULL` / `DO $$ ... conname` / `SET DEFAULT`
 * รันซ้ำได้ทั้งหมด
 */
export class AddNotificationPriorityAndDailyReminder1829000000000
  implements MigrationInterface
{
  name = "AddNotificationPriorityAndDailyReminder1829000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority VARCHAR(10)`,
    );

    // --- backfill ชนิดระบบตาม map เดียวกับ FIXED_PRIORITY ใน notifications.service ---
    await queryRunner.query(
      `UPDATE notifications
       SET priority = CASE
         WHEN type IN ('ma_depleted', 'app_expired', 'daily_digest') THEN 'high'
         WHEN type = 'app_expiring' THEN 'medium'
         WHEN type IN ('rule_created', 'rule_updated', 'rule_deleted') THEN 'low'
       END
       WHERE priority IS NULL AND type IS NOT NULL`,
    );

    // --- แถวที่ผูกการ์ด: ยืมความสำคัญของบัตร (ชื่อ key เดียวกับสี chip บนบอร์ด) ---
    //     บัตรไม่มี priority / ชื่อที่ไม่รู้จัก → 'medium' (fail-open กลาง)
    await queryRunner.query(
      `UPDATE notifications n
       SET priority = CASE LOWER(COALESCE(p.name, ''))
         WHEN 'critical' THEN 'high'
         WHEN 'urgent' THEN 'high'
         WHEN 'high' THEN 'high'
         WHEN 'สูง' THEN 'high'
         WHEN 'low' THEN 'low'
         WHEN 'ต่ำ' THEN 'low'
         ELSE 'medium'
       END
       FROM issues i
       LEFT JOIN issue_priorities p ON p.id = i.priority_id
       WHERE n.issue_id = i.id AND n.priority IS NULL`,
    );

    // --- ที่เหลือ (ชนิดที่ไม่มีใน map) → กลาง ---
    await queryRunner.query(
      `UPDATE notifications SET priority = 'medium' WHERE priority IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE notifications ALTER COLUMN priority SET DEFAULT 'medium'`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications ALTER COLUMN priority SET NOT NULL`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
         IF NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'notifications_priority_check'
         ) THEN
           ALTER TABLE notifications ADD CONSTRAINT notifications_priority_check
             CHECK (priority IN ('high', 'medium', 'low'));
         END IF;
       END $$`,
    );

    // --- สวิตซ์เตือนรายวันต่อผู้ใช้ (ค่าเริ่มต้น true = ทุกคนยังเตือนเหมือนเดิม) ---
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_reminder_enabled BOOLEAN NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN IF EXISTS daily_reminder_enabled`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_priority_check`,
    );
    await queryRunner.query(
      `ALTER TABLE notifications DROP COLUMN IF EXISTS priority`,
    );
  }
}
