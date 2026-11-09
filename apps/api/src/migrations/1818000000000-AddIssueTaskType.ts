import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ประเภทงาน (task type)** — ป้ายที่บอกว่างานนี้คืออะไร 1 ใน 3 ค่า:
 * `bug` / `feature` / `requirement`
 *
 * ใช้คิดชั่วโมง MA: "ใช้ไป" = ผลรวม `issues.actual_fix_duration` ของงานที่
 * `task_type IN ('feature', 'requirement')` เท่านั้น — **bug ไม่หัก** และ
 * **NULL (ยังไม่ระบุ) ไม่หักด้วย** จึงปลอดภัยกับงานเก่าทุกใบ: แอดมิน/
 * โปรแกรมเมอร์ค่อยมาตั้ง type ที่แผงรายละเอียดการ์ดบนบอร์ดทีหลังได้
 * (แก้ได้ตลอด ตัวเลขคงเหลือปรับเองรอบโหลดถัดไป)
 *
 * เก็บเป็น varchar(16) ไม่ใช่ PG enum / CHECK — สอดคล้องกับคอลัมน์ state
 * อื่นของโปรเจกต์ (fail-open: ค่าที่ไม่รู้จัก = ไม่เข้าเกณฑ์หัก)
 *
 * ไม่มี default — NULL หมายถึง "ยังไม่ระบุ" ซึ่งต่างจากค่าจริงทั้ง 3 ตัว
 * (เหมือนแนวเดียวกับ `app_companies.ma_hours` ที่แยก NULL ออกจาก 0)
 */
export class AddIssueTaskType1818000000000 implements MigrationInterface {
    name = "AddIssueTaskType1818000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE issues ADD COLUMN IF NOT EXISTS task_type VARCHAR(16)`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS task_type`);
    }
}
