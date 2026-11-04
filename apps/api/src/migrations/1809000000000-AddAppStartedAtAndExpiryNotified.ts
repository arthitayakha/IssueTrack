import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * สองคอลัมน์ใหม่ของ `apps`:
 *
 * 1. `started_at` — **วันที่เริ่มทำ** ของแต่ละระบบ กรอกเองได้ในฟอร์มเพิ่ม/แก้แอป
 *    (แยกจาก `created_at` ซึ่งระบบเขียนให้เองและแก้ไม่ได้ — คนละความหมาย:
 *    `created_at` = วันที่เพิ่มลงระบบ, `started_at` = วันที่เริ่มใช้งานจริง)
 *    nullable เพราะแอปเดิมยังไม่มีค่า และเป็นข้อมูลที่กรอกทีหลังได้
 *
 * 2. `expiry_notified` — **รอบที่แจ้งเตือนอายุไปแล้ว**
 *    (`none` → `d30` → `d7` → `expired`)
 *    `AppExpiryService` เทียบ "รอบที่ควรถึง" กับค่าที่เก็บไว้ แล้วแจ้งก็ต่อเมื่อ
 *    **ข้ามขึ้นไป** — คอลัมน์นี้เป็นตัวกันไม่ให้ยิงซ้ำทุกวันตอน cron 09:00 วิ่ง
 *    และถ้าวันหมดอายุถูกเลื่อนออก/ล้าง ค่าจะถูกรีเซ็ตเป็น `none`
 *    เพื่อให้แจ้งใหม่ได้อีกครั้งเมื่อเลื่อนกลับเข้ามา
 *
 * Idempotent — `IF NOT EXISTS` ทุกคำสั่ง รันซ้ำได้
 */
export class AddAppStartedAtAndExpiryNotified1809000000000 implements MigrationInterface {
    name = "AddAppStartedAtAndExpiryNotified1809000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE apps ADD COLUMN IF NOT EXISTS started_at DATE`);
        await queryRunner.query(
            `ALTER TABLE apps ADD COLUMN IF NOT EXISTS expiry_notified VARCHAR(16) NOT NULL DEFAULT 'none'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE apps DROP COLUMN IF EXISTS expiry_notified`);
        await queryRunner.query(`ALTER TABLE apps DROP COLUMN IF EXISTS started_at`);
    }
}
