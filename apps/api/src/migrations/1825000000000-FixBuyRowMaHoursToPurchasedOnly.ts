import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **แก้ `ma_hours` ของแถวที่ซื้อชั่วโมง (`kind = 'buy'`) ให้เท่ากับ "ที่ซื้อ" ล้วน**
 * — ข้อสรุปจากผู้ใช้: "ซื้อ 40 ชม. ชั่วโมง MA ก็ 40 เลย ไม่ต้องรวมกับอันเก่า"
 *
 * **สูตรเก่า vs ใหม่**
 * - เดิม (`buyHours()` ก่อนการแก้ครั้งนี้): `ma_hours = ของแถวก่อนหน้า + ที่ซื้อ`
 *   → ซื้อ 40 บนแถว MA 40 ออกมาเป็น **80** (แถว `id 34` ของคู่ POS × บริษัท
 *   รสละมุน = 80 พอดี)
 * - ใหม่: `ma_hours = ที่ซื้อ` → แถว `id 34` ต้องเป็น **40**
 *
 * **สูตรย้อนกลับทำได้จริง** เพราะแถบที่ซื้อ append มาจากแถวก่อนหน้าของคู่
 * เดียวกัน (เรียง `id`): `ที่ซื้อเดิม = ma_hours − แถวก่อนหน้า` (80 − 40 = 40)
 *
 * **Guard `ma_hours > แถวก่อนหน้า` = กันรันซ้ำ**: หลังแก้ค่าจะเท่ากับแถวก่อน
 * เงื่อนไขเป็นเท็จ → ข้าม (ไม่ถูกหักซ้ำจนเหลือ 0) · แถวที่ไม่มีแถวก่อนหน้า
 * (`NULL` ใน subquery) เงื่อนไขเป็น `NULL` → ข้ามเช่นกัน · **TypeORM track อยู่
 * แล้วจึงรันครั้งเดียว** — guard นี้เป็นตาข่ายเสริม เผื่อมีคนสั่งรัน SQL ซ้ำ
 * (หมายเหตุ: แถว `buy` ที่สร้าง*หลัง*สูตรใหม่และบังเอิญมี `ma` มากกว่าแถวก่อน
 * หน้าจะถูกข้ามเองเมื่อรันซ้ำ — ไม่เกิดขึ้นในการรันครั้งแรกเพราะยังไม่มีแถว
 * พวกนั้นตอนที่ migration ตัวนี้รัน)
 *
 * **ผลข้างเคียงที่ผู้ใช้เลือกไว้แล้ว**: แถว `id 34` จะโชว์ MA 40 / คงเหลือ
 * `40 − ใช้ไป 40 = 0` ในทุกหน้า (/systems, รายงาน, ป๊อปอัพ) — ปุ่ม "ซื้อชั่วโมง"
 * (เปิดเมื่อคงเหลือ ≤ 0) จึงยังอยู่
 *
 * Idempotent — เงื่อนไขด้านบนรันซ้ำได้ · ค่าเดิม (80) ย้อนไม่ได้ (no-op)
 */
export class FixBuyRowMaHoursToPurchasedOnly1825000000000 implements MigrationInterface {
    name = "FixBuyRowMaHoursToPurchasedOnly1825000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE app_companies b
                SET ma_hours = b.ma_hours - (
                      SELECT p.ma_hours
                        FROM app_companies p
                       WHERE p.app_id = b.app_id
                         AND p.company_id = b.company_id
                         AND p.id < b.id
                         AND p.ma_hours IS NOT NULL
                       ORDER BY p.id DESC
                       LIMIT 1
                    )
              WHERE b.kind = 'buy'
                AND b.ma_hours IS NOT NULL
                AND b.ma_hours > (
                      SELECT p.ma_hours
                        FROM app_companies p
                       WHERE p.app_id = b.app_id
                         AND p.company_id = b.company_id
                         AND p.id < b.id
                         AND p.ma_hours IS NOT NULL
                       ORDER BY p.id DESC
                       LIMIT 1
                    )`,
        );
    }

    public async down(): Promise<void> {
        // data fix — ค่าเดิม (สูตรเก่า = รวมกับแถวก่อนหน้า) ย้อนไม่ได้ (no-op)
    }
}
