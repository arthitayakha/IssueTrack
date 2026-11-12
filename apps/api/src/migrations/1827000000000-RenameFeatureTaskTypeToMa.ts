import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **Rename ค่าประเภทงาน `feature` → `ma`** (data only — ไม่แตะ schema)
 *
 * เหตุผล: ป้ายใน UI เปลี่ยนจาก "เพิ่มฟีเจอร์" เป็น **"MA"** (ผู้ใช้สั่งไว้ —
 * ยังหักชั่วโมง MA เหมือนเดิมทุกประการ) จึงให้ค่าที่เก็บใน
 * `issues.task_type` ตรงกับป้ายใหม่ด้วย เพื่อไม่ให้ DB กับจอไม่ตรงกัน
 * (`t(`taskType.${taskType}`)` ฝั่งเว็บ lookup ด้วยค่าจาก DB ตรง ๆ)
 *
 * คอลัมน์เป็น `varchar(16)` ไม่ใช่ PG enum / CHECK (ดู migration 1818) จึง
 * **ไม่ต้อง ALTER อะไรเลย** — อัปเดตข้อมูลอย่างเดียว
 *
 * ณ เวลาที่เขียน: มีแถว `feature` 3 แถว (1 แถวมีเวลา 40 ชม.) และ
 * `requirement` **0 แถว** — ยอด "ใช้ไป/คงเหลือ" ทุกจอจึงไม่เปลี่ยนเลย
 * (`ma` ยังหักเหมือน `feature` เดิม)
 *
 * หมายเหตุ: `requirement` **ยังเป็นค่าที่ถูกต้อง** (ยังอยู่ใน dropdown) เพียง
 * **เลิกหัก MA** ซึ่งเป็นการแก้ในโค้ด (`DEDUCTED_TASK_TYPES` /
 * `taskTypes=ma`) ไม่เกี่ยวกับข้อมูลในตารางนี้ — ไม่มีแถว requirement
 * อยู่แล้วจึงไม่มีอะไรให้ย้าย
 */
export class RenameFeatureTaskTypeToMa1827000000000 implements MigrationInterface {
  name = "RenameFeatureTaskTypeToMa1827000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE issues SET task_type = 'ma' WHERE task_type = 'feature'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE issues SET task_type = 'feature' WHERE task_type = 'ma'`,
    );
  }
}
