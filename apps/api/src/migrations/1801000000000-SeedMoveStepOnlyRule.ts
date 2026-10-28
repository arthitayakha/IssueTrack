import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Ships the "one column at a time" drag guard as an automation rule so admins
 * can turn it off from the list they already know: one active rule with
 * `issue.move_step_only` is the switch, pausing it restores free dragging.
 * Seeding it on makes step-by-step moves the default from this release.
 * Idempotent — a rule with this action key (seeded or hand-made) skips it.
 */
export class SeedMoveStepOnlyRule1801000000000 implements MigrationInterface {
    name = "SeedMoveStepOnlyRule1801000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO rules (name, trigger_key, template_key, category, action_key, action_config, conditions, is_active, stop_on_error, created_by)
             SELECT 'บังคับลากการ์ดทีละคอลัมน์', 'issue.moved', 'moved_any', 'card_move', 'issue.move_step_only', '{}'::jsonb, '[]'::jsonb, true, false, NULL
             WHERE NOT EXISTS (SELECT 1 FROM rules WHERE action_key = 'issue.move_step_only')`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // only the seeded row — a rule an admin renamed keeps its own name check
        await queryRunner.query(
            `DELETE FROM rules WHERE action_key = 'issue.move_step_only' AND name = 'บังคับลากการ์ดทีละคอลัมน์'`,
        );
    }
}
