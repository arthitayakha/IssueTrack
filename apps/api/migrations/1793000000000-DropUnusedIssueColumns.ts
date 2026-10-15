import { MigrationInterface, QueryRunner } from "typeorm";

export class DropUnusedIssueColumns1793000000000 implements MigrationInterface {
  name = "DropUnusedIssueColumns1793000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS assigned_at`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS completed_at`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS estimate_duration`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS doing_started_at`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS assigned_at timestamptz`);
    await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS completed_at timestamptz`);
    await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS estimate_duration int`);
    await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS doing_started_at timestamptz`);
  }
}
