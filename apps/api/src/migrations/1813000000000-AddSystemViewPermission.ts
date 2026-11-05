import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `system.view` — "ดูข้อมูลระบบ": the gate for the `/systems` page.
 *
 * Before this, `/systems` was gated by `app.view` ("จัดการแอป"), which made the
 * page impossible to grant independently of the apps tab in `/master-data`.
 * The permission row + an admin grant follow the `1807-AddCompaniesTable`
 * pattern; the `position_permissions` backfill keeps every position that could
 * already open `/systems` (it had `app.view`) from losing access on upgrade.
 */
export class AddSystemViewPermission1813000000000 implements MigrationInterface {
    name = "AddSystemViewPermission1813000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO permissions (code, action, category) VALUES
                ('system.view', 'system.view', 'system')
             ON CONFLICT (code) DO NOTHING`,
        );
        await queryRunner.query(
            `INSERT INTO role_permissions (role_id, permission)
             SELECT r.id, 'system.view'
             FROM roles r
             WHERE r.name = 'admin'
             ON CONFLICT (role_id, permission) DO NOTHING`,
        );
        // Backfill: a position that could open /systems before (it had app.view)
        // keeps access — unticking is now the admin's explicit choice.
        await queryRunner.query(
            `INSERT INTO position_permissions (position_id, permission, denied)
             SELECT pp.position_id, 'system.view', false
             FROM position_permissions pp
             WHERE pp.permission = 'app.view'
               AND NOT EXISTS (
                 SELECT 1 FROM position_permissions x
                 WHERE x.position_id = pp.position_id
                   AND x.permission = 'system.view'
               )`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DELETE FROM position_permissions WHERE permission = 'system.view'`,
        );
        await queryRunner.query(
            `DELETE FROM role_permissions WHERE permission = 'system.view'`,
        );
        await queryRunner.query(
            `DELETE FROM permissions WHERE code = 'system.view'`,
        );
    }
}
