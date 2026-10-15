"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions } from "@/lib/permissions";
import { useRouter, usePathname } from "@/i18n/navigation";
import { Box, CircularProgress } from "@mui/material";
import type { Permission } from "@kanban/shared";

interface RequirePermissionProps {
  children: ReactNode;
  permission?: Permission;
  permissions?: Permission[];
  requireAll?: boolean;
}

export default function RequirePermission({
  children,
  permission,
  permissions,
  requireAll = false,
}: RequirePermissionProps) {
  const token = useAuthStore((s) => s.token);
  const { can } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasPermissionToCheck = Boolean(permission) || Boolean(permissions && permissions.length > 0);
  const permissionGranted = permission
    ? can(permission)
    : permissions && permissions.length > 0
      ? requireAll
        ? permissions.every((p) => can(p))
        : permissions.some((p) => can(p))
      : true;

  useEffect(() => {
    if (!mounted) return;

    if (!token) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (hasPermissionToCheck && !permissionGranted) {
      router.replace("/");
    }
  }, [mounted, token, hasPermissionToCheck, permissionGranted, router, pathname]);

  useEffect(() => {
    if (mounted && token && pathname === "/login") {
      router.replace("/");
    }
  }, [mounted, token, router, pathname]);

  if (!mounted || !token) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (permission && !can(permission)) {
    return null;
  }

  if (permissions && permissions.length > 0) {
    const hasPermission = requireAll
      ? permissions.every((p) => can(p))
      : permissions.some((p) => can(p));
    if (!hasPermission) {
      return null;
    }
  }

  return <>{children}</>;
}
