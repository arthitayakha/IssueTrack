import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ลบ 5 คอลัมน์ที่ไม่มีใครใช้ของ `issue_statuses`**
 *
 * **ที่มา**: ผู้ใช้ (ตามคำสั่งของพี่) — *"ถ้าฐานข้อมูลแต่ละอันซ้ำเยอะจะให้มี
 * ซ้ำทำไม"* — เช็กครบทั้ง 13 คอลัมน์ของตารางนี้ในโค้ดแล้ว คอลัมน์เหล่านี้
 * **entity `IssueStatus` ไม่ map เลย** และไม่มี raw SQL / service / e2e ตัวไหน
 * อ่านหรือเขียน (เหลือแค่ `seed.ts` ที่เขียน 3 ตัว — แก้ไปพร้อมกันใน commit เดียว):
 *
 * 1. **`sort_order`** — ลำดับตัวเก่าของคอลัมน์บอร์ด ถูกแทนที่ด้วย **`position`**
 *    ซึ่งเป็นตัวจริงทุกจุด (`findAll` → `position ASC, id ASC`, `reorder()`
 *    เขียน `position`, การ์ด move guard อ่านลำดับจากมัน, migration 1803 ใช้
 *    `s.position`) · ค่าเพี้ยนจากกันแล้วด้วย — เสร็จสิ้น `sort_order = 6`
 *    แต่ `position = 5` → แสดงว่ามีการเขียน `position` โดยไม่แตะ `sort_order`
 *    มานาน · ⚠️ ชื่อ `sortOrder` ยังคงอยู่ใน **payload คำขอ** `PATCH
 *    /issue-statuses/reorder` (`{ items: [{ id, sortOrder }] }`) — นั่นเป็นชื่อ
 *    field ของ API ไม่ใช่คอลัมน์ คงไว้เหมือนเดิม
 * 2. **`is_timer_running`** — ธงจับเวลาต่อสถานะ (คอลัมน์ "กำลังดำเนินการ" เคย
 *    `true`) ไม่มีใครอ่าน: ตัวจับเวลาจริงอยู่ที่ `work_sessions` / `issues`
 * 3. **`is_end_status`** — ธง "สถานะสิ้นสุด" ไม่มีใครอ่าน: ระบบ milestone
 *    (แจ้งเตือน + อีเมลถึงผู้แจ้ง) ผูกกับ **status id 1–4** โดยตรง
 *    (`RECEIVED_STATUS_ID` / `notifyStatusChange`) ไม่ใช่ธงนี้
 * 4. **`is_locked`** — ล็อก**ระดับสถานะ**ตัวเก่า เพิ่มโดย migration ที่ apply
 *    มือ (`apps/api/migrations/1794000000000-AddStatusTimerLockColumns.ts` —
 *    ไม่ได้ต่อเข้า `data-source` จึงไม่ถูก track) · ล็อกจริงมา**จากกฎ**
 *    (`RulesEngineService.statusGates().locked` → เขียน `issues.is_locked`) —
 *    คอลัมน์นี้ไม่เคยถูกอ่านเลย ทุกแถวเป็น `false`
 * 5. **`is_hidden`** — ของที่ SQL `0025-merge-board-columns-into-issue-statuses.sql`
 *    เคยจะเขียนตอน merge `board_columns` แต่**ไม่เคย apply** (ตอนนี้ทำเครื่องหมาย
 *    SUPERSEDED แล้ว) · entity ไม่ map, ทุกแถว `false`
 *
 * **ไม่แตะ**: `is_active` (มีชิป "เปิดใช้งาน/ปิดใช้งาน" + สวิตซ์ใน master-data),
 * `position` (ลำดับจริง), `color`, `description` — และ**ไม่มีการ `DELETE` แถว**:
 * สถานะ 5 แถว (รอรับเรื่อง / รอดำเนินการ / กำลังดำเนินการ / เสร็จสิ้น / Review)
 * ใช้ทุกแถว และ **id 1–4 hardcode อยู่ในโค้ด** (งาน gate, milestone, อีเมล)
 *
 * ฝั่งโค้ดที่แก้คู่กัน: `seed.ts` (เลิก INSERT 3 คอลัมน์นี้ และหันมาเขียน
 * `position` ซึ่งเดิม seed ไม่เคยเขียนเลย → ตาราง fresh จะได้ลำดับถูก) +
 * ตัด field `sortOrder` ที่ตายแล้วออกจาก type `IssueStatus` ฝั่งเว็บ 2 จุด
 * (`board-api.ts`, `master-data/page.tsx`) — ไม่มีที่ไหนอ่านอยู่แล้ว
 *
 * **Idempotent** — รันซ้ำได้ทุก statement (`DROP COLUMN IF EXISTS`) · ทั้ง 5
 * อยู่ใน transaction เดียว = atomic · สำรองไว้ก่อนรันด้วย `pg_dump`
 * (`trackdb-backup-20261118-statuses.sql`)
 *
 * ⚠️ ใช้ค่าเป็น **literal ใน SQL** — `migration:run` รันผ่าน
 * `typeorm-ts-node-commonjs` ซึ่งไม่ได้ register `tsconfig-paths`
 *
 * `down()` คืน**แค่โครงสร้าง** (ค่าเริ่มต้น `0`/`false` เหมือนที่คอลัมน์
 * เคยเป็น) — ค่าเดิม (เช่น `sort_order` ของเสร็จสิ้น = 6) ไม่กู้
 */
export class DropDeadStatusColumns1835000000000 implements MigrationInterface {
  name = "DropDeadStatusColumns1835000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ลำดับตัวเก่า — ถูกแทนที่ด้วย position
    await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS sort_order`);
    // ธงจับเวลา/ธงสถานะสิ้นสุด — ไม่มีใครอ่าน (ดู docblock)
    await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS is_timer_running`);
    await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS is_end_status`);
    // ล็อก/ซ่อนระดับสถานะตัวเก่า — ของจริงมาจากกฎ / ไม่เคย apply
    await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS is_locked`);
    await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS is_hidden`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // คืนได้แค่โครงสร้าง — ค่าเดิมไม่กู้ (ถ้าต้องการจริง ให้กู้จาก pg_dump)
    await queryRunner.query(
      `ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS is_timer_running boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS is_end_status boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false`,
    );
  }
}
