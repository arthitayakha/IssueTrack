import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The due-date feature is being removed entirely ("ไม่ใช้แล้ว"): the two rule
 * actions (`issue.set_due_date` / `issue.allow_due_date`), the card/detail UI
 * and every code path are gone, so the five columns it owned are dropped too.
 *
 * `due_date` / `due_time` were added by `1797000000000` and the entry-gate /
 * target columns by `1798000000000` — both already recorded, hence this new
 * migration instead of editing them. Existing deadline data goes with the
 * columns (dev data only).
 */
export class DropIssueDueDateColumns1799000000000 implements MigrationInterface {
  name = "DropIssueDueDateColumns1799000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS due_target_status_id`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS due_date_ever_granted`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS due_date_unlocked`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS due_time`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS due_date`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_date date`);
    await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_time time`);
    await queryRunner.query(
      `ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_date_unlocked boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_date_ever_granted boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_target_status_id integer`);
  }
}
