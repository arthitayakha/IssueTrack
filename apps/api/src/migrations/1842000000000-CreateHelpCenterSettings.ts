import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ศูนย์ช่วยเหลือ — ข้อมูลติดต่อกลาง (อีเมล/เบอร์/เวลาทำการ) ที่แอดมินแก้ได้
 *
 * ตารางแถวเดียว (id = 1) เพราะศูนย์ช่วยเหลือมีข้อมูลติดต่อชุดเดียวสำหรับทุกคน
 * แยกจาก `notifications/admin-contacts` (รายชื่อแอดมินรายคนที่ดึงแบบ live)
 * ค่าเริ่มต้นตามตัวอย่าง UI — แก้ผ่าน PATCH /help-center/contact ได้
 * Idempotent (`IF NOT EXISTS` / `ON CONFLICT`) — ปลอดภัยรันซ้ำ
 */
export class CreateHelpCenterSettings1842000000000 implements MigrationInterface {
  name = "CreateHelpCenterSettings1842000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS help_center_settings (
        id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        support_email VARCHAR(255),
        support_phone VARCHAR(50),
        working_hours VARCHAR(255),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      INSERT INTO help_center_settings (id, support_email, support_phone, working_hours)
      VALUES (1, 'support@issuetrack.com', '02-123-4567', 'จันทร์ - ศุกร์ 09:00 - 18:00 น.')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS help_center_settings`);
  }
}
