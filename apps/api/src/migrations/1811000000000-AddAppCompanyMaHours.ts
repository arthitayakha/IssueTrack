import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `app_companies.ma_hours` — **ชั่วโมง MA ที่ตกลงให้คู่ แอป×บริษัท นั้น**
 *
 * ตัวอย่าง: "ระบบ POS ให้ลูกค้า 60 ชม." → แถว (POS × บริษัทนั้น) เก็บ `60`
 * ยังไม่คำนวณ "ใช้ไปแล้ว/คงเหลือ" ในรอบนี้ — เก็บไว้เป็น **เพดานที่กรอกได้ก่อน**
 * การหักเวลาจริง (`issues.actual_fix_duration` ของงานที่ปิดแล้ว) รอตัดสินใจรอบถัดไป
 *
 * `NULL` = ยังไม่กำหนด / ยังไม่ได้กรอก — สอดคล้องกับ `started_at` / `expires_at`
 * ของตารางเดียวกันที่เป็น nullable เหมือนกัน (ค่า 0 จะหมายถึง "ตกลงให้ 0 ชม."
 * ซึ่งต่างจาก "ยังไม่ได้ตกลง" จึงแยกกันด้วย NULL ไม่ใช่ 0)
 *
 * เก็บเป็น **จำนวนชั่วโมงเต็ม** (`INT`) เพราะยังไม่มีการคำนวณใด ๆ — ถ้าต่อไป
 * ต้องใช้เศษชม. ค่อยเปลี่ยนเป็น `NUMERIC` ใน migration ใหม่
 *
 * Idempotent — `IF NOT EXISTS` รันซ้ำได้
 */
export class AddAppCompanyMaHours1811000000000 implements MigrationInterface {
    name = "AddAppCompanyMaHours1811000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS ma_hours INT`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE app_companies DROP COLUMN IF EXISTS ma_hours`);
    }
}
