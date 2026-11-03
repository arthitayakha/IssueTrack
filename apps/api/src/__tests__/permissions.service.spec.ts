import { PermissionsService } from "../modules/permissions/permissions.service";
import { ALL_PERMISSIONS } from "@kanban/shared";

/**
 * Positions are now the single source of truth: a member's permissions come
 * from `position_permissions` alone and the role is no longer unioned in —
 * that union was exactly why an unticked "แจ้งปัญหา" box did nothing (the
 * role kept granting `issue.create`). Role defaults only survive for people
 * who have no position, and admin keeps its always-allow short-circuit.
 *
 * Stubbed repositories only — safe to run while `npm run dev` is up.
 */

interface RoleRow {
  roleId: number;
  permission: string;
}
interface PositionRow {
  positionId: number;
  permission: string;
  denied?: boolean;
}

function makeService(opts: {
  rolePerms?: RoleRow[];
  positionPerms?: PositionRow[];
  adminRoleId?: number;
  roles?: Array<{ id: number; name: string; isActive?: boolean }>;
}) {
  const {
    rolePerms = [],
    positionPerms = [],
    adminRoleId = 1,
    roles = [
      { id: 1, name: "admin", isActive: true },
      { id: 2, name: "programmer", isActive: true },
      { id: 3, name: "customer", isActive: true },
    ],
  } = opts;

  const roleRepo = {
    find: jest.fn(async (q?: { where?: { roleId: number } }) =>
      q?.where?.roleId != null
        ? rolePerms.filter((r) => r.roleId === q.where!.roleId)
        : rolePerms,
    ),
    findOne: jest.fn(async (q?: { where?: { roleId: number; permission: string } }) =>
      q?.where
        ? rolePerms.find(
            (r) => r.roleId === q.where!.roleId && r.permission === q.where!.permission,
          ) ?? null
        : null,
    ),
  };

  const positionRepo = {
    find: jest.fn(async (q?: { where?: { positionId: number } }) =>
      q?.where?.positionId != null
        ? positionPerms.filter((r) => r.positionId === q.where!.positionId)
        : positionPerms,
    ),
    findOne: jest.fn(async (q?: { where?: { positionId: number; permission: string } }) =>
      q?.where
        ? positionPerms.find(
            (r) =>
              r.positionId === q.where!.positionId && r.permission === q.where!.permission,
          ) ?? null
        : null,
    ),
  };

  const rolesRepo = {
    findOne: jest.fn(async (q?: { where?: { id?: number; name?: string } }) => {
      if (!q?.where) return null;
      if (q.where.name) {
        return roles.find((r) => r.name === q.where!.name && r.id === adminRoleId) ?? null;
      }
      return roles.find((r) => r.id === q.where!.id) ?? null;
    }),
  };

  const service = new PermissionsService(
    roleRepo as never,
    positionRepo as never,
    rolesRepo as never,
  );
  return { service, roleRepo, positionRepo, rolesRepo };
}

const PROGRAMMER_ROLE = 2;
const FRONTEND = 1;

const roleRows = (permissions: string[], roleId = PROGRAMMER_ROLE): RoleRow[] =>
  permissions.map((permission) => ({ roleId, permission }));

describe("PermissionsService — position is authoritative", () => {
  describe("getUserPermissions", () => {
    it("returns only the position's rows for a member with a position", async () => {
      const { service } = makeService({
        rolePerms: roleRows(["issue.create", "board.view", "dashboard.own.view"]),
        positionPerms: [{ positionId: FRONTEND, permission: "board.view" }],
      });

      const perms = await service.getUserPermissions(PROGRAMMER_ROLE, FRONTEND);

      // issue.create comes from the role → must NOT leak in any more
      expect(perms).toEqual(["board.view"]);
    });

    it("drops rows flagged denied", async () => {
      const { service } = makeService({
        positionPerms: [
          { positionId: FRONTEND, permission: "board.view" },
          { positionId: FRONTEND, permission: "issue.create", denied: true },
        ],
      });

      const perms = await service.getUserPermissions(PROGRAMMER_ROLE, FRONTEND);

      expect(perms).toEqual(["board.view"]);
    });

    it("falls back to the role for a user without a position", async () => {
      const { service } = makeService({
        rolePerms: roleRows(["issue.create", "board.view"]),
      });

      const perms = await service.getUserPermissions(PROGRAMMER_ROLE, null);

      expect(perms).toEqual(["issue.create", "board.view"]);
    });

    it("gives admin every permission regardless of position", async () => {
      const { service } = makeService({
        positionPerms: [{ positionId: FRONTEND, permission: "board.view" }],
      });

      const perms = await service.getUserPermissions(1, FRONTEND);

      expect(perms).toEqual([...ALL_PERMISSIONS]);
    });

    it("returns nothing when there is no role at all", async () => {
      const { service } = makeService({});

      await expect(service.getUserPermissions(null, FRONTEND)).resolves.toEqual([]);
    });
  });

  describe("hasPermission", () => {
    it("grants a permission the position ticked", async () => {
      const { service } = makeService({
        positionPerms: [{ positionId: FRONTEND, permission: "issue.create" }],
      });

      await expect(
        service.hasPermission(PROGRAMMER_ROLE, "issue.create", FRONTEND),
      ).resolves.toBe(true);
    });

    it("revokes a permission only the role grants while a position exists", async () => {
      const { service } = makeService({
        rolePerms: roleRows(["issue.create"]),
        positionPerms: [{ positionId: FRONTEND, permission: "board.view" }],
      });

      await expect(
        service.hasPermission(PROGRAMMER_ROLE, "issue.create", FRONTEND),
      ).resolves.toBe(false);
    });

    it("honours an explicit denied row", async () => {
      const { service } = makeService({
        rolePerms: roleRows(["issue.create"]),
        positionPerms: [{ positionId: FRONTEND, permission: "issue.create", denied: true }],
      });

      await expect(
        service.hasPermission(PROGRAMMER_ROLE, "issue.create", FRONTEND),
      ).resolves.toBe(false);
    });

    it("still asks the role when the user has no position", async () => {
      const { service } = makeService({ rolePerms: roleRows(["issue.create"]) });

      await expect(service.hasPermission(PROGRAMMER_ROLE, "issue.create", null)).resolves.toBe(
        true,
      );
      await expect(service.hasPermission(PROGRAMMER_ROLE, "board.view", null)).resolves.toBe(
        false,
      );
    });

    it("always allows admin", async () => {
      const { service } = makeService({});

      await expect(service.hasPermission(1, "anything.at.all", null)).resolves.toBe(true);
    });

    it("denies a deactivated role even when its position grants it", async () => {
      const { service } = makeService({
        positionPerms: [{ positionId: FRONTEND, permission: "board.view" }],
        roles: [
          { id: 1, name: "admin", isActive: true },
          { id: 2, name: "programmer", isActive: false },
        ],
      });

      await expect(service.hasPermission(PROGRAMMER_ROLE, "board.view", FRONTEND)).resolves.toBe(
        false,
      );
    });
  });
});
