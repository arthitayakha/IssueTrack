import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ถอดสถานะ "ยกเลิก" ออกจาก `issue_statuses`**
 *
 * **ที่มา**: ผู้ใช้สรุปว่า *"ยกเลิกงานก็คือลบ"* — สถานะ "ยกเลิก" (คอลัมน์สุดท้าย
 * บนบอร์ด) กับ "ถังขยะ" (soft delete `issues.deleted_at` ที่ตอนนี้ UI เรียกว่า
 * "ยกเลิก" แล้ว) เป็น**ความหมายซ้ำกัน**สองกลไก จึงเลือกเก็บกลไกถังขยะ (ลบ)
 * ไว้อันเดียว แล้ว**ถอดสถานะนี้ทิ้ง** — เมนู "ยกเลิกงาน", ปุ่ม "ตีกลับงาน",
 * ปุ่ม "ย้ายกลับ" และ hardcode ทั้งหมด (`REJECT_STATUS_NAME`, `pinRejectLast()`,
 * `isRejectMove`) ถูกลบออกจากโค้ดใน change เดียวกัน
 *
 * **ลำดับบังคับ — ย้ายงานก่อน ค่อยลบแถว**:
 *   - `issues.status_id` เป็น **NOT NULL** + FK `NO ACTION` → ลบแถวก่อน = ชน
 *     `FK violation` ทันที
 *   - งานที่ค้างจะถูกย้ายไป**สถานะแรก** (`position ASC, id ASC` ที่ไม่ใช่
 *     "ยกเลิก") ไม่ใช่ลบ — งานเป็นข้อมูลของผู้ใช้
 *   - `DELETE` มีเงื่อนไข `NOT EXISTS` ซ้ำอีกชั้น = **fail-safe**: ถ้าสถานะอื่น
 *     ไม่มีเหลือเลย (edge case) ก็ข้ามการลบ แทนที่จะชน NOT NULL
 *
 * **Idempotent** — รันซ้ำได้: ไม่มีแถวชื่อนี้ → ทั้งสอง statement ไม่แตะอะไร
 * (แถวที่ย้ายไปแล้วไม่ match `IN` อีก)
 *
 * ⚠️ ใช้ชื่อเป็น **literal ใน SQL** แบบเดียวกับ migration อื่น (เช่น
 * `1830000000000-PinRejectStatusLast`) เพราะ `migration:run` รันผ่าน
 * `typeorm-ts-node-commonjs` ซึ่งไม่ได้ register `tsconfig-paths` → import
 * `@kanban/shared` ใน migration จะพัง
 *
 * `down()` จงใจเป็น no-op: คืนสถานะกลับไม่ได้โดยไม่เดาข้อมูล (จะเอางานที่
 * ถูกย้ายกลับไปสถานะ "ยกเลิก" ได้ยังไง ไม่มีใครเก็บไว้) และไม่มีอะไรเสีย —
 * โค้ดฝั่งแอปไม่ได้อ้างชื่อนี้อีกแล้ว สถานะจะกลับมาเป็นแค่แถวธรรมดาถ้าสร้างใหม่
 *
 * หมายเหตุ: migration `1830000000000-PinRejectStatusLast` (รันไปแล้ว) จะกลายเป็น
 * no-op หลังย้ายไฟล์นี้ — มันแค่ UPDATE แถวที่ชื่อ "ยกเลิก" ซึ่งจะไม่มีอยู่แล้ว
 */
export class DropRejectStatus1831000000000 implements MigrationInterface {
  name = "DropRejectStatus1831000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) ย้ายงานที่ค้างอยู่ใน "ยกเลิก" ไปสถานะแรก (ยังไม่ลบใครทิ้ง)
    await queryRunner.query(
      `UPDATE issues i
       SET status_id = sub.first_id
       FROM (
         SELECT id AS first_id
         FROM issue_statuses
         WHERE name <> 'ยกเลิก'
         ORDER BY position ASC, id ASC
         LIMIT 1
       ) sub
       WHERE i.status_id IN (SELECT id FROM issue_statuses WHERE name = 'ยกเลิก')`,
    );

    // 2) ลบแถวสถานะ — เฉพาะเมื่อไม่มีงานค้างเหลือ (fail-safe กับ NOT NULL)
    await queryRunner.query(
      `DELETE FROM issue_statuses s
       WHERE s.name = 'ยกเลิก'
         AND NOT EXISTS (
           SELECT 1 FROM issues i WHERE i.status_id = s.id
         )`,
    );
  }

  public async down(): Promise<void> {
    // no-op — คืนสถานะไม่ได้โดยไม่เดาข้อมูล และโค้ดไม่ได้อ้างชื่อนี้แล้ว
  }
}
