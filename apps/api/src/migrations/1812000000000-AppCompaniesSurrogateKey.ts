import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `app_companies` เปลี่ยนจาก **composite PK `(app_id, company_id)`** ไปเป็น
 * ** surrogate key `id`** เพื่อให้คู่ แอป×บริษัท เดียวกันเก็บได้ **หลายแถว**
 *
 * เหตุผล: 1 คู่ต่อมี "หลายช่วงเวลา" (ต่ออายุ MA ปีแล้วปีเล่า) — แถวแรกเป็น
 * ช่วงเก่า แถวถัดมาเป็นช่วงใหม่ ห้ามเขียนทับกัน ตาราง `/systems` จึงโชว์
 * **1 แถวต่อ 1 รายการ** ไม่ใช่ 1 แถวต่อแอปแบบเดิม
 *
 * ผลข้างเคียงที่ต้องจัดการคือ **indexes ที่ composite PK เคยให้**:
 * PK `(app_id, company_id)` ทำหน้าที่เป็น index คิวรี `EXISTS (… app_id = ?
 * AND company_id IN …)` ของ `issues.service` / `reports.service` ด้วย
 * จึงสร้าง index คู่ `(app_id, company_id)` + `(app_id)` กลับไปแทน
 * (index `(company_id)` จาก migration 1808 ยังอยู่)
 *
 * Idempotent — `IF NOT EXISTS` / `IF EXISTS` ทุกคำสั่ง รันซ้ำได้
 *
 * **down ต้องย้อนด้วยเงื่อนไขเดียว**: ถ้ามีคู่ซ้ำอยู่แล้ว (เพิ่มช่วงที่ 2 ไปแล้ว)
 * การใส่ composite PK กลับจะ fail — ให้ลบแถวซ้ำก่อนค่อยรัน
 */
export class AppCompaniesSurrogateKey1812000000000 implements MigrationInterface {
    name = "AppCompaniesSurrogateKey1812000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // SERIAL เติมค่าให้แถวที่มีอยู่แล้วอัตโนมัติ (NOT NULL + DEFAULT nextval)
        await queryRunner.query(`ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS id SERIAL`);
        // ชื่อ constraint ตามแบบที่ PostgreSQL ตั้งให้จาก `PRIMARY KEY (…)` ใน 1808
        await queryRunner.query(`ALTER TABLE app_companies DROP CONSTRAINT IF EXISTS app_companies_pkey`);
        await queryRunner.query(`ALTER TABLE app_companies ADD PRIMARY KEY (id)`);
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS idx_app_companies_app_company
             ON app_companies (app_id, company_id)`,
        );
        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS idx_app_companies_app_id
             ON app_companies (app_id)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE app_companies DROP CONSTRAINT IF EXISTS app_companies_pkey`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_app_companies_app_company`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_app_companies_app_id`);
        await queryRunner.query(`ALTER TABLE app_companies DROP COLUMN IF EXISTS id`);
        await queryRunner.query(`ALTER TABLE app_companies ADD PRIMARY KEY (app_id, company_id)`);
    }
}
