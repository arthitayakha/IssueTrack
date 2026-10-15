"use client";

import { create } from "zustand";

import { apiFetch } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: number | null;
  roleName: string | null;
  positionId?: number | null;
  positionPermissions?: string[];
}

const AUTH_KEY = "kanban-auth";

interface PersistedSession {
  token: string | null;
  user: AuthUser | null;
  permissions: string[] | null;
}

function loadSession(): PersistedSession {
  try {
    const raw =
      sessionStorage.getItem(AUTH_KEY) ?? localStorage.getItem(AUTH_KEY);
    if (!raw) return { token: null, user: null, permissions: null };
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    return {
      token: parsed.token ?? null,
      user: parsed.user ?? null,
      permissions: parsed.permissions ?? null,
    };
  } catch {
    return { token: null, user: null, permissions: null };
  }
}

function persistSession(session: PersistedSession, rememberMe: boolean) {
  const raw = JSON.stringify(session);
  if (rememberMe) {
    localStorage.setItem(AUTH_KEY, raw);
    sessionStorage.removeItem(AUTH_KEY);
  } else {
    sessionStorage.setItem(AUTH_KEY, raw);
    localStorage.removeItem(AUTH_KEY);
  }
}

function clearPersistedSession() {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  permissions: string[] | null;
  setSession: (token: string, user: AuthUser, rememberMe: boolean) => void;
  setPermissions: (permissions: string[]) => void;
  refreshPermissions: () => Promise<string[]>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  ...loadSession(),
  setSession: (token, user, rememberMe) => {
    persistSession({ token, user, permissions: null }, rememberMe);
    set({ token, user, permissions: null });
  },
  setPermissions: (permissions) => {
    const current = useAuthStore.getState();
    persistSession(
      { token: current.token, user: current.user, permissions },
      localStorage.getItem(AUTH_KEY) !== null,
    );
    set({ permissions });
  },
  refreshPermissions: async (): Promise<string[]> => {
    const current = useAuthStore.getState();
    if (!current.token) return [];
    const permissions = await apiFetch<string[]>("/permissions/my", {}, current.token);
    persistSession(
      { token: current.token, user: current.user, permissions },
      localStorage.getItem(AUTH_KEY) !== null,
    );
    set({ permissions });
    return permissions;
  },
  logout: () => {
    clearPersistedSession();
    set({ token: null, user: null, permissions: null });
  },
}));
