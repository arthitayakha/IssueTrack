import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `issues.actual_fix_at` — **เวลาที่ชั่วโมง MA ถูกบันทึกจริง** (ผู้เดียวที่เขียนคือ
 * `IssuesService.setActualFixDuration` — `PUT /issues/:id/time`)
 *
 * มีไว้เพื่อ "ผูกงานเข้ารอบสัญญา": คู่ แอป×บริษัท เก็บได้หลายช่วง (append ไม่เขียนทับ)
 * จึงต้องรู้ *ตอนไหน* ที่ชั่วโมงถูกกรอก ถึงจะบอกได้ว่าชั่วโมงนั้นเป็นของรอบที่เท่าไร
 * (กติกาอยู่ที่ `pickPeriodId()` ใน `ma-attribution.ts`)
 *
 * **ไม่ backfill** — งานที่กรอกเวลาก่อน migration นี้ได้ `NULL` = "ข้อมูลก่อนระบบ ไม่ระบุรอบ"
 * และหน้า UI จะ *เล่า* ตัวเลขนี้ออกมาตรง ๆ (`unattributedHours`) แทนที่จะเดาว่าเป็นรอบไหน
 * (ถ้าอยากให้ทุกงานถูกระบุรอบ ให้เติม `UPDATE issues SET actual_fix_at = updated_at WHERE ...`
 *  — เป็นการเดาเพราะ `updated_at` ถูก bump ทุกครั้งที่แก้สเตตัส/คอมเมนต์)
 *
 * `NULL` ยังหมายถึง "ยังไม่เคยกรอกเวลา" / "กรอกเป็น 0 วินาที" ได้ด้วย —
 * `setActualFixDuration` ล้างคอลัมน์นี้เองเมื่อค่าเป็น 0
 *
 * Idempotent — `IF NOT EXISTS` รันซ้ำได้ · nullable ไม่ต้องมี default
 */
export class AddIssueActualFixAt1822000000000 implements MigrationInterface {
    name = "AddIssueActualFixAt1822000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE issues ADD COLUMN IF NOT EXISTS actual_fix_at TIMESTAMPTZ`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS actual_fix_at`);
    }
}
