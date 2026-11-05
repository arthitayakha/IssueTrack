import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "../modules/auth/roles.guard";
import { PERMISSIONS_KEY } from "../modules/auth/permissions.decorator";
import { IS_PUBLIC_KEY } from "../modules/auth/public.decorator";
import type { Permission } from "@kanban/shared";

/**
 * `RolesGuard` grants on **any one** of the permissions in `@Permissions(...)`
 * (OR), which is what lets one endpoint serve two pages with separate
 * permission cards — `POST /apps` is `app.create` (apps tab in /master-data)
 * *or* `system.create` (/systems). Every route that lists a single permission
 * behaves exactly as before; these tests pin that down too.
 *
 * Stubbed reflector + service only — safe to run while `npm run dev` is up.
 */

function makeGuard(opts: {
  required?: Permission[];
  isPublic?: boolean;
  granted?: Permission[];
  user?: { roleId: number; positionId: number | null } | null;
}) {
  const { required, isPublic = false, granted = [], user = { roleId: 2, positionId: 1 } } = opts;

  const reflector = {
    getAllAndOverride: jest.fn((key: string) =>
      key === IS_PUBLIC_KEY ? isPublic : (required ?? null),
    ),
  };

  const hasPermission = jest.fn(
    async (_roleId: number, permission: Permission) => granted.includes(permission),
  );

  const guard = new RolesGuard(
    reflector as unknown as Reflector,
    { hasPermission } as never,
  );

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;

  return { guard, context, reflector, hasPermission };
}

describe("RolesGuard — multiple permissions are OR", () => {
  it("allows when the second listed permission is granted", async () => {
    const { guard, context, hasPermission } = makeGuard({
      required: ["app.update", "system.update"],
      granted: ["system.update"],
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermission).toHaveBeenCalledWith(2, "system.update", 1);
  });

  it("allows when the first listed permission is granted, without asking for the rest", async () => {
    const { guard, context, hasPermission } = makeGuard({
      required: ["app.delete", "system.delete"],
      granted: ["app.delete"],
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermission).toHaveBeenCalledTimes(1);
  });

  it("denies when none of the listed permissions is granted", async () => {
    const { guard, context } = makeGuard({
      required: ["app.create", "system.create"],
      granted: ["board.view"],
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("keeps the single-permission contract (grant → allow, missing → 403)", async () => {
    const allowed = makeGuard({ required: ["issue.create"], granted: ["issue.create"] });
    await expect(allowed.guard.canActivate(allowed.context)).resolves.toBe(true);

    const denied = makeGuard({ required: ["issue.create"], granted: [] });
    await expect(denied.guard.canActivate(denied.context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("passes a public route without consulting the service", async () => {
    const { guard, context, hasPermission } = makeGuard({
      required: ["app.create"],
      isPublic: true,
      granted: [],
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it("passes when the route declares no permissions", async () => {
    const { guard, context, hasPermission } = makeGuard({ required: undefined });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(hasPermission).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request before checking anything", async () => {
    const { guard, context, hasPermission } = makeGuard({
      required: ["app.update"],
      granted: ["app.update"],
      user: null,
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(hasPermission).not.toHaveBeenCalled();
  });
});

// Keeps the metadata key import honest — PERMISSIONS_KEY is what the
// reflector reads in the real app; referencing it here means a rename
// breaks this spec instead of silently stubbing the wrong key.
it("reads route metadata under PERMISSIONS_KEY", () => {
  expect(PERMISSIONS_KEY).toBe("permissions");
});
