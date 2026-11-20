import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ศูนย์ช่วยเหลือ — ช่องทางแจ้งบั๊กของระบบเอง (แยกจากงานบนบอร์ด)**
 *
 * `issues` + `attachments` ใช้กับงาน/ปัญหาลูกค้าเท่านั้น (`attachments.issue_id`
 * เป็น NOT NULL + FK) และ `notifications/contact` ส่งได้แค่ข้อความ 200 ตัวไม่แนบรูป
 * → ต้องมีตารางของตัวเองเพื่อให้ผู้ใช้แคปหน้าจอตอนหน้า `/issues/new` พัง/ข้อมูลไม่
 * ขึ้น แล้วส่งมาหาแอดมินได้
 *
 * Idempotent (`IF NOT EXISTS` / `ON CONFLICT`) — ปลอดภัยรันซ้ำ
 */
export class CreateSystemReports1840000000000 implements MigrationInterface {
  name = "CreateSystemReports1840000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS system_reports (
        id SERIAL PRIMARY KEY,
        reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        page_url VARCHAR(500),
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
      INSERT INTO permissions (code, action, category) VALUES
        ('system_report.view', 'system_report.view', 'system_report'),
        ('system_report.update', 'system_report.update', 'system_report')
      ON CONFLICT (code) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission)
      SELECT r.id, p.code
      FROM roles r
      JOIN permissions p
        ON p.code IN ('system_report.view', 'system_report.update')
      WHERE r.name = 'admin'
      ON CONFLICT (role_id, permission) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS system_report_attachments`);
    await queryRunner.query(`DROP TABLE IF EXISTS system_reports`);
    await queryRunner.query(
      `DELETE FROM role_permissions WHERE permission IN ('system_report.view', 'system_report.update')`,
    );
    await queryRunner.query(
      `DELETE FROM permissions WHERE code IN ('system_report.view', 'system_report.update')`,
    );
  }
}
