"use client";

import { useEffect, useCallback } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { apiFetch } from "@/lib/api";
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
  const permissions = useAuthStore((s) => s.permissions);
  const token = useAuthStore((s) => s.token);
  const setPermissions = useAuthStore((s) => s.setPermissions);

  useEffect(() => {
    if (!token || permissions != null) return;
    apiFetch<string[]>("/permissions/my", {}, token)
      .then(setPermissions)
      .catch(() => {});
  }, [token, permissions, setPermissions]);

  useEffect(() => {
    if (!token) return;
    apiFetch<string[]>("/permissions/my", {}, token)
      .then(setPermissions)
      .catch(() => {});
  }, [token, setPermissions]);

  useEffect(() => {
    if (!token) return;
    const handleFocus = () => {
      apiFetch<string[]>("/permissions/my", {}, token)
        .then(setPermissions)
        .catch(() => {});
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [token, setPermissions]);

  const can = useCallback(
    (permission: Permission) => {
      if (permissions != null) return permissions.includes(permission);
      return roleHasPermission(roleName, permission);
    },
    [permissions, roleName],
  );

  return {
    roleName,
    permissions: permissions ?? permissionsForRole(roleName),
    can,
  };
}
