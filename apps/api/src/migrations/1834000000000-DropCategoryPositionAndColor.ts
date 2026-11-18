import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ลบคอลัมน์ `categories.position` + `categories.color` ที่ไม่มีใครใช้แล้ว**
 *
 * **ที่มา**: ผู้ใช้สรุปว่า *"ถ้าฐานข้อมูลแต่ละอันซ้ำเยอะจะให้มีซ้ำทำไม"* —
 * เช็คครบทุกตารางแล้ว ตาราง `categories` มีแค่ 3 แถว (ไม่ซ้ำ ใช้ทุกแถว
 * 40/23/1 งาน = ไม่แตะ) แต่มี **2 คอลัมน์ที่ตาย/ไม่มีใครอ่าน**:
 *
 * 1. **`color`** — คอลัมน์ตายสนิท: entity `Category` **ไม่เคย map มันเลย**,
 *    ไม่มี raw SQL / seed แตะ (`grep color` ในโมดูล categories = 0) —
 *    ค่าทุกแถวเป็น `"default"` ค้างมาตั้งแต่ยุคออกแบบ UI ที่เลิกใช้ไปแล้ว
 *    เหมือน `activity_logs.board_id` ที่เพิ่งลบโดย 1833
 * 2. **`position`** — เขียนอย่างเดียว ไม่มีใครอ่าน: เดิมใช้ขับ "มอบงาน
 *    อัตโนมัติตามตำแหน่ง" (`resolveAutoAssign`) แต่ถูกถอดออกแล้ว
 *    (มอบงานทำมือ — ดูคอมเมนต์ใน `issues.service.ts` "Category auto-assign …
 *    is parked") และหน้า master-data **ลบช่อง "ตำแหน่ง" ในตารางกับ
 *    dropdown ในฟอร์มออกแล้ว** → เว็บไม่มีที่ไหนอ่านค่านี้, เหลือแค่ API
 *    ยังรับ/คืนค่าอยู่ = write-only legacy · บันทึกโปรเจกต์เดิมเขียนว่า
 *    "การลบคอลัมน์รอคำสั่งพี่" — **ผู้ใช้อนุมัติแล้วในรอบนี้**
 *
 * **ฝั่งโค้ดถูกถอดก่อนรัน migration นี้** (entity ไม่ map `position` แล้ว,
 * service/controller ไม่รับ/ไม่คืนค่า) — จะรันก่อนหรือหลัง `migration:run`
 * จึงไม่พังทั้งคู่ · ฝั่งเว็บไม่ต้องแก้: type `Category` ทั้งสองตัวไม่ประกาศ
 * `position` และ payload ส่งแค่ `{ name }` อยู่แล้ว
 *
 * **แถวนี้ (ทั้ง 3 แถว) ไม่ถูกแตะ** — `DELETE` ไม่มี, `ALTER` แค่ DROP
 * คอลัมน์ · ค่า `Frontend`/`Backend`/`default` เดิมไม่กลับมา (ไม่มี
 * ความหมายแล้ว; ถ้าต้องการกู้ดู `pg_dump` ที่สำรองไว้ก่อนรัน)
 *
 * **Idempotent** — รันซ้ำได้ทั้งสอง statement (`DROP COLUMN IF EXISTS`) ·
 * ทั้งสองอยู่ใน transaction เดียว = atomic
 *
 * ⚠️ ใช้ค่าเป็น **literal ใน SQL** แบบเดียวกับ migration อื่น เพราะ
 * `migration:run` รันผ่าน `typeorm-ts-node-commonjs` ซึ่งไม่ได้ register
 * `tsconfig-paths` → import `@kanban/shared` ใน migration จะพัง
 *
 * `down()` คืน**แค่โครงสร้าง** (คอลัมน์เปล่า nullable) — ค่าเดิมไม่กู้
 */
export class DropCategoryPositionAndColor1834000000000 implements MigrationInterface {
  name = "DropCategoryPositionAndColor1834000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // write-only legacy — เคยขับการมอบอัตโนมัติ ตอนนี้ไม่มีใครอ่านแล้ว
    await queryRunner.query(`ALTER TABLE categories DROP COLUMN IF EXISTS position`);
    // คอลัมน์ตาย — entity ไม่เคย map (ดู docblock)
    await queryRunner.query(`ALTER TABLE categories DROP COLUMN IF EXISTS color`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // คืนได้แค่โครงสร้าง — ค่า Frontend/Backend/default เดิมไม่กู้
    // (ถ้าต้องการจริง ให้กู้จาก pg_dump ที่สำรองไว้ก่อนรัน)
    await queryRunner.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS position varchar(50)`);
    await queryRunner.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS color varchar(50)`);
  }
}
