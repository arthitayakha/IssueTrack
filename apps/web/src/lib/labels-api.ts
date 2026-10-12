"use client";

import { PaginatedResponse } from "@kanban/shared";
import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";

export interface Label {
  id: number;
  name: string;
  color: string;
  isActive: boolean;
  issueCount: number;
}

function getToken(): string | null {
  return useAuthStore.getState().token;
}

export async function fetchLabels(page = 1, limit = 100): Promise<PaginatedResponse<Label>> {
  return apiFetch<PaginatedResponse<Label>>(`/labels?page=${page}&limit=${limit}`, {}, getToken());
}

export async function createLabel(data: { name: string; color: string }): Promise<Label> {
  return apiFetch<Label>("/labels", {
    method: "POST",
    body: JSON.stringify(data),
  }, getToken());
}

export async function updateLabel(
  id: number,
  data: { name?: string; color?: string },
): Promise<Label> {
  return apiFetch<Label>(`/labels/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }, getToken());
}

export async function toggleLabelActive(id: number, isActive: boolean): Promise<{ id: number; name: string; isActive: boolean }> {
  return apiFetch<{ id: number; name: string; isActive: boolean }>(`/labels/${id}/active`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  }, getToken());
}

export async function checkLabel(id: number): Promise<{ canDelete: boolean; issueCount: number }> {
  return apiFetch<{ canDelete: boolean; issueCount: number }>(`/labels/${id}/check`, {}, getToken());
}

export async function deleteLabel(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/labels/${id}`, {
    method: "DELETE",
  }, getToken());
}
