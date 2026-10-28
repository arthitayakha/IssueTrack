import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The `rule_runs` execution log is being removed: rule history is already
 * answered by `activity_logs` (the `rule.*` audit rows behind /automation/runs),
 * and the run table was the only thing keeping a per-execution record. The
 * engine no longer writes it, so the table is dropped.
 *
 * `rule_runs` was created by migration `0028`; this drops it outright. Existing
 * run history goes with the table (dev data only).
 */
export class DropRuleRunsTable1800000000000 implements MigrationInterface {
  name = "DropRuleRunsTable1800000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // dropping the table takes its indexes with it
    await queryRunner.query(`DROP TABLE IF EXISTS "rule_runs"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "rule_runs" (
        "id" SERIAL PRIMARY KEY,
        "rule_id" integer,
        "rule_name" character varying(150),
        "trigger_key" character varying(64) NOT NULL,
        "issue_id" integer,
        "status" character varying(16) NOT NULL,
        "action_key" character varying(64),
        "detail" text,
        "duration_ms" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "FK_rule_runs_rule" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_rule_runs_issue" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_rule_runs_rule_id_created_at" ON "rule_runs" ("rule_id", "created_at")`,
    );
  }
}
