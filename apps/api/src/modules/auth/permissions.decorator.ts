import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@kanban/shared";

export const PERMISSIONS_KEY = "permissions";

/**
 * Route guard metadata — **multiple permissions are OR** (any one grants
 * access); a single permission is the normal case. See `RolesGuard`.
 */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
