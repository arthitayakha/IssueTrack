import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * สถานะ "ยกเลิกสัญญา" แบบ**ย้อนกลับได้** — 1 คู่ แอป×บริษัท มีได้หลายแถว
 * (`app_companies` = 1 ช่วงเวลา) จึง stamp ทุกแถวของคู่ตอนยกเลิกและล้างทุกแถว
 * ตอนเปิดกลับ (ดู `AppsService.cancelContract` / `restoreContract`)
 *
 * ไม่ลบข้อมูล ไม่แตะวันที่/MA/ประวัติ และ**ไม่ backfill** — แถวเก่าทั้งหมด
 * ถือว่ายังไม่ถูกยกเลิก (`NULL`) เหมือนเดิมทุกประการ
 *
 * ผลของ `cancelled_at`: cron หมดอายุ (`app-expiry`), กระดิ่ง MA หมด
 * (`ma-usage`) และสายเตือนซ้ำ (`notification-repeats`) ข้ามคู่นี้ทั้งหมด
 * — อีเมลที่อยู่ในเส้นทางเดียวกันจึงเงียบตาม · แถวแจ้งเตือนที่ส่งไปแล้ว
 * **ปล่อยไว้** ให้ยังอ่านได้ (ผู้ใช้เลือก)
 *
 * Idempotent ทั้ง up/down
 */
export class AddAppCompanyCancelledAt1848000000000 implements MigrationInterface {
  name = "AddAppCompanyCancelledAt1848000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app_companies DROP COLUMN IF EXISTS cancelled_at`);
  }
}
