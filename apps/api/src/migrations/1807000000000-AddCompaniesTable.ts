import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * บริษัท — a standalone master table (name + visibility), the same shape as
 * `apps` minus any link to issues: no `issues.company_id`, so a row can always
 * be deleted and the API needs no `/check` endpoint.
 *
 * Registers the `company.*` permission codes too — the permission matrix
 * reads `permissions`, and `PermissionsService` only ever grants codes that
 * exist there. Default grant: admin only (same deal as `app.*` in the raw
 * 0029 migration); admins can tick them for other roles/positions later.
 *
 * Idempotent on purpose — `ON CONFLICT ... DO NOTHING` everywhere.
 */
export class AddCompaniesTable1807000000000 implements MigrationInterface {
    name = "AddCompaniesTable1807000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS companies (
                id          SERIAL PRIMARY KEY,
                name        VARCHAR(100) NOT NULL UNIQUE,
                is_visible  BOOLEAN NOT NULL DEFAULT true,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )`,
        );
        await queryRunner.query(
            `INSERT INTO permissions (code, action, category) VALUES
                ('company.view',   'company.view',   'company'),
                ('company.create', 'company.create', 'company'),
                ('company.update', 'company.update', 'company'),
                ('company.delete', 'company.delete', 'company')
             ON CONFLICT (code) DO NOTHING`,
        );
        await queryRunner.query(
            `INSERT INTO role_permissions (role_id, permission)
             SELECT r.id, p.code
             FROM roles r
             JOIN permissions p
               ON p.code IN ('company.view', 'company.create', 'company.update', 'company.delete')
             WHERE r.name = 'admin'
             ON CONFLICT (role_id, permission) DO NOTHING`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DELETE FROM role_permissions
              WHERE permission IN ('company.view', 'company.create', 'company.update', 'company.delete')`,
        );
        await queryRunner.query(
            `DELETE FROM permissions
              WHERE code IN ('company.view', 'company.create', 'company.update', 'company.delete')`,
        );
        await queryRunner.query(`DROP TABLE IF EXISTS companies`);
    }
}
