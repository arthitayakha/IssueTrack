import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **Backfill ครั้งเดียว** ของ `issues.actual_fix_at` (คอลัมน์จาก migration 1822)
 *
 * งานที่กรอกเวลาก่อนที่ 1822 จะเข้ามา (ทั้งคอลัมน์ทั้งโค้ด stamp) ได้ `NULL`
 * → `pickPeriodId()` คืน `null` → ตกเป็น `unattributedHours` ทำให้แท็บ
 * "งานที่ถูกตัด MA" โชว์ **0 รายการ** ทั้งที่ "ใช้ไป" มีค่า (เคสจริง: งาน
 * `101126-001` = 40 ชม. ของคู่ POS × บริษัท รสละมุน)
 *
 * เติมด้วย `updated_at` — **ตรงกับที่คอมเมนต์ใน 1822 เสนอไว้เอง** และเป็น
 * สัญญาณเดียวที่เหลืออยู่ของ "ตอนที่งานถูกแก้ล่าสุด" · **ยอมรับว่าเป็นการ
 * เดา**: `updated_at` ถูก bump ทุกครั้งที่แก้สเตตัส/คอมเมนต์ ดังนั้นถ้ามีแถว
 * ต่ออายุ/ซื้อชั่วโมงใหม่ถูกสร้าง *ระหว่าง* ตอนกรอกเวลา กับ ตอนแก้ไขล่าสุด
 * ชั่วโมงจะถูกผูกให้รอบที่ใหม่กว่า (ผู้ใช้ตัดสินใจรับความเสี่ยงนี้แล้ว —
 * กติกา "ไม่ backfill ไม่เดา" ถูกยกเลิกเฉพาะครั้งเดียวนี้)
 *
 * **ยังไม่ถูกเดาใส่รอบมั่ว**: แถวที่ `updated_at` ยังไม่ถึงรอบแรกของคู่
 * (`created_at` ของ `app_companies`) จะยังคง `NULL` → ยังถูกเล่าเป็น
 * "ไม่ระบุรอบ" (`unattributedHours`) ตามเดิม
 *
 * Idempotent — เงื่อนไข `actual_fix_at IS NULL` กันรันซ้ำ · คืนค่าเดิม (NULL)
 * ไม่ได้ จึงไม่มี `down` ที่มีความหมาย (no-op)
 */
export class BackfillIssueActualFixAt1823000000000 implements MigrationInterface {
    name = "BackfillIssueActualFixAt1823000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE issues
                SET actual_fix_at = updated_at
              WHERE actual_fix_duration > 0
                AND actual_fix_at IS NULL
                AND updated_at IS NOT NULL`,
        );
    }

    public async down(): Promise<void> {
        // data backfill — ค่าเดิม (NULL) ย้อนไม่ได้ ปล่อยเป็น no-op
    }
}
