import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * แยกผู้ติดต่อ **รายแอป** เพิ่มจากของบริษัทเดิม (migration 1845) —
 * บริษัทเดียวมีหลายแอปและกำหนดคนละคนได้: map ใหม่ `contact_users_by_app`
 * ทับ map บริษัทเมื่อมี key; ไม่มี key = ตกมาคนระดับบริษัท (fallback)
 *
 * ไม่ย้าย/ลบข้อมูลเดิม — แถวเก่าที่เคยตั้งรายบริษัทยังใช้ได้เหมือนเดิมทุกประการ
 * (array ว่างใน map ใหม่ = ตั้งใจไม่มีคนสำหรับแอปนั้น ไม่ fallback)
 *
 * Idempotent ทั้ง up/down
 */
export class AddHelpCenterContactUsersByApp1849000000000 implements MigrationInterface {
  name = "AddHelpCenterContactUsersByApp1849000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE help_center_settings ADD COLUMN IF NOT EXISTS contact_users_by_app jsonb NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE help_center_settings DROP COLUMN IF EXISTS contact_users_by_app`,
    );
  }
}
