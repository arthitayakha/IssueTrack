import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * "แจ้งเรื่องค้างนานไปแล้วเมื่อไหร่" — one bell per sitting: the daily 09:00
 * sweep (stale-cards.service) notifies the assignee + every admin when a card
 * crosses an active `issue.notify_stale` rule's day count, then stamps this
 * column so the next sweep skips it. NULL = never notified (fail: it will be
 * picked up on the next round).
 *
 * The stamp is cleared wherever `status_changed_at` is written (create /
 * manual drag / a rule's `issue.move_status`) — moving out and sitting in a
 * status again is a *new* sitting and may ring the bell again.
 *
 * Dedup cannot ride on `notifications`: reading a row deletes it, so the inbox
 * forgets and would re-notify every day.
 */
export class AddStaleNotifiedAt1807000000000 implements MigrationInterface {
    name = "AddStaleNotifiedAt1807000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE issues ADD COLUMN IF NOT EXISTS stale_notified_at timestamptz NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS stale_notified_at`);
    }
}
