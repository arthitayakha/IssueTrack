import { MigrationInterface, QueryRunner } from "typeorm";

export class AddColumnIdToIssues1791200000001 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS column_id INTEGER REFERENCES board_columns(id)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS column_id`);
    }

}
