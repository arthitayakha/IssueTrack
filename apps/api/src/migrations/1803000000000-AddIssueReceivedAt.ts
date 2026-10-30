import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * วันที่เริ่มรับเรื่อง — a card counts as "received" (รับเรื่อง) the moment it
 * lands in the "รอดำเนินการ" status (id 2). IssuesService.move() stamps the
 * column from now on; this migration backfills history:
 *
 *   1. the first card.moved activity whose target was the status (names both
 *      the current Thai "รอดำเนินการ" and the original English "Todo"/"To Do"
 *      — the statuses were renamed after those moves were logged), then
 *   2. cards already sitting past that column (position >= 2) with no logged
 *      move fall back to created_at, anything left stays NULL (report: —).
 *
 * Statuses are addressed by name only inside this backfill; runtime writes
 * use the stable id (RECEIVED_STATUS_ID in issues.service).
 */
export class AddIssueReceivedAt1803000000000 implements MigrationInterface {
    name = "AddIssueReceivedAt1803000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE issues ADD COLUMN IF NOT EXISTS received_at timestamptz NULL`,
        );

        // 1) first move into the receiving status (old + new names)
        await queryRunner.query(`
            UPDATE issues i
            SET received_at = sub.first_at
            FROM (
                SELECT DISTINCT ON (entity_id) entity_id, created_at AS first_at
                FROM activity_logs
                WHERE action = 'card.moved'
                  AND detail::json->>'to' IN ('รอดำเนินการ', 'Todo', 'To Do')
                ORDER BY entity_id, created_at ASC, id ASC
            ) sub
            WHERE i.id = sub.entity_id
              AND i.received_at IS NULL
        `);

        // 2) already past that status without a logged move → created_at
        await queryRunner.query(`
            UPDATE issues i
            SET received_at = i.created_at
            WHERE i.received_at IS NULL
              AND COALESCE(
                    (SELECT s.position FROM issue_statuses s WHERE s.id = i.status_id),
                    0
                  ) >= 2
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS received_at`);
    }
}
