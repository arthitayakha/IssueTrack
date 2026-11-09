import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `status.view` / `priority.view` / `label.view` revoked from the `customer`
 * and `programmer` roles.
 *
 * Those three codes are what the sidebar's "จัดการข้อมูลหลัก" item and the
 * `/master-data` page gate on (both are an ANY-of over the seven tab-view
 * permissions), so any role holding just one of them was walked into a
 * read-only master-data page. `customer` had all three by default and has no
 * position — `PermissionsService.hasPermission` falls back to `role_permissions`
 * for position-less users — which is exactly how a customer ended up seeing the
 * page.
 *
 * `programmer` is revoked too: the two real programmers both sit on the
 * `Frontend` position (whose whitelist already omits these codes), so the role
 * defaults only leaked for a programmer without a position. Note that a
 * position is a whitelist of its own — the `Backend` position still carries all
 * three and keeps showing the page to its members until an admin unticks them
 * in the position matrix (deliberately left alone here).
 *
 * Changing `ROLE_PERMISSIONS` in `packages/shared/src/permissions.ts` is the
 * other half of the fix: `PermissionsService.onModuleInit` backfills missing
 * rows from those defaults on every API boot (and the matrix's reset-to-defaults
 * button does the same), so deleting rows alone would be undone on restart.
 *
 * No API route loses anything: `GET /issue-statuses` and `GET /issue-priorities`
 * carry no `@Permissions` at all, and `GET /labels` is `@Public()` — the board's
 * card chips (they come from `issue.labels` in the issue payload), its label
 * filter and the add/edit-card label dropdown all keep working. The `/labels`
 * manager page stays behind `label.view` on the web side.
 */
export class RevokeStatusPriorityLabelViewForStaffRoles1817000000000
    implements MigrationInterface
{
    name = "RevokeStatusPriorityLabelViewForStaffRoles1817000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `DELETE FROM role_permissions rp
             USING roles r
             WHERE rp.role_id = r.id
               AND r.name IN ('customer', 'programmer')
               AND rp.permission IN ('status.view', 'priority.view', 'label.view')`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO role_permissions (role_id, permission)
             SELECT r.id, p.code
             FROM roles r
             CROSS JOIN (VALUES
                ('status.view'),
                ('priority.view'),
                ('label.view')
             ) AS p(code)
             WHERE r.name IN ('customer', 'programmer')
             ON CONFLICT (role_id, permission) DO NOTHING`,
        );
    }
}
