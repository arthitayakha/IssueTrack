import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ถอด "รายชื่อหลัก (global)" และ "ข้อมูลติดต่อกลาง" ออกจาก `help_center_settings`
 * เหลือแค่ `contact_users_by_company` — ทุกบริษัทเลือกเอง (ไม่มี fallback)
 *
 * คอลัมน์ที่ถอด:
 *   - `contact_user_ids` — รายชื่อหลักเดิม (ตอนนี้ค่าเป็น `{}`)
 *   - `support_email` / `support_phone` / `working_hours` — ข้อมูลกลางในฟอร์มเดิม
 *
 * `down()` เพิ่มคอลัมน์คืนได้ (nullable/default) แต่**ไม่กู้ค่าเดิม** ·
 * ทุก statement idempotent (`IF EXISTS`) → รันซ้ำได้
 */
export class DropHelpCenterGlobalContacts1846000000000 implements MigrationInterface {
  name = "DropHelpCenterGlobalContacts1846000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE help_center_settings
      DROP COLUMN IF EXISTS contact_user_ids,
      DROP COLUMN IF EXISTS support_email,
      DROP COLUMN IF EXISTS support_phone,
      DROP COLUMN IF EXISTS working_hours
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE help_center_settings
      ADD COLUMN IF EXISTS contact_user_ids INTEGER[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF EXISTS support_email VARCHAR(255),
      ADD COLUMN IF EXISTS support_phone VARCHAR(50),
      ADD COLUMN IF EXISTS working_hours VARCHAR(255)
    `);
  }
}
