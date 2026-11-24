import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ถอดฟีเจอร์ "แจ้งปัญหาระบบ" ออกทั้งหมด** (ตามคำสั่งผู้ใช้)
 *
 * สิ่งที่หายไปถาวร (ข้อมูลกู้ไม่ได้ — `pg_dump` สำรองก่อนรัน):
 *   - ตาราง `system_reports` + แถวไฟล์แนบใน `attachments` ที่ `system_report_id` ไม่ใช่ NULL
 *     (ตาราง `system_report_attachments` ถูกย้ายเข้า `attachments` ไปแล้วใน 1843)
 *   - แถวแจ้งเตือน `type = 'system_report_created'`
 *   - สิทธิ์ `system_report.view` / `system_report.update` ใน 3 ตารางสิทธิ์
 *
 * โค้ดที่เกี่ยวข้องถูกลบด้วย (module/controller/service/DTO/entity, หน้าเว็บ,
 * `NotificationAction`, `ROUTE_ACCESS`, i18n action) — ส่วน i18n key ที่ไม่ใช้แล้ว
 * **เก็บไว้ตามกติกา keep-unused-keys** เหมือน `1837000000000-DropAuthPermissions`
 *
 * `down()` คืนเฉพาะ schema + สิทธิ์เริ่มต้น (ไม่กู้ข้อมูล) ·  every statement
 * idempotent (`IF EXISTS` / `ON CONFLICT`) → รันซ้ำได้
 */
export class DropSystemReports1844000000000 implements MigrationInterface {
  name = "DropSystemReports1844000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // แถวแจ้งเตือนที่ชี้ action ที่ถูกลบออกไปแล้ว (กัน inbox เรนเดอร์ไม่ได้)
    await queryRunner.query(`DELETE FROM notifications WHERE type = 'system_report_created'`);

    // ไฟล์แนบของรายงาน — ถ้าปล่อยไว้ตอน DROP COLUMN จะเหลือแถว issue_id = NULL
    await queryRunner.query(`DELETE FROM attachments WHERE system_report_id IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_owner_check`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_attachments_system_report`);
    await queryRunner.query(`ALTER TABLE attachments DROP COLUMN IF EXISTS system_report_id`);

    await queryRunner.query(`DROP TABLE IF EXISTS system_report_attachments`);
    await queryRunner.query(`DROP TABLE IF EXISTS system_reports`);

    // เหมือน 1837 — child ก่อน parent (เป็น varchar ธรรมดา ไม่มี FK จริง)
    await queryRunner.query(
      `DELETE FROM position_permissions WHERE permission IN ('system_report.view', 'system_report.update')`,
    );
    await queryRunner.query(
      `DELETE FROM role_permissions WHERE permission IN ('system_report.view', 'system_report.update')`,
    );
    await queryRunner.query(
      `DELETE FROM permissions WHERE code IN ('system_report.view', 'system_report.update')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS system_reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        page_url VARCHAR(500),
        problem_type VARCHAR(30) NOT NULL DEFAULT 'other',
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_system_reports_reporter ON system_reports(reporter_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_system_reports_status ON system_reports(status)`,
    );

    await queryRunner.query(`
      ALTER TABLE attachments
      ADD COLUMN IF NOT EXISTS system_report_id INTEGER REFERENCES system_reports(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_attachments_system_report ON attachments(system_report_id)
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_owner_check') THEN
          ALTER TABLE attachments ADD CONSTRAINT attachments_owner_check
          CHECK ((issue_id IS NULL) <> (system_report_id IS NULL));
        END IF;
      END $$
    `);

    await queryRunner.query(`
      INSERT INTO permissions (code, action, category) VALUES
        ('system_report.view', 'system_report.view', 'system_report'),
        ('system_report.update', 'system_report.update', 'system_report')
      ON CONFLICT (code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission)
      SELECT r.id, p.code FROM roles r JOIN permissions p
        ON p.code IN ('system_report.view', 'system_report.update')
      WHERE r.name = 'admin'
      ON CONFLICT (role_id, permission) DO NOTHING
    `);
  }
}
