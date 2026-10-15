import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStatusTimerLockColumns1794000000000 implements MigrationInterface {
  name = "AddStatusTimerLockColumns1794000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS timer_enabled boolean DEFAULT false`);
    await queryRunner.query(`ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS time_entry_enabled boolean DEFAULT false`);
    await queryRunner.query(`ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS timer_enabled`);
    await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS time_entry_enabled`);
    await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS is_locked`);
  }
}
