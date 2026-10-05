"use client";

import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: number | null;
  roleName: string | null;
}

const AUTH_KEY = "kanban-auth";

interface PersistedSession {
  token: string | null;
  user: AuthUser | null;
}

function loadSession(): PersistedSession {
  try {
    const raw =
      sessionStorage.getItem(AUTH_KEY) ?? localStorage.getItem(AUTH_KEY);
    if (!raw) return { token: null, user: null };
    const parsed = JSON.parse(raw) as Partial<PersistedSession>;
    return { token: parsed.token ?? null, user: parsed.user ?? null };
  } catch {
    return { token: null, user: null };
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
  setSession: (token: string, user: AuthUser, rememberMe: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  ...loadSession(),
  setSession: (token, user, rememberMe) => {
    persistSession({ token, user }, rememberMe);
    set({ token, user });
  },
  logout: () => {
    clearPersistedSession();
    set({ token: null, user: null });
  },
}));
