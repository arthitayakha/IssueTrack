import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ล้าง `activity_logs` ที่ซ้ำ/กำพร้า/เก่า แล้วลบคอลัมน์ `board_id` ที่ตายแล้ว**
 *
 * **ที่มา**: ผู้ใช้สรุปว่า *"ถ้าฐานข้อมูลแต่ละอันซ้ำเยอะจะให้มีซ้ำทำไม"* —
 * เช็คครบทุก 23 ตารางแล้ว มีซ้ำจริงแค่ตารางนี้ตารางเดียว (ตารางอื่น 0 ทุกตัว)
 *
 * **3 หมวดที่ลบ (นับ ณ เวลารัน: 466 + 249 + 42 − ซ้อนทับ = 735 แถว)**
 *
 * 1. **แถวยิงซ้ำ** (~466) — แถวถัดไปของ `(actor, action, entity, detail)`
 *    เดียวกันภายใน **2 วินาที** = request ยิงซ้ำ (คู่เร็วสุดห่าง 34–80 มิลลิวินาที
 *    เร็วกว่าที่คนจะกดได้) · **เก็บแถวแรกของทุกคู่เสมอ** → audit ไม่สูญ
 * 2. **แถวกำพร้า** (~249) — `card.*` / `comment.created` / `rule.*` ที่ entity_id
 *    ชี้ไป issue/rule ที่ถูกลบไปแล้ว (e2e hard-delete + การลบกฎ) — เปิดดูที่ไหนไม่ได้อีก
 * 3. **แถวชื่อ action เก่าที่เลิกใช้** (42) — `issue.create` / `issue.move` /
 *    `board.create` / `column.show` (ยุคก่อน rename เป็น `card.*`) +
 *    `auth.reminder` (ฟีเจอร์เตือนรายวันถูกถอดโดย 1832)
 *
 * **คอลัมน์ `board_id`** — ซากยุคหลายบอร์ด: migration 17912 ลบ FK
 * `fk_activity_logs_board` + ตาราง `boards` แต่**ไม่ได้ DROP COLUMN ตัวนี้** —
 * entity `ActivityLog` ไม่ map มัน, โค้ด API/เว็บอ้างอิง 0 จุด, ค่าเกือบทั้งหมด
 * NULL (34 แถวที่เหลือมีค่า `1` เป็นแถวชุด 3 ที่ลบไปพร้อมกัน) → หลังรันคอลัมน์นี้
 * ไม่เหลืออะไรให้อ่าน
 *
 * **Idempotent** — รันซ้ำได้ทั้งสอง statement (`DELETE` ไม่ match อะไร /
 * `DROP COLUMN IF EXISTS`) · ทั้งสองอยู่ใน transaction เดียว = atomic
 *
 * ⚠️ ใช้ค่าเป็น **literal ใน SQL** แบบเดียวกับ migration อื่น เพราะ
 * `migration:run` รันผ่าน `typeorm-ts-node-commonjs` ซึ่งไม่ได้ register
 * `tsconfig-paths` → import `@kanban/shared` ใน migration จะพัง
 *
 * `down()` คืน**แค่คอลัมน์** — แถวที่ลบตั้งใจลบ ไม่สามารถกู้คืนได้
 * (ถ้าต้องการจริง ให้กู้จาก `pg_dump` ที่สำรองไว้ก่อนรัน)
 */
export class CleanActivityLogsAndDropBoardId1833000000000 implements MigrationInterface {
  name = "CleanActivityLogsAndDropBoardId1833000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) แถวซ้ำ/กำพร้า/เก่า — คำนวณ flag ทั้ง 3 ชุดจาก snapshot เดียวกัน
    //    แล้วค่อยลบครั้งเดียว (นับได้ตรงเป๊ะ ไม่กระทบจากการลบทีละชุด)
    await queryRunner.query(`
      WITH ordered AS (
        SELECT id,
               created_at AS t,
               action AS act,
               entity_id AS ent,
               lag(created_at) OVER (
                 PARTITION BY actor_id, action, entity_id, detail
                 ORDER BY created_at, id
               ) AS prev_at
        FROM activity_logs
      ),
      flags AS (
        SELECT id,
          -- (1) แถวซ้ำ: identical กับแถวก่อนหน้าภายใน 2 วินาที
          (prev_at IS NOT NULL AND t - prev_at < interval '2 seconds') AS is_a,
          -- (2) แถวกำพร้า: entity (issue/rule) ถูกลบไปแล้ว —
          --     comment.created เก็บ entity_id = issue id (ส่วน comment.updated/
          --     comment.deleted เก็บ comment id จึงไม่แตะ), card.*/rule.% = id ของตัวเอง
          ((act LIKE 'card.%' OR act = 'comment.created' OR act LIKE 'rule.%') AND ent IS NOT NULL
            AND ((act LIKE 'card.%' AND NOT EXISTS (SELECT 1 FROM issues i WHERE i.id = ordered.ent))
              OR (act = 'comment.created' AND NOT EXISTS (SELECT 1 FROM issues i WHERE i.id = ordered.ent))
              OR (act LIKE 'rule.%' AND NOT EXISTS (SELECT 1 FROM rules r WHERE r.id = ordered.ent)))
          ) AS is_b,
          -- (3) แถวชื่อ action เก่า/ฟีเจอร์ที่เลิกใช้
          (act IN ('issue.create', 'issue.move', 'board.create', 'column.show', 'auth.reminder')) AS is_c
        FROM ordered
      )
      DELETE FROM activity_logs
      WHERE id IN (SELECT id FROM flags WHERE is_a OR is_b OR is_c)
    `);

    // 2) คอลัมน์ตกค้างยุคหลายบอร์ด — ไม่มีใครอ่าน/เขียนแล้ว (ดู docblock)
    await queryRunner.query(`ALTER TABLE activity_logs DROP COLUMN IF EXISTS board_id`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS board_id integer`);
    // แถวที่ลบไปตั้งใจลบ — ไม่กู้ (down คืนได้แค่โครงสร้าง; ข้อมูลอยู่ที่ pg_dump)
  }
}
