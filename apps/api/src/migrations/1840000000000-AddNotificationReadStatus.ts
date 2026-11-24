import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **เพิ่มสถานะ "อ่านแล้ว" ให้แถวแจ้งเตือน (โดยไม่ลบข้อมูล)**
 *
 * เดิมกติกาคือ "อ่าน = ลบทิ้ง" (`1804000000000` ตัดคอลัมน์ `is_read` / `read_at`
 * ออกไป) ทำให้ไม่มีทางบอกได้ว่าอ่านแจ้งเตือนไหนไปเมื่อไหร่ — ผู้ใช้ต้องการเก็บ
 * หลักฐานว่าอ่านแล้วในขณะที่หน้าตากระดิ่งยังเหมือนเดิม (กดแล้วแถวหายจาก列表)
 *
 * วิธี: เพิ่ม `is_read boolean NOT NULL DEFAULT false` + `read_at timestamptz NULL`
 * แถวเก่าที่เหลืออยู่ในตาราง = ยังไม่อ่านอยู่แล้ว (ของที่อ่านแล้วถูกลบไปก่อนหน้า)
 * จึงไม่ต้อง backfill · `GET /notifications` กรอง `is_read = false` ต่อไป
 * ส่วน mark-read เป็น UPDATE ไม่ใช่ DELETE
 *
 * Idempotent ด้วย `IF NOT EXISTS` — รันซ้ำได้ปลอดภัย
 */
export class AddNotificationReadStatus1840000000000 implements MigrationInterface {
  name = "AddNotificationReadStatus1840000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS read_at timestamptz NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS read_at`);
    await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS is_read`);
  }
}
