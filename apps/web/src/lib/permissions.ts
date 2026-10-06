"use client";

import { useAuthStore } from "@/lib/auth-store";
import {
  permissionsForRole,
  roleHasPermission,
  ROLE_LABELS,
} from "@kanban/shared";
import type { Permission } from "@kanban/shared";

export function roleLabel(name: string | null | undefined): string {
  if (!name) return "—";
  return ROLE_LABELS[name] ?? name;
}

export function usePermissions() {
  const roleName = useAuthStore((s) => s.user?.roleName ?? "customer");

  return {
    roleName,
    permissions: permissionsForRole(roleName),
    can: (permission: Permission) => roleHasPermission(roleName, permission),
  };
}
