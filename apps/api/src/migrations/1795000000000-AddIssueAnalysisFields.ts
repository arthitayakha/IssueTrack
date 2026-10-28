import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIssueAnalysisFields1795000000000 implements MigrationInterface {
    name = "AddIssueAnalysisFields1795000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS analysis_cause text`);
        await queryRunner.query(`ALTER TABLE issues ADD COLUMN IF NOT EXISTS resolution text`);
        await queryRunner.query(
            `ALTER TABLE issues ADD COLUMN IF NOT EXISTS is_analysis_open boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS is_analysis_open`);
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS resolution`);
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS analysis_cause`);
    }
}
