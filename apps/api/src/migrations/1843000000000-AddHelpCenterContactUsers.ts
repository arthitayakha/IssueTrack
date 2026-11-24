import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * ผู้ติดต่อที่ลูกค้าเห็นบน `/systems` — แอดมินเลือกโปรแกรมเมอร์ได้หลายคน
 * เก็บเป็น array ของ user id ในแถวเดิมของ `help_center_settings` (id = 1)
 * ไม่มีตารางใหม่ / ไม่แตะ `users` · idempotent (`IF NOT EXISTS`)
 */
export class AddHelpCenterContactUsers1843000000000 implements MigrationInterface {
  name = "AddHelpCenterContactUsers1843000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE help_center_settings
      ADD COLUMN IF NOT EXISTS contact_user_ids INTEGER[] NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE help_center_settings DROP COLUMN IF EXISTS contact_user_ids
    `);
  }
}
