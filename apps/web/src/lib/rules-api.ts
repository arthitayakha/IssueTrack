"use client";

import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";
import type { RuleActivityDto, RuleDto } from "@kanban/shared";

export interface ListRulesOptions {
  category?: string;
  actionKey?: string;
  isActive?: boolean;
}

/** Everything the wizard sends when creating or updating a rule. */
export interface RulePayload {
  name: string;
  triggerKey: string;
  templateKey: string | null;
  category: string;
  actionKey: string;
  actionConfig: Record<string, string>;
  conditions: Array<{ field: string; operator: string; value: string; position?: number }>;
  isActive: boolean;
  stopOnError: boolean;
}

export function getToken(): string | null {
  return useAuthStore.getState().token;
}

export async function fetchRules(): Promise<RuleDto[]> {
  return apiFetch<RuleDto[]>("/rules", {}, getToken());
}

export async function fetchRule(id: number | string): Promise<RuleDto> {
  return apiFetch<RuleDto>(`/rules/${id}`, {}, getToken());
}

export async function createRule(payload: RulePayload): Promise<RuleDto> {
  return apiFetch<RuleDto>("/rules", {
    method: "POST",
    body: JSON.stringify(payload),
  }, getToken());
}

export async function updateRule(id: number | string, payload: RulePayload): Promise<RuleDto> {
  return apiFetch<RuleDto>(`/rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }, getToken());
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

export interface PaginatedActivity {
  data: RuleActivityDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Audit trail — who created/edited/deleted rules (GET /rules/activity). */
export async function fetchRuleActivity(
  options: { ruleId?: number; page?: number; limit?: number } = {},
): Promise<PaginatedActivity> {
  const params = new URLSearchParams();
  if (options.ruleId != null) params.set("ruleId", String(options.ruleId));
  if (options.page != null) params.set("page", String(options.page));
  if (options.limit != null) params.set("limit", String(options.limit));
  const query = params.toString();
  return apiFetch<PaginatedActivity>(`/rules/activity${query ? `?${query}` : ""}`, {}, getToken());
}
