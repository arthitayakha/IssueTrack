import { MigrationInterface, QueryRunner } from "typeorm";

export class FixColumnPositions1791200000001 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DELETE FROM board_columns
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM board_columns
                GROUP BY LOWER(status)
            )
        `);

        await queryRunner.query(`UPDATE board_columns SET position = 1 WHERE LOWER(status) = 'backlog'`);
        await queryRunner.query(`UPDATE board_columns SET position = 2 WHERE LOWER(status) = 'todo'`);
        await queryRunner.query(`UPDATE board_columns SET position = 3 WHERE LOWER(status) = 'doing'`);
        await queryRunner.query(`UPDATE board_columns SET position = 4 WHERE LOWER(status) = 'review'`);
        await queryRunner.query(`UPDATE board_columns SET position = 5 WHERE LOWER(status) = 'done'`);

        await queryRunner.query(`
            INSERT INTO board_columns (status, custom_name, is_hidden, position)
            SELECT 'Review', NULL, false, 4
            WHERE NOT EXISTS (
                SELECT 1 FROM board_columns WHERE LOWER(status) = 'review'
            )
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_board_columns_status_unique
            ON board_columns (LOWER(status))
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_board_columns_status_unique`);
    }
}
