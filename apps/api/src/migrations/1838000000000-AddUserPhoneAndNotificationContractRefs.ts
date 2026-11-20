import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **เพิ่มช่องทางติดต่อลูกค้า + ตัวระบุสัญญาของแถวแจ้งเตือน**
 *
 * 1. `users.phone` — เบอร์โทรของผู้ใช้ (มีค่าได้ทุกบทบาท แต่อ่านจริงตอนแสดง
 *    "ผู้ติดต่อ" ของบริษัทในกล่องเข้า/หน้า `/systems`) · ระบบเดิมมีแค่ `email`
 *    ทำให้แอดมินที่กดแจ้งเตือน "MA หมดแล้ว" ไม่มีทางติดต่อลูกค้าได้เลย
 * 2. `notifications.app_id` / `company_id` — เก็บว่าการ์ดแจ้งเตือนสัญญา
 *    (`ma_depleted` / `app_expiring` / `app_expired` / confirmation) มาจากคู่
 *    แอป×บริษัทไหน เพื่อให้กดแล้ว deep-link ไปแถวสัญญานั้นได้ทันที · ไม่ใส่ FK
 *    เพราะแถวแจ้งเตือนเป็นของชั่วคราว (อ่านแล้วลบ) ถ้าแอป/บริษัทถูกลบไปแล้ว
 *    ลิงก์ยังเปิดได้และ fail-open อยู่
 *
 * **Idempotent** — `ADD COLUMN IF NOT EXISTS` รันซ้ำได้ · แถวเก่าที่ไม่มีค่า
 * ทั้งสาม column เป็น `NULL` อยู่แล้ว (ไม่ต้อง backfill — ฝั่ง API fail-open)
 */
export class AddUserPhoneAndNotificationContractRefs1838000000000
  implements MigrationInterface
{
  name = "AddUserPhoneAndNotificationContractRefs1838000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone varchar(30)`);
    await queryRunner.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS app_id integer`);
    await queryRunner.query(`ALTER TABLE notifications ADD COLUMN IF NOT EXISTS company_id integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS company_id`);
    await queryRunner.query(`ALTER TABLE notifications DROP COLUMN IF EXISTS app_id`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS phone`);
  }
}
