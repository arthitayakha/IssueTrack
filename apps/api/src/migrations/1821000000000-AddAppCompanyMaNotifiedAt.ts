import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `app_companies.ma_notified_at` — **latch flag "แจ้งเตือนชั่วโมง MA หมดแล้ว" รอบนี้**
 *
 * ใช้โดย `MaUsageService` ตอนกรอกเวลาจริง (`PUT /issues/:id/...` →
 * `setActualFixDuration`): ถ้า ใช้ไป ≥ `ma_hours` ของแถวล่าสุดของคู่ → แจ้ง
 * ลูกค้าบริษัทนั้น + แอดมิน (in-app + อีเมล) **ครั้งเดียว** แล้ว stamp เวลาไว้
 * แถวที่สองจะไม่แจ้งซ้ำ · `NULL` = ยังไม่เคยแจ้งรอบนี้
 *
 * **ล้างเมื่อชั่วโมงกลับมา**: ใช้ไป ≤ MA อีกครั้ง (งานถูกย้ายเป็นบั๊ก / แก้ MA
 * ให้มากขึ้น) → `MaUsageService` คืนค่าเป็น `NULL` เอง เพื่อให้รอบการหมด
 * ครั้งต่อไปแจ้งใหม่ได้ · การต่ออายุ/ซื้อชั่วโมงไม่ต้องแตะ — แถบที่ append
 * ใหม่ได้ `NULL` โดยปริยาย (คนละแถวกับ latch เดิม)
 *
 * Idempotent — `IF NOT EXISTS` รันซ้ำได้ · nullable ไม่ต้องมี default
 */
export class AddAppCompanyMaNotifiedAt1821000000000 implements MigrationInterface {
    name = "AddAppCompanyMaNotifiedAt1821000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS ma_notified_at TIMESTAMP`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE app_companies DROP COLUMN IF EXISTS ma_notified_at`);
    }
}
