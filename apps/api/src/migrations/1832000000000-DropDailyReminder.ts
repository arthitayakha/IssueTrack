import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ถอดฟีเจอร์ "แจ้งเตือนรายวัน" ออกทั้งหมด**
 *
 * **ที่มา**: ผู้ใช้สรุปว่า *"ไม่ต้องมีก็ได้"* — สวิตซ์ "แจ้งเตือนรายวัน" ใน popup
 * โปรไฟล์เป็นแค่ตัวปิด job cron 09:00 (`DailyReminderService`) ที่โพสต์แถว
 * `"N รายการยังไม่อ่าน"` ทุกเช้า ผู้ใช้ไม่เห็นความจำเป็นของทั้งคู่ จึงถอด
 * **ทั้งหมด**: ตัว service + cron, `PATCH /auth/profile/reminder`, สวิตซ์ใน UI,
 * และคอลัมน์นี้
 *
 * **ไม่แตะอย่างอื่น** — `notifications.priority` (ลำดับกล่องเข้า + สี chip),
 * การแจ้งเตือนปกติทุกชนิด, เมล milestone, และ sweep 09:00 ตัวอื่น
 * (`stale-cards.service`, `app-expiry.service`) ยังทำงานเหมือนเดิมทุกประการ
 *
 * **แถวนี้ (step 1) ลบ `daily_digest` ทิ้ง**: แถวเตือนเดิมเป็นข้อความ nag
 * ที่ไม่มีทางเกิดขึ้นอีกแล้ว (ไม่มีคนสร้าง) และ `link` เป็น `null` —
 * ปล่อยไว้ = ค้างในกล่องข้อความของทุกคนตลอดกาล ไม่มีข้อมูลอะไรสูญ
 * (อ่าน = ลบ อยู่แล้ว = แถวพวกนี้ถูกลบตอนผู้ใช้อ่านเองเท่านั้น)
 *
 * **Idempotent** — รันซ้ำได้ทั้งสอง statement (`DELETE` ไม่ match อะไร /
 * `DROP COLUMN IF EXISTS`)
 *
 * ⚠️ ใช้ค่าเป็น **literal ใน SQL** แบบเดียวกับ migration อื่น เพราะ
 * `migration:run` รันผ่าน `typeorm-ts-node-commonjs` ซึ่งไม่ได้ register
 * `tsconfig-paths` → import `@kanban/shared` ใน migration จะพัง
 *
 * `down()` คืน**แค่คอลัมน์** (default `true`) — แถวนั้นไม่สามารถกู้คืนได้
 * และโค้ดฝั่งแอปไม่ได้อ่าน/เขียนคอลัมน์นี้อีกแล้ว
 */
export class DropDailyReminder1832000000000 implements MigrationInterface {
  name = "DropDailyReminder1832000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) แถวเตือน 09:00 ที่ค้างอยู่ — ไม่มีอะไรสร้างมันอีกแล้ว
    await queryRunner.query(`DELETE FROM notifications WHERE type = 'daily_digest'`);

    // 2) สวิตซ์ต่อผู้ใช้ใน popup โปรไฟล์
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS daily_reminder_enabled`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_reminder_enabled BOOLEAN NOT NULL DEFAULT true`,
    );
    // แถวนั้นตั้งใจลบทิ้ง — ไม่กู้ (down คืนได้แค่โครงสร้าง)
  }
}
