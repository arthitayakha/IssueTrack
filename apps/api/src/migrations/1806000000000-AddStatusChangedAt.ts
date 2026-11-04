import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * "การ์ดเข้าสถานะนี้ตั้งแต่เมื่อไหร่" — one stamp per card for the status it
 * sits in right now. Written on create / manual drag / a rule's
 * `issue.move_status` (issues.service + rules-engine). The board's stale-hide
 * policy (active `issue.hide_from_board` rules, `hideStaleDone=1` on
 * GET /issues) counts days from this column.
 *
 * `updated_at` cannot serve that job: *any* edit bumps it (title, assignee,
 * automation writes, timers) and would restart the clock. History has no real
 * "entered status at" value — backfill with `updated_at` as the closest
 * proxy; NULL (unknown age) simply never hides, fail-open.
 */
export class AddStatusChangedAt1806000000000 implements MigrationInterface {
    name = "AddStatusChangedAt1806000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE issues ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NULL`,
        );
        await queryRunner.query(
            `UPDATE issues SET status_changed_at = updated_at WHERE status_changed_at IS NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS status_changed_at`);
    }
}
