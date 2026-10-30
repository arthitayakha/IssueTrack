import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ตัดคอลัมน์ซ้ำ + เปลี่ยนโมเดลการแจ้งเตือนเป็น "อ่าน = ลบ"
 *
 *   activity_logs.actor_name / actor_role → อ่านจาก `users` + `roles` ตอน query (join)
 *   notifications.actor_name              → เหมือนกัน (join ผ่าน actor_id)
 *   notifications.message                 → ประกอบจาก actor + type + title และไม่มีที่อ่านกลับ
 *   notifications.is_read / is_archived / read_at → แจ้งเตือนไม่มีสถานะแล้ว คลิก = แถวหาย
 *                                            (เหลือกล่องขาเข้าเดียว ไม่มี "ทั่วไป"/"เก็บถาวร")
 *
 * แถวที่อ่าน/เก็บถาวรไปแล้วถูกลบ "ก่อน" หักคอลัมน์ เพราะภายใต้โมเดลใหม่มันหายไปแล้ว
 * — ตรงนี้คือส่วนเดียวที่ย้อนไม่ได้ (`down` คืนได้เฉพาะคอลัมน์)
 */
export class DropActorSnapshotAndReadState1804000000000 implements MigrationInterface {
    name = "DropActorSnapshotAndReadState1804000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DELETE FROM notifications WHERE is_read = true OR is_archived = true`,
        );
        await queryRunner.query(`ALTER TABLE activity_logs DROP COLUMN IF EXISTS actor_name`);
        await queryRunner.query(`ALTER TABLE activity_logs DROP COLUMN IF EXISTS actor_role`);
        await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS actor_name`);
        await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS message`);
        await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS is_read`);
        await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS is_archived`);
        await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS read_at`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at timestamptz NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(
            `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false`,
        );
        await queryRunner.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message text`);
        await queryRunner.query(
            `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS actor_name varchar(100)`,
        );
        await queryRunner.query(
            `ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS actor_role varchar(50)`,
        );
        await queryRunner.query(
            `ALTER TABLE activity_logs ADD COLUMN IF NOT EXISTS actor_name varchar(100)`,
        );
        // the pre-clean DELETE in `up()` is not reversible
    }
}
