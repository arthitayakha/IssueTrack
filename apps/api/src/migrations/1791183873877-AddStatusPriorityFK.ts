import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStatusPriorityFK1791183873877 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues ADD COLUMN status_id int`);
        await queryRunner.query(`ALTER TABLE issues ADD COLUMN priority_id int`);

        await queryRunner.query(`
            UPDATE issues SET status_id = (
                SELECT id FROM issue_statuses WHERE code = issues.status
            )
        `);
        await queryRunner.query(`
            UPDATE issues SET priority_id = (
                SELECT id FROM issue_priorities WHERE code = UPPER(issues.priority)
            ) WHERE issues.priority IS NOT NULL
        `);

        await queryRunner.query(`ALTER TABLE issues ALTER COLUMN status_id SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE issues ADD CONSTRAINT fk_issue_status FOREIGN KEY (status_id) REFERENCES issue_statuses(id)`);
        await queryRunner.query(`ALTER TABLE issues ADD CONSTRAINT fk_issue_priority FOREIGN KEY (priority_id) REFERENCES issue_priorities(id)`);

        await queryRunner.query(`ALTER TABLE issues DROP COLUMN status`);
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN priority`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE issues ADD COLUMN status character varying(30)`);
        await queryRunner.query(`ALTER TABLE issues ADD COLUMN priority character varying(30)`);

        await queryRunner.query(`
            UPDATE issues SET status = (
                SELECT code FROM issue_statuses WHERE id = issues.status_id
            )
        `);
        await queryRunner.query(`
            UPDATE issues SET priority = (
                SELECT INITCAP(code) FROM issue_priorities WHERE id = issues.priority_id
            ) WHERE issues.priority_id IS NOT NULL
        `);

        await queryRunner.query(`ALTER TABLE issues DROP CONSTRAINT fk_issue_priority`);
        await queryRunner.query(`ALTER TABLE issues DROP CONSTRAINT fk_issue_status`);
        await queryRunner.query(`ALTER TABLE issues ALTER COLUMN status_id DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN priority_id`);
        await queryRunner.query(`ALTER TABLE issues DROP COLUMN status_id`);
    }

}
