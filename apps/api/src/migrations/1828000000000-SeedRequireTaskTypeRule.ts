import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Ships the "ประเภทงานก่อนลาก" drag guard as an automation rule: while it is
 * active, a card sitting in the status named by `action_config.status`
 * (1 = รอรับเรื่อง — the same id the notification milestone policy uses) cannot
 * be dragged anywhere until someone picks its ประเภทงาน (บั๊ก / MA /
 * Requirement) at the detail popup. One active rule with this action key is
 * the switch; admins repoint the gate at another column or pause it from the
 * ระบบอัตโนมัติ tab in /master-data. Idempotent — a rule with this action key
 * (seeded or hand-made) skips it.
 */
export class SeedRequireTaskTypeRule1828000000000 implements MigrationInterface {
    name = "SeedRequireTaskTypeRule1828000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO rules (name, trigger_key, template_key, category, action_key, action_config, conditions, is_active, stop_on_error, created_by)
             SELECT 'บังคับเลือกประเภทงานก่อนลาก', 'issue.moved', 'moved_any', 'card_move', 'issue.require_task_type', '{"status":1}'::jsonb, '[]'::jsonb, true, false, NULL
             WHERE NOT EXISTS (SELECT 1 FROM rules WHERE action_key = 'issue.require_task_type')`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // only the seeded row — a rule an admin renamed keeps its own name check
        await queryRunner.query(
            `DELETE FROM rules WHERE action_key = 'issue.require_task_type' AND name = 'บังคับเลือกประเภทงานก่อนลาก'`,
        );
    }
}
