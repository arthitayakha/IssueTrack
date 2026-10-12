import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveBoardsAndAddTimeTracking1791200000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS board_id`);
        await queryRunner.query(`ALTER TABLE board_columns DROP COLUMN IF EXISTS board_id`);
        await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS color`);
        await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS sort_order`);
        await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS is_timer_running`);
        await queryRunner.query(`ALTER TABLE issue_statuses DROP COLUMN IF EXISTS is_end_status`);
        await queryRunner.query(`ALTER TABLE work_sessions ADD COLUMN started_at_new timestamptz`);
        await queryRunner.query(`UPDATE work_sessions SET started_at_new = started_at::text::timestamp`);
        await queryRunner.query(`ALTER TABLE work_sessions DROP COLUMN started_at`);
        await queryRunner.query(`ALTER TABLE work_sessions RENAME COLUMN started_at_new TO started_at`);
        await queryRunner.query(`ALTER TABLE work_sessions ADD COLUMN ended_at_new timestamptz`);
        await queryRunner.query(`UPDATE work_sessions SET ended_at_new = ended_at::text::timestamp`);
        await queryRunner.query(`ALTER TABLE work_sessions DROP COLUMN ended_at`);
        await queryRunner.query(`ALTER TABLE work_sessions RENAME COLUMN ended_at_new TO ended_at`);
        await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS estimate_duration int`);
        await queryRunner.query(`ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS fk_activity_logs_board`);
        await queryRunner.query(`DROP TABLE IF EXISTS boards`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE boards (
            id SERIAL PRIMARY KEY,
            name varchar(200) NOT NULL,
            status varchar(20) DEFAULT 'OPEN',
            created_by integer,
            created_at timestamp with time zone DEFAULT now(),
            updated_at timestamp with time zone DEFAULT now(),
            closed_at timestamp with time zone
        )`);
        await queryRunner.query(`ALTER TABLE issues ADD COLUMN board_id integer`);
        await queryRunner.query(`ALTER TABLE board_columns ADD COLUMN board_id integer`);
        await queryRunner.query(`ALTER TABLE issue_statuses ADD COLUMN color varchar(20)`);
        await queryRunner.query(`ALTER TABLE issue_statuses ADD COLUMN sort_order integer DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE issue_statuses ADD COLUMN is_timer_running boolean DEFAULT false`);
        await queryRunner.query(`ALTER TABLE issue_statuses ADD COLUMN is_end_status boolean DEFAULT false`);
        await queryRunner.query(`ALTER TABLE work_sessions ALTER COLUMN started_at TYPE time USING started_at::time`);
        await queryRunner.query(`ALTER TABLE work_sessions ALTER COLUMN ended_at TYPE time USING ended_at::time`);
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS estimate_duration`);
    }
}
