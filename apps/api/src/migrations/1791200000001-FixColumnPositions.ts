import { MigrationInterface } from "typeorm";

export class FixColumnPositions1791200000001 implements MigrationInterface {

    /**
     * Intentionally empty — every statement that used to live here fixed positions
     * inside the legacy `board_columns` table, which no longer exists (dropped by
     * 1826000000000-DropBoardColumnsAndIssueColumnId). Neutralizing the body keeps
     * `migration:run` from failing on a DB without that table. TypeORM records
     * migrations by name/timestamp only (no checksum), so editing an already-applied
     * file is safe.
     */
    public async up(): Promise<void> {}

    public async down(): Promise<void> {
        // nothing was created in up()
    }
}
