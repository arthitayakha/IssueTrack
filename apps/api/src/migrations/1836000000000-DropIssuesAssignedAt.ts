import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ลบ `issues.assigned_at` — คอลัมน์ที่ตายแล้วตัวสุดท้ายของตาราง**
 *
 * **ที่มา**: ผู้ใช้ (ตามคำสั่งของพี่) — *"ถ้าฐานข้อมูลแต่ละอันซ้ำเยอะจะให้มี
 * ซ้ำทำไม"* · หลักฐานว่าไม่มีใครใช้:
 *
 * 1. **entity `Issue` ไม่ map เลย** (`apps/api/src/modules/issues/entities/issue.entity.ts`
 *    map 31 คอลัมน์ จาก 32 คอลัมน์จริงใน DB — คอลัมน์ที่ขาดคือตัวนี้)
 * 2. **โค้ด runtime 0 ครั้ง** — นับ token `assigned_at` / `assignedAt` ทั้ง
 *    `apps/api/src`, `apps/api/test`, `apps/web/src`, `packages/shared/src`
 *    (ไม่นับไฟล์ migration) ได้ = 0 ทุกที่ · ไม่มี service / DTO / raw SQL /
 *    e2e / ฝั่งเว็บตัวไหนแตะ
 * 3. **ข้อมูลว่างทุกแถว** — `count(assigned_at) = 0` จากทั้ง 80 แถว (ไม่มี
 *    อะไรให้สูญหาย)
 * 4. เคยถูกเตรียมไว้แล้วโดย **`apps/api/migrations/1793000000000-DropUnusedIssueColumns.ts`**
 *    ซึ่งลบ `assigned_at` + อีก 3 ตัว (`completed_at`, `estimate_duration`,
 *    `doing_started_at`) — แต่ไฟล์นั้น**ไม่ได้ต่อเข้า `data-source.ts`**
 *    (raw SQL/TS ใน `apps/api/migrations/` ไม่ถูก track) จึงไม่เคยรัน ·
 *    3 ตัวหลังถูกลบไปแล้วใน migration อื่น เหลือ `assigned_at` ตัวเดียว —
 *    ไฟล์ 1793 นั้นปล่อยไว้ตามเดิม (`IF EXISTS` ทุกบรรทัด รันซ้ำก็ไม่พัง)
 *
 * **ไม่แตะ**: `label_id` (ระบบคู่กับตาราง `issue_labels` — ทั้งคู่ยังใช้งาน
 * `create`/`update` เขียนทั้งคู่, `IssueDialog` มี Select เลือกป้ายเดียว
 * ส่ง `labelId`, ป๊อปอัพรายละเอียดใช้ `labelIds` → รอคำสั่ง refactor จากพี่)
 * · คอลัมน์อีก 30 ตัวตรวจแล้วใช้หมดทุกตัว
 *
 * **Idempotent** — `DROP COLUMN IF EXISTS` รันซ้ำได้ · สำรองไว้ก่อนรันด้วย
 * `pg_dump` (`trackdb-backup-20261118-issues.sql`)
 *
 * ⚠️ ใช้ค่าเป็น **literal ใน SQL** — `migration:run` รันผ่าน
 * `typeorm-ts-node-commonjs` ซึ่งไม่ได้ register `tsconfig-paths`
 *
 * `down()` คืน**แค่โครงสร้าง** (nullable timestamptz) — ค่าเดิมไม่กู้
 * (ทุกแถวเป็น NULL อยู่แล้ว จึงไม่มีอะไรต้องกู้จริง)
 */
export class DropIssuesAssignedAt1836000000000 implements MigrationInterface {
  name = "DropIssuesAssignedAt1836000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ไม่มีใคร map/อ่าน/เขียน — ทุกแถว NULL, entity ไม่รู้จักคอลัมน์นี้
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS assigned_at`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // คืนได้แค่โครงสร้าง — ค่าเดิมไม่กู้ (เดิมทุกแถว NULL อยู่แล้ว)
    await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS assigned_at timestamptz`);
  }
}
