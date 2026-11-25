import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ตาราง state ของ**การเตือนซ้ำตามระดับความสำคัญ** (high/medium/low)
 *
 * แถวแจ้งเตือนปกติถูกสร้างครั้งเดียวตอนเกิดเหตุ — ตารางนี้เก็บ "สายเตือน" ที่
 * ยังค้างอยู่ 1 สายต่อ (ผู้รับ + เหตุการณ์ + เป้าหมาย) พร้อมข้อความต้นฉบับ
 * (snapshot) จำนวนครั้งที่ซ้ำแล้ว และวันที่ต้องยิงครั้งต่อไป
 *
 * ระดับกำหนดความถี่ใน `REPEAT_CADENCE` ไม่ใช่ใน DB:
 *   - high   = ทุกวัน ไม่จำกัด (จนกว่าสถานะในระบบจะเปลี่ยน)
 *   - medium = 5 ครั้ง รวมวันเกิดเหตุ (ซ้ำอีก 4 วันติด)
 *   - low    = 3 ครั้ง รวมวันเกิดเหตุ (ซ้ำวันที่ 2 และ 4 = วันเว้นวัน)
 *
 * **ไม่ backfill แถวเก่า** — กล่องเข้าของแอดมินมีแถวค้างอยู่หลายร้อย ถ้า
 * สร้างสายเตือนย้อนหลังทุกแถวจะยิงข้อความจำนวนมากทันทีที่ cron รอบแรกวิ่ง
 * สายใหม่เริ่มจากเหตุการณ์ที่เกิด**หลัง** migration นี้เท่านั้น
 *
 * Idempotent — `IF NOT EXISTS` ทั้งตัวตารางและ index, `down()` ก็รันซ้ำได้
 */
export class AddNotificationRepeats1847000000000 implements MigrationInterface {
  name = "AddNotificationRepeats1847000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS notification_repeats (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_notification_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        context VARCHAR(100),
        link VARCHAR(255),
        issue_id INTEGER,
        app_id INTEGER,
        company_id INTEGER,
        actor_id INTEGER,
        priority VARCHAR(10) NOT NULL DEFAULT 'medium',
        sent_count INTEGER NOT NULL DEFAULT 0,
        next_notify_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT notification_repeats_priority_check
          CHECK (priority IN ('high', 'medium', 'low'))
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_notification_repeats_due
       ON notification_repeats (user_id, next_notify_at) WHERE resolved_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_notification_repeats_due`);
    await queryRunner.query(`DROP TABLE IF EXISTS notification_repeats`);
  }
}
