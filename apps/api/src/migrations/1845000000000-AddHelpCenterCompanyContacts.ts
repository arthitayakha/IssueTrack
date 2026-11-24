import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * แยกรายชื่อผู้ติดต่อตามบริษัท (ใน `/systems` ที่ลูกค้าเห็น)
 *
 * `help_center_settings` มีแถวเดียว (id = 1) อยู่แล้ว — เพิ่มคอลัมน์ jsonb
 * `contact_users_by_company` เป็น map `company_id → user_id[]`:
 *   - มี key ของบริษัท那个人 → ใช้ชุดนั้น (array ว่าง = เจตตาให้ตกไปข้อมูลกลาง)
 *   - ไม่มี key → ใช้ `contact_user_ids` เดิมเป็น global fallback
 *
 * **ไม่ลบ/ไม่แก้** `contact_user_ids` → ของที่ chọn ไว้ไม่สูญ; `down()` แค่
 * ตัดคอลัมน์ใหม่ออก · idempotent (`IF NOT EXISTS`) → รันซ้ำได้
 */
export class AddHelpCenterCompanyContacts1845000000000 implements MigrationInterface {
  name = "AddHelpCenterCompanyContacts1845000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE help_center_settings
      ADD COLUMN IF NOT EXISTS contact_users_by_company jsonb NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE help_center_settings DROP COLUMN IF EXISTS contact_users_by_company`,
    );
  }
}
