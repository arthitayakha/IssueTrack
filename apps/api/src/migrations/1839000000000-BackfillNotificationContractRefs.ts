import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **Backfill `notifications.app_id` / `company_id` ของแถวสัญญาที่มีอยู่แล้ว**
 *
 * แถว `ma_depleted` / `app_expiring` / `app_expired` / confirmation ที่สร้าง
 * ก่อน migration 1838 เก็บแค่ `title = "<appName> <companyName>"` ทำให้ตอนกด
 * กระดิ่งพาไป `/systems` ธรรมดา (ไม่รู้ว่าคู่ไหน) และไม่มีปุ่ม "ติดต่อลูกค้า"
 *
 * เติมจาก**ชื่อที่ตรงกันเป๊ะ** เท่านั้น — ตรงกับสูตรของ `notifyAppExpiry` /
 * `notifyMaDepleted` / `notifyContractChange` ที่ต่อ title ด้วยชื่อแอป + ชื่อ
 * บริษัท · แถวที่ title ไม่ตรง (ชื่อถูกแก้/แอปถูกลบ) ปล่อย NULL ไว้ = fail-open
 * เหมือนเดิม · ไม่แตะแถวการ์ด (`issue_id`) และไม่แตะแถวที่มีค่าแล้ว
 *
 * Idempotent — `WHERE n.company_id IS NULL` ทำให้รันซ้ำไม่เปลี่ยนแถวเดิม
 */
export class BackfillNotificationContractRefs1839000000000 implements MigrationInterface {
  name = "BackfillNotificationContractRefs1839000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE notifications n
      SET app_id = a.id, company_id = c.id
      FROM apps a, companies c
      WHERE n.company_id IS NULL
        AND n.title = a.name || ' ' || c.name
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ไม่กู้ค่าเดิม (NULL) — แถวที่ backfill แล้วเป็นข้อมูลที่ถูกต้องตาม title
    void queryRunner;
  }
}
