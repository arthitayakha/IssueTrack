import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ย้ายวันที่อายุของแอป จาก `apps` ลงไปที่ตารางเชื่อม `app_companies`**
 *
 * เหตุผล: วันที่ "เป็นของคู่ แอป×บริษัท" ไม่ใช่ของแอป — 1 แอป (เช่น POS)
 * ผูกได้หลายบริษัท และแต่ละบริษัทต่ออายุคนละช่วงเวลา การเก็บที่ `apps`
 * ทำให้ทุกบริษัทที่ผูกอยู่ต้องใช้วันเดียวกัน
 *
 * ผลลัพธ์: `app_companies` = `app_id | company_id | started_at | expires_at |
 * expiry_status | expiry_notified` — **1 แถว = บริษัท 1 แห่ง ที่ใช้แอปนั้น
 * มีวันที่ + สถานะอายุ + รอบที่แจ้งเตือนเป็นของตัวเอง**
 *
 * ทั้ง 4 คอลัมน์ถูก **DROP ออกจาก `apps`** — เจตนาไม่ใช่แค่ copy: ถ้าเก็บ
 * ค่าเดิมไว้สองที่ ท้ายที่สุดจะมีสอง source of truth ที่ขัดกัน (ใคร sync ใคร)
 *
 * backfill คัดลอกค่าเดิมไปให้ "ทุกแถว" ของแอปนั้น (ตอนนี้ `app_companies`
 * ยังไม่มีแถว และแถว `POS` ใน `apps` วันที่ยัง null ทั้งคู่ → ไม่มีข้อมูล
 * สูญหายจริง แต่เขียนให้ครบเผื่อมีการย้ายบนฐานข้อมูลอื่น)
 *
 * Idempotent — `IF NOT EXISTS` / `IF EXISTS` ทุกคำสั่ง รันซ้ำได้
 */
export class MoveAppDatesToAppCompanies1810000000000 implements MigrationInterface {
    name = "MoveAppDatesToAppCompanies1810000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS started_at DATE`);
        await queryRunner.query(`ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS expires_at DATE`);
        await queryRunner.query(
            `ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS expiry_status VARCHAR(16) NOT NULL DEFAULT 'none'`,
        );
        await queryRunner.query(
            `ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS expiry_notified VARCHAR(16) NOT NULL DEFAULT 'none'`,
        );

        // เอาค่าเดิมของแอปไปให้ทุกคู่ของแอปนั้นก่อนที่คอลัมน์ต้นทางจะหาย
        await queryRunner.query(
            `UPDATE app_companies ac
                SET started_at = a.started_at,
                    expires_at = a.expires_at,
                    expiry_status = a.expiry_status,
                    expiry_notified = a.expiry_notified
                FROM apps a
                WHERE a.id = ac.app_id`,
        );

        await queryRunner.query(`ALTER TABLE apps DROP COLUMN IF EXISTS expiry_notified`);
        await queryRunner.query(`ALTER TABLE apps DROP COLUMN IF EXISTS expiry_status`);
        await queryRunner.query(`ALTER TABLE apps DROP COLUMN IF EXISTS expires_at`);
        await queryRunner.query(`ALTER TABLE apps DROP COLUMN IF EXISTS started_at`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE apps ADD COLUMN IF NOT EXISTS started_at DATE`);
        await queryRunner.query(`ALTER TABLE apps ADD COLUMN IF NOT EXISTS expires_at DATE`);
        await queryRunner.query(
            `ALTER TABLE apps ADD COLUMN IF NOT EXISTS expiry_status VARCHAR(16) NOT NULL DEFAULT 'none'`,
        );
        await queryRunner.query(
            `ALTER TABLE apps ADD COLUMN IF NOT EXISTS expiry_notified VARCHAR(16) NOT NULL DEFAULT 'none'`,
        );

        // ย้อนกลับเหลือได้แค่ "แถวเดียวต่อแอป" (คนละโมเดลกัน) — เอาแถวแรก
        // ที่เรียงตาม company_id เพื่อให้ผลลัพธ์ deterministic
        await queryRunner.query(
            `UPDATE apps a
                SET started_at = sub.started_at,
                    expires_at = sub.expires_at,
                    expiry_status = sub.expiry_status,
                    expiry_notified = sub.expiry_notified
                FROM (
                    SELECT DISTINCT ON (app_id)
                        app_id, started_at, expires_at, expiry_status, expiry_notified
                    FROM app_companies
                    ORDER BY app_id, company_id
                ) sub
                WHERE sub.app_id = a.id`,
        );

        await queryRunner.query(`ALTER TABLE app_companies DROP COLUMN IF EXISTS expiry_notified`);
        await queryRunner.query(`ALTER TABLE app_companies DROP COLUMN IF EXISTS expiry_status`);
        await queryRunner.query(`ALTER TABLE app_companies DROP COLUMN IF EXISTS expires_at`);
        await queryRunner.query(`ALTER TABLE app_companies DROP COLUMN IF EXISTS started_at`);
    }
}
