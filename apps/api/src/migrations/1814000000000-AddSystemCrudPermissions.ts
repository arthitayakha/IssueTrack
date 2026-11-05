import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `system.create` / `system.update` / `system.delete` — the rest of the
 * `/systems` page's own permission card (it already had `system.view` from
 * `1813000000000`). Before this, the page's add/edit/delete buttons read
 * `app.*`, so the dialog could only ever show a single "ดูข้อมูลระบบ" row
 * while the real buttons were controlled by a different card ("จัดการแอป").
 *
 * Same shape as `1813000000000`: permission rows + admin grants, then a
 * `position_permissions` backfill per matching `app.*` so a position that
 * could already edit apps on this page keeps doing so after the cutover.
 */
export class AddSystemCrudPermissions1814000000000 implements MigrationInterface {
    name = "AddSystemCrudPermissions1814000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO permissions (code, action, category) VALUES
                ('system.create', 'system.create', 'system'),
                ('system.update', 'system.update', 'system'),
                ('system.delete', 'system.delete', 'system')
             ON CONFLICT (code) DO NOTHING`,
        );
        await queryRunner.query(
            `INSERT INTO role_permissions (role_id, permission)
             SELECT r.id, p.code
             FROM roles r
             CROSS JOIN (VALUES
                ('system.create'),
                ('system.update'),
                ('system.delete')
             ) AS p(code)
             WHERE r.name = 'admin'
             ON CONFLICT (role_id, permission) DO NOTHING`,
        );
        // Backfill: whoever could do X to apps before keeps it on the
        // /systems page too — unticking is now the admin's explicit choice.
        await queryRunner.query(
            `INSERT INTO position_permissions (position_id, permission, denied)
             SELECT pp.position_id, 'system.' || split_part(pp.permission, '.', 2), false
             FROM position_permissions pp
             WHERE pp.permission IN ('app.create', 'app.update', 'app.delete')
               AND NOT EXISTS (
                 SELECT 1 FROM position_permissions x
                 WHERE x.position_id = pp.position_id
                   AND x.permission = 'system.' || split_part(pp.permission, '.', 2)
               )`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DELETE FROM position_permissions
             WHERE permission IN ('system.create', 'system.update', 'system.delete')`,
        );
        await queryRunner.query(
            `DELETE FROM role_permissions
             WHERE permission IN ('system.create', 'system.update', 'system.delete')`,
        );
        await queryRunner.query(
            `DELETE FROM permissions
             WHERE code IN ('system.create', 'system.update', 'system.delete')`,
        );
    }
}
