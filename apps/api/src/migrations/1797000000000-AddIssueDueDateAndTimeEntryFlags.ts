import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Time feature, part 1 — the columns the card needs:
 *
 * - `due_date` / `due_time`: the Trello-style deadline (time optional; a card
 *   with `due_time IS NULL` is due at the end of that day). Populated by hand
 *   in the card detail or by the `issue.set_due_date` rule (+N days).
 * - `time_entry_unlocked` / `time_entry_ever_granted`: drive the three states
 *   of the "actual fix time" field — hidden (never granted), editable
 *   (granted right now by an `issue.allow_time_entry` rule) and read-only
 *   (granted at some point in the past). Moving/creating a card clears the
 *   *unlocked* flag again, so rules re-grant it per status.
 *
 * The per-status `timer_enabled` / `time_entry_enabled` switches are dropped:
 * timing is fully rule-driven now and the entry gate lives in these columns.
 * (`estimate_duration` was never created and the estimate feature is out of
 * scope, so nothing to add for it.)
 */
export class AddIssueDueDateAndTimeEntryFlags1797000000000
  implements MigrationInterface
{
  name = "AddIssueDueDateAndTimeEntryFlags1797000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_date date`);
    await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_time time`);
    await queryRunner.query(
      `ALTER TABLE issues ADD COLUMN IF NOT EXISTS time_entry_unlocked boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE issues ADD COLUMN IF NOT EXISTS time_entry_ever_granted boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS timer_enabled`);
    await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS time_entry_enabled`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS timer_enabled boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS time_entry_enabled boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS time_entry_ever_granted`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS time_entry_unlocked`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS due_time`);
    await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS due_date`);
  }
}
