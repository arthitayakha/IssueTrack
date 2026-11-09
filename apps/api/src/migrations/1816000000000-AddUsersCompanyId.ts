import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ผู้ใช้ ↔ บริษัท — **users.company_id** ช่องว่างที่ `issues.service` เคยเขียน
 * คอมเมนต์ทิ้งไว้ว่า "Still not user ↔ company" (ย้ายไปอัปเดตในคอมเมนต์นั้นแล้ว)
 *
 * คอลัมน์นี้คือ "ตัวรู้" ว่าลูกค้าคนนี้เป็นคนของบริษัทไหน ใช้ 2 ทาง:
 *   1. ฟอร์มเพิ่ม/แก้ไขผู้ใช้ (`/users`) โชว์ dropdown เฉพาะตอนบทบาทเป็น
 *      `customer` และบันทึกไม่ผ่านถ้าลูกค้าไม่เลือกบริษัท
 *   2. ฟอร์มรายงานปัญหา (`/issues/new`) กรอง dropdown แอปให้เหลือเฉพาะแอป
 *      ที่บริษัทของผู้รายงานใช้จริง (`?mine=1` ของ `GET /apps` → `app_companies`)
 *
 * Nullable เพราะผู้ใช้ส่วนใหญ่ (แอดมิน/โปรแกรมเมอร์) ไม่ได้เป็นของบริษัทไหน
 * และบัญชีลูกค้าเดิมที่มีอยู่ก่อน migration นี้ยังไม่มีค่า — fail-open ทุกจุด
 *
 * `ON DELETE RESTRICT`: ลบบริษัทที่ยังมีผู้ใช้อ้างอิงไม่ได้ (ตาข่ายแรก) —
 * `CompaniesService.remove()` เช็กด้วย `userCount()` แล้วคืน 409 ก่อนเสมอ
 * จึงแทบไม่ถึง constraint นี้ (เหมือนจุดที่แอปอ้างบริษัทอยู่)
 *
 * Idempotent — `IF NOT EXISTS` ทุกคำสั่ง
 */
export class AddUsersCompanyId1816000000000 implements MigrationInterface {
    name = "AddUsersCompanyId1816000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER
             REFERENCES companies(id) ON DELETE RESTRICT`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS idx_users_company_id ON users (company_id)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_users_company_id`);
        await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS company_id`);
    }
}
