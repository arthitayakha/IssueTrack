import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * One-shot release from a status lock. A card whose status is covered by an
 * active `issue.lock` rule cannot be dragged out; the board's "ปลดล็อกการ์ด"
 * button (or an `issue.unlock` rule) sets `lock_exempted` so exactly one move
 * is allowed — the move itself clears the flag again, so re-entering a locked
 * status locks the card once more. Idempotent.
 */
export class AddIssueLockExemptColumn1802000000000 implements MigrationInterface {
    name = "AddIssueLockExemptColumn1802000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE issues ADD COLUMN IF NOT EXISTS lock_exempted boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS lock_exempted`);
    }
}
