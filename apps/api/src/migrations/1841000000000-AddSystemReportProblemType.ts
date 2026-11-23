import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ศูนย์ช่วยเหลือ — เพิ่ม "ประเภทปัญหา" ให้รายงานบั๊กของระบบ
 *
 * ค่าที่รองรับ: `bug` / `improvement` / `other` (ตรวจซ้ำที่ DTO)
 * แถวเก่าได้ `other` เป็นค่าเริ่มต้น → ไม่ต้อง backfill แยก
 * Idempotent (`IF NOT EXISTS`) — ปลอดภัยรันซ้ำ
 */
export class AddSystemReportProblemType1841000000000 implements MigrationInterface {
  name = "AddSystemReportProblemType1841000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE system_reports
      ADD COLUMN IF NOT EXISTS problem_type VARCHAR(30) NOT NULL DEFAULT 'other'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE system_reports DROP COLUMN IF EXISTS problem_type`);
  }
}
