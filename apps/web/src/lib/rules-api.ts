"use client";

import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";
import type { RuleDto } from "@kanban/shared";

export interface ListRulesOptions {
  category?: string;
  actionKey?: string;
  isActive?: boolean;
}

export function getToken(): string | null {
  return useAuthStore.getState().token;
}

export async function fetchRules(): Promise<RuleDto[]> {
  return apiFetch<RuleDto[]>("/rules", {}, getToken());
}

export async function toggleRule(id: number, isActive: boolean): Promise<RuleDto> {
  return apiFetch<RuleDto>(`/rules/${id}/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  }, getToken());
}

export async function deleteRule(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/rules/${id}`, {
    method: "DELETE",
  }, getToken());
}

export async function fetchRuleRuns(): Promise<unknown[]> {
  return apiFetch<unknown[]>("/rules/runs", {}, getToken());
}
