import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Time feature, part 2 — gating the "due date" the same way the actual-time
 * field is gated, plus the deadline's target status:
 *
 * - `due_date_unlocked` / `due_date_ever_granted`: drive the three states of
 *   the due-date field — hidden (no rule ever granted it and no date exists),
 *   editable (an `issue.allow_due_date` rule granted it right now) and
 *   read-only (a date exists / it was granted in the past). Moving or
 *   creating a card clears the *unlocked* flag so rules re-grant per status.
 * - `due_target_status_id`: which status the card must reach by the deadline
 *   (optional config of the `issue.set_due_date` rule) — the detail view
 *   shows "ต้องถึงสถานะ … ก่อน …". Deliberately no FK: if the status is
 *   deleted the caption simply disappears.
 */
export class AddDueDateEntryFlagsAndTarget1798000000000 implements MigrationInterface {
  name = "AddDueDateEntryFlagsAndTarget1798000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_date_unlocked boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_date_ever_granted boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_target_status_id integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS due_target_status_id`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS due_date_ever_granted`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS due_date_unlocked`);
  }
}
