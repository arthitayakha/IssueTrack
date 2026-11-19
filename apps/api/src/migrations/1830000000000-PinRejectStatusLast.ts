import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ปักสถานะ **"ยกเลิก" ไว้ท้ายสุด** — `position` มากสุดของตาราง `issue_statuses`
 *
 * **ที่มา**: "ยกเลิก" คือสถานะปลายทางของงานที่ถูก **ตีกลับ** (ค่าคงที่
 * `REJECT_STATUS_NAME` ใน `packages/shared/src/issues.ts` — ตอนนี้**ถูกลบไปแล้ว**
 * พร้อมกับสถานะนี้เอง ดู migration `1831000000000-DropRejectStatus`) และ
 * รายการสถานะ แล้วย้ายการ์ดไปพร้อมเหตุผล) และข้อสรุปจากผู้ใช้คือ
 * *"ล็อกที่ไว้เลย คือต้องอยู่หลังสุด"* — เพราะคอลัมน์บอร์ดเรียงตาม
 * `issue_statuses.position` (`findAll` → `position ASC, id ASC`)
 *
 * **โค้ดบังคับอยู่แล้ว** (`IssueStatusesService.pinRejectLast()` เรียกหลัง
 * `create()` และใน `reorder()`) — migration ตัวนี้มีหน้าที่**แก้ข้อมูลเดิม**
 * ของ env ที่เคยมีสถานะใหม่ถูกสร้างทับ "ยกเลิก" ไปแล้ว (create เก่าให้
 * `MAX(position)+1` ซึ่งแซง "ยกเลิก" เอง) ให้กลับมาถูกต้องตั้งแต่รันครั้งแรก
 *
 * **Idempotent** — เงื่อนไข `s.position <= sub.max_pos` ทำให้รันซ้ำได้
 * (ถ้าอยู่ท้ายสุดแล้ว / ไม่มีแถวนี้ / เป็นแถเดียว → ไม่มีอะไรถูกอัปเดต;
 * MAX() ของ subquery ว่างคืน NULL เทียบ `<=` ได้ NULL = ไม่แตะ)
 *
 * `down` จงใจเป็น no-op: คืนลำดับเดิมกลับไม่ได้ (ไม่มีใครเก็บ position เก่า)
 * และไม่มีอะไรเสีย — โค้ดยัง pin ให้อยู่ท้ายสุดเหมือนเดิม
 *
 * ⚠️ ใช้ค่าชื่อเป็น **literal ใน SQL** แบบเดียวกับ migration อื่น (เช่น
 * `1801000000000-SeedMoveStepOnlyRule`) เพราะ `migration:run` รันผ่าน
 * `typeorm-ts-node-commonjs` ซึ่งไม่ได้ register `tsconfig-paths` → import
 * `@kanban/shared` ใน migration จะพัง — แต่ตอนนี้สถานะ "ยกเลิก" ถูกถอดออกแล้ว
 * (migration `1831000000000-DropRejectStatus`) ไฟล์นี้จึงกลายเป็น no-op ของตัวมันเอง
 */
export class PinRejectStatusLast1830000000000 implements MigrationInterface {
  name = "PinRejectStatusLast1830000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE issue_statuses s
       SET position = sub.max_pos + 1
       FROM (
         SELECT MAX(position) AS max_pos
         FROM issue_statuses
         WHERE name <> 'ยกเลิก'
       ) sub
       WHERE s.name = 'ยกเลิก'
         AND s.position <= sub.max_pos`,
    );
  }

  public async down(): Promise<void> {
    // no-op — ลำดับเดิมไม่สามารถกู้คืนได้ และไม่จำเป็น: โค้ดยัง pin เองอยู่ดี
  }
}
