import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * แอป ↔ บริษัท เป็น **many-to-many**: 1 แอปมีได้หลายบริษัท และ 1 บริษัทมีได้หลายแอป
 * จึงต้องมีตารางเชื่อม `app_companies` (composite PK กัน insert ซ้ำ) แทนที่
 * `apps.company_id` แบบ 1:Many — ฝั่ง TypeORM แมปเป็น `@ManyToMany` + `@JoinTable`
 * เฉพาะที่ `App` (unidirectional) ฝั่ง `Company` ไม่ผูกกลับเพื่อเลี่ยง import วนกัน
 * และเพื่อให้ `CompaniesService` นับแอปผ่าน `Repository<App>` ได้โดยตรง
 *
 * ทั้งสองฝั่งเป็น `ON DELETE CASCADE`: ลบแอป → แถวเชื่อมหายตาม (ถูกต้อง),
 * ส่วนการลบบริษัทจะถูก `CompaniesService.remove()` ดักไว้ก่อนด้วย 409 ถ้ามีแอปอ้างอยู่
 * (cascade จึงเป็นตาข่ายสำหรับการลบที่ไม่ผ่าน service เท่านั้น)
 *
 * `expires_at` / `expiry_status` = วันที่หมดอายุของแอป + สถานะที่ *เก็บไว้* ใน DB
 * (`none` | `normal` | `expiring_soon` | `expired`) — คำนวณใหม่โดย `AppExpiryService`
 * ทั้งตอนอ่าน ตอนบันทึก และจาก cron รายวัน เก็บค่าไว้เพื่อให้โชว์เป็น chip ได้ทันที
 * และเพื่อให้ "แจ้งเตือนเฉพาะตอนสถานะเปลี่ยน" ทำได้ (เทียบค่าเดิมกับค่าใหม่)
 *
 * Idempotent — `IF NOT EXISTS` / `IF EXISTS` ทุกคำสั่ง รันซ้ำได้
 */
export class AddAppCompanyJoinAndExpiry1808000000000 implements MigrationInterface {
    name = "AddAppCompanyJoinAndExpiry1808000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS app_companies (
                app_id     INTEGER NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
                company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                PRIMARY KEY (app_id, company_id)
            )`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS idx_app_companies_company_id
             ON app_companies (company_id)`,
        );
        await queryRunner.query(`ALTER TABLE apps ADD COLUMN IF NOT EXISTS expires_at DATE`);
        await queryRunner.query(
            `ALTER TABLE apps ADD COLUMN IF NOT EXISTS expiry_status VARCHAR(16) NOT NULL DEFAULT 'none'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE apps DROP COLUMN IF EXISTS expiry_status`);
        await queryRunner.query(`ALTER TABLE apps DROP COLUMN IF EXISTS expires_at`);
        await queryRunner.query(`DROP TABLE IF EXISTS app_companies`);
    }
}
