"use client";

import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";
import type { ActivityActorDto, ActivityLogDto, ActivityLogType } from "@kanban/shared";

/** Same envelope the rest of the app paginates with. */
export interface PaginatedLogs {
  data: ActivityLogDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Everything the /logs page can narrow the feed by. */
export interface LogFilters {
  actorId?: number;
  /** Missing/unknown means every group. */
  type?: ActivityLogType | "";
  search?: string;
  /** yyyy-mm-dd, inclusive. */
  from?: string;
  to?: string;
}

export function getToken(): string | null {
  return useAuthStore.getState().token;
}

function toQuery(filters: LogFilters, page?: number, limit?: number): string {
  const params = new URLSearchParams();
  if (filters.actorId != null) params.set("actorId", String(filters.actorId));
  if (filters.type) params.set("type", filters.type);
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.from) params.set("createdFrom", filters.from);
  if (filters.to) params.set("createdTo", filters.to);
  if (page != null) params.set("page", String(page));
  if (limit != null) params.set("limit", String(limit));
  return params.toString();
}

export async function fetchActivityLogs(
  filters: LogFilters,
  page: number,
  limit: number,
): Promise<PaginatedLogs> {
  const query = toQuery(filters, page, limit);
  return apiFetch<PaginatedLogs>(`/activity-logs${query ? `?${query}` : ""}`, {}, getToken());
}

/** Distinct actors for the filter dropdown — needs `log.view`, not `user.view`. */
export async function fetchLogActors(): Promise<ActivityActorDto[]> {
  return apiFetch<ActivityActorDto[]>("/activity-logs/actors", {}, getToken());
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

// The CSV must not stop at the page on screen — page through the filtered
// feed like the reports export does (same cap: 100 rows × 50 pages).
const EXPORT_PAGE_LIMIT = 100;
const EXPORT_MAX_PAGES = 50;

/** Every row matching the current filters, up to the export cap. */
export async function fetchAllLogRows(filters: LogFilters): Promise<ActivityLogDto[]> {
  const all: ActivityLogDto[] = [];
  for (let page = 1; page <= EXPORT_MAX_PAGES; page++) {
    const res = await fetchActivityLogs(filters, page, EXPORT_PAGE_LIMIT);
    all.push(...res.data);
    if (page >= res.totalPages) break;
  }
  return all;
}
