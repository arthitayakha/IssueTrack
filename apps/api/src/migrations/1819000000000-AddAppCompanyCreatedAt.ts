import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `app_companies.created_at` — **วันที่บันทึกช่วงเวลานั้น** ใช้เป็นคอลัมน์
 * "วันที่" ของตาราง **ประวัติการต่ออายุ** ในป๊อปอัพรายละเอียดหน้า `/systems`
 *
 * เหตุผลที่ต้องมี: `started_at` / `expires_at` เป็น *วันที่ของสัญญา* ไม่ใช่
 * *วันที่กรอก* — แถวช่วง 2569 ที่ต่ออายุเมื่อวานต้องโชว์วันที่เมื่อวานใน
 * ประวัติ ไม่ใช่วันที่เริ่มสัญญา สองค่านี้คนละเรื่องกัน
 *
 * **ค่าของแถวเดิม**: `DEFAULT NOW()` เติม timestamp ตอนรัน migration ให้ทุก
 * แถวที่มีอยู่ — วันที่กรอกจริงของแถวเก่าไม่สามารถย้อนกู้ได้ (ไม่เคยถูกเก็บ)
 * จึงได้ "วันที่ migrate" ไปก่อน แถวใหม่หลังจากนี้ได้ค่าจริงเสมอ
 *
 * Idempotent — `IF NOT EXISTS` รันซ้ำได้
 */
export class AddAppCompanyCreatedAt1819000000000 implements MigrationInterface {
    name = "AddAppCompanyCreatedAt1819000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE app_companies DROP COLUMN IF EXISTS created_at`);
    }
}
