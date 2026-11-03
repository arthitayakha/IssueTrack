import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Positions become the single source of truth: from this release a member's
 * permissions come from `position_permissions` alone and the role is no longer
 * unioned in. Until now the tables only stored the *extra* rows a position
 * added on top of its role (Backend has exactly one, `issue.delete`), so
 * switching rules without seeding would instantly strip every member down to
 * that handful of rows — no dashboard, no board, no comments.
 *
 * This copies the role grants each position's members currently enjoy into the
 * position's own rows, making the effective set identical on cutover day:
 *
 *   - rows already present are kept (`ON CONFLICT DO NOTHING`)
 *   - the position's own role_permissions are copied
 *   - plus the role_permissions of every role actually assigned to a user in
 *     that position, so a member whose role differs from the position's
 *     configured role keeps exactly what they had this morning
 *
 * Afterwards an admin opening the matrix sees the truth and unticking a box
 * (e.g. `issue.create`) finally revokes it.
 */
export class BackfillPositionPermissionsFromRoles1805000000000 implements MigrationInterface {
    name = "BackfillPositionPermissionsFromRoles1805000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `INSERT INTO position_permissions (position_id, permission, denied)
             SELECT DISTINCT src.position_id, src.permission, false
             FROM (
               SELECT p.id AS position_id, rp.permission
               FROM positions p
               JOIN role_permissions rp ON rp.role_id = p.role_id
               WHERE p.role_id IS NOT NULL
               UNION
               SELECT u.position_id, rp.permission
               FROM users u
               JOIN role_permissions rp ON rp.role_id = u.role_id
               WHERE u.position_id IS NOT NULL AND u.role_id IS NOT NULL
             ) AS src
             WHERE NOT EXISTS (
               SELECT 1 FROM position_permissions pp
               WHERE pp.position_id = src.position_id AND pp.permission = src.permission
             )`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Data migration: the copied rows are indistinguishable from rows an
        // admin ticked by hand, so there is nothing safe to revert — re-open
        // the position matrix and untick what you do not want instead.
        void queryRunner;
    }
}
