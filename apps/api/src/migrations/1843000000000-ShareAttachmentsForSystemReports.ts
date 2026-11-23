import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ศูนย์ช่วยเหลือ — ใช้ตาราง `attachments` ร่วมกับไฟล์แนบของรายงานบั๊ก
 *
 * เดิม `attachments.issue_id` เป็น NOT NULL + FK ไป `issues` เท่านั้น จึงต้องสร้าง
 * `system_report_attachments` แยกขึ้นมา (migration 1840) — ตอนนี้ปลด NOT NULL แล้ว
 * เพิ่ม FK ที่สอง (`system_report_id`) ทำให้เหลือตารางไฟล์แนบตารางเดียวสำหรับทั้ง
 * งานบนบอร์ดและรายงานบั๊ก · ได้ FK/cascade/index กลับมา (ต่างจากการเก็บ JSONB)
 *
 * `CHECK ((issue_id IS NULL) <> (system_report_id IS NULL))` บังคับว่าแถวทุกแถวต้องมี
 * เจ้าของ exactly one — กันแถวที่ไม่มีงานและไม่มีรายงาน · id เดิมของ
 * `system_report_attachments` ชนกับ id ของ `attachments` ที่มีอยู่แล้ว จึงให้ SERIAL
 * generate ใหม่ (หน้าเว็บใช้ id ที่ API ตอบกลับอยู่แล้ว ไม่มีลิงก์ภายนอกอ้าง id เดิม)
 *
 * Idempotent (`IF NOT EXISTS` / `NOT EXISTS` guard) — ปลอดภัยรันซ้ำ
 */
export class ShareAttachmentsForSystemReports1843000000000 implements MigrationInterface {
  name = "ShareAttachmentsForSystemReports1843000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_owner_check`,
    );
    await queryRunner.query(`ALTER TABLE attachments ALTER COLUMN issue_id DROP NOT NULL`);
    await queryRunner.query(
      `ALTER TABLE attachments
       ADD COLUMN IF NOT EXISTS system_report_id INTEGER REFERENCES system_reports(id) ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_attachments_system_report ON attachments(system_report_id)`,
    );
    await queryRunner.query(`
      INSERT INTO attachments (system_report_id, file_name, file_path, file_type, file_size, uploaded_by, created_at)
      SELECT a.report_id, a.file_name, a.file_path, a.file_type, a.file_size, a.uploaded_by, a.created_at
      FROM system_report_attachments a
      WHERE NOT EXISTS (
        SELECT 1 FROM attachments t
        WHERE t.system_report_id = a.report_id
          AND t.file_name = a.file_name
          AND t.created_at = a.created_at
      )
    `);
    await queryRunner.query(`
      ALTER TABLE attachments ADD CONSTRAINT attachments_owner_check
      CHECK ((issue_id IS NULL) <> (system_report_id IS NULL))
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS system_report_attachments`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS system_report_attachments (
        id SERIAL PRIMARY KEY,
        report_id INTEGER NOT NULL REFERENCES system_reports(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_type VARCHAR(10),
        file_size INTEGER,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_report_attachments_report ON system_report_attachments(report_id)`,
    );
    await queryRunner.query(`
      INSERT INTO system_report_attachments (report_id, file_name, file_path, file_type, file_size, uploaded_by, created_at)
      SELECT system_report_id, file_name, file_path, LEFT(file_type, 10), file_size, uploaded_by, created_at
      FROM attachments WHERE system_report_id IS NOT NULL
    `);
    await queryRunner.query(
      `ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_owner_check`,
    );
    await queryRunner.query(`ALTER TABLE attachments DROP COLUMN IF EXISTS system_report_id`);
    await queryRunner.query(`ALTER TABLE attachments ALTER COLUMN issue_id SET NOT NULL`);
  }
}
