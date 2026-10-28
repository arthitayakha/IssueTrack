import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The unlock action was split in two: analysis/cause and resolution each get
 * their own flag so a rule can open them at different statuses.
 */
export class AddIssueResolutionOpenFlag1795000000001 implements MigrationInterface {
    name = "AddIssueResolutionOpenFlag1795000000001";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE issues ADD COLUMN IF NOT EXISTS is_resolution_open boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN IF EXISTS is_resolution_open`);
    }
}
