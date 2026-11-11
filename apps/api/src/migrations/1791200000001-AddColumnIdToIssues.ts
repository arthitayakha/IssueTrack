import { MigrationInterface, QueryRunner } from "typeorm";

export class AddColumnIdToIssues1791200000001 implements MigrationInterface {

    /**
     * Intentionally empty — this used to add `issues.column_id INTEGER REFERENCES
     * board_columns(id)`. The column belonged to the legacy `board_columns` table that
     * 1826000000000-DropBoardColumnsAndIssueColumnId removes, so re-adding it here would
     * fail on a fresh DB (no such table) and be dropped straight after everywhere else.
     * TypeORM records migrations by name/timestamp only (no checksum), so neutralizing
     * an already-applied file is safe.
     */
    public async up(): Promise<void> {}

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS column_id`);
    }

}
