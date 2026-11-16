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

/**
 * ป้ายเมนู/หัวข้อของหน้า `/boards` (`Nav.boards`) เฉพาะผู้ใช้บทบาทลูกค้า:
 * หน้าเดิม เส้นทางเดิม แต่คำเปลี่ยนเป็น **"ประวัติการแจ้งปัญหา"** (`reportHistory`)
 * เพราะลูกค้าเห็นเฉพาะงานที่ตัวเองแจ้ง (ตารางถูกบังคับ) — สตาฟฟ์เห็น "บอร์ด" เหมือนเดิม
 *
 * อยู่รวมกันที่นี่ที่เดียวเพื่อให้ sidebar (`sidebar.tsx`) กับหัวข้อใน navbar
 * (`navbar.tsx`) เลือกคำเดียวกันเป๊ะ — สองจุดนี้คือที่เดียวที่คำว่า "บอร์ด"
 * โชว์ให้ลูกค้าเห็น (breadcrumb รากของ folder view กับปุ่มสลับมุมมอง
 * ลูกค้าเข้าไม่ถึงอยู่แล้ว)
 */
export function boardsNavKey(roleName: string | null | undefined): "boards" | "reportHistory" {
  return roleName === "customer" ? "reportHistory" : "boards";
}

/* ------------------------------------------------------------------ */
/* One `/permissions/my` request per page load, shared by every caller  */
/* ------------------------------------------------------------------ */

/** The request currently in flight — concurrent hook instances await this. */
let inflight: Promise<string[]> | null = null;

/** Has this page load already refreshed the permissions once? */
let refreshedThisLoad = false;

/** One focus listener for the whole app, throttled to once per window. */
let focusBound = false;
let lastFocusAt = 0;
const FOCUS_THROTTLE_MS = 60_000;

/**
 * Single-flight fetch: the first caller starts it, everyone else (more hook
 * instances, StrictMode's second effect pass) gets the same promise, and the
 * slot frees on settle so a failure can be retried.
 */
function loadPermissions(token: string): Promise<string[]> {
  if (!inflight) {
    inflight = apiFetch<string[]>("/permissions/my", {}, token).finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export function usePermissions() {
  const roleName = useAuthStore((s) => s.user?.roleName ?? "customer");
  const permissions = useAuthStore((s) => s.permissions);
  const token = useAuthStore((s) => s.token);
  const setPermissions = useAuthStore((s) => s.setPermissions);
  const positionId = useAuthStore((s) => s.user?.positionId ?? null);
  const positionPermissions = useAuthStore((s) => s.user?.positionPermissions);

  /**
   * Refresh exactly once per page load: the first mount that gets here does
   * the call, later mounts (and route changes — permissions already sit in
   * the store) return early. A fresh login arrives with `permissions == null`
   * and fetches again; a failure clears the flag so the next mount retries.
   */
  useEffect(() => {
    if (!token) return;
    if (permissions != null && refreshedThisLoad) return;
    refreshedThisLoad = true;
    loadPermissions(token)
      .then((list) => {
        // the session may have been swapped out mid-flight (logout/relogin)
        if (useAuthStore.getState().token === token) setPermissions(list);
      })
      .catch(() => {
        refreshedThisLoad = false;
      });
  }, [token, permissions, setPermissions]);

  /**
   * The tab coming back picks up permission changes made elsewhere — one
   * listener for the whole app (a module flag keeps StrictMode/re-renders
   * from binding it twice) and at most one request per throttle window.
   */
  useEffect(() => {
    if (!token || focusBound) return;
    focusBound = true;
    lastFocusAt = Date.now();
    const handleFocus = () => {
      const now = Date.now();
      if (now - lastFocusAt < FOCUS_THROTTLE_MS) return;
      const current = useAuthStore.getState();
      if (!current.token) return;
      lastFocusAt = now;
      loadPermissions(current.token)
        .then((list) => current.setPermissions(list))
        .catch(() => undefined);
    };
    window.addEventListener("focus", handleFocus);
    // bound at module level on purpose — it outlives this component
  }, [token]);

  /**
   * Until `/permissions/my` answers, fall back to whatever the login payload
   * carried: a member with a position must NOT fall back to their role — the
   * role would briefly show menus (e.g. "แจ้งปัญหา") the position revoked.
   * People without a position still fall back to the role defaults.
   */
  const fallback = positionId ? positionPermissions ?? [] : permissionsForRole(roleName);

  const can = useCallback(
    (permission: Permission) => {
      if (permissions != null) return permissions.includes(permission);
      if (positionId) return (positionPermissions ?? []).includes(permission);
      return roleHasPermission(roleName, permission);
    },
    [permissions, roleName, positionId, positionPermissions],
  );

  return {
    roleName,
    permissions: permissions ?? fallback,
    can,
  };
}
