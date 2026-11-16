"use client";

import type {
  DashboardPeriod,
  DashboardRange,
  DashboardScope,
  DashboardSummary,
  DashboardTrendIssue,
} from "@kanban/shared";
import { apiFetch } from "./api";
import { getToken } from "./board-api";

/** Which dimension a donut slice was cut from (usage card tabs + the status ring). */
export type DashboardDim = "app" | "category" | "status";

/**
 * Dashboard data layer — the `/` page's single round trip.
 *
 *   GET /dashboard/summary?scope=...&period=...&from=...&to=...&statusId=...&companyIds=...
 *
 * The server returns aggregates only (counts / trend buckets / workload) and
 * downgrades `scope=all` to `own` when the caller lacks
 * `dashboard.overview.view` — always read the echoed `summary.scope`, not the
 * requested one. `from`/`to` (yyyy-mm-dd) is the custom trend window; the
 * echoed `summary.from/to` says what the server actually applied.
 *
 * `statusId` is the status cross-filter set by clicking the status ring: it
 * narrows every aggregate except the ring's context pair (`statuses` +
 * `total`), and the echoed `summary.statusId` is what the server really used.
 *
 * `companyIds` is the company filter (comma list → `companyIds=1,2`). Unlike
 * `statusId` it is a DATA SCOPE: it narrows everything including `statuses`
 * + `total`, following the same reporter-company rule as the board and the
 * reports page. Echoed back as `summary.companyIds`.
 */
export async function fetchDashboardSummary(
  scope: DashboardScope,
  period: DashboardPeriod,
  range: DashboardRange = {},
  statusId?: number | null,
  companyIds?: number[],
): Promise<DashboardSummary> {
  const params = new URLSearchParams({ scope, period });
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  if (statusId != null) params.set("statusId", String(statusId));
  if (companyIds && companyIds.length > 0) params.set("companyIds", companyIds.join(","));
  return apiFetch<DashboardSummary>(`/dashboard/summary?${params}`, {}, getToken());
}

/**
 * The issues behind one trend bar:
 *
 *   GET /dashboard/trend-issues?bucket=yyyy-mm-dd&period=...&scope=...&statusId=...&companyIds=...
 *
 * Same scope + the same Bangkok `date_trunc` as the count on the bar, so the
 * list always matches the number (capped server-side at 200 rows). `statusId`
 * and `companyIds` keep it matching while the page is filtered.
 */
export async function fetchTrendIssues(input: {
  bucket: string;
  period: DashboardPeriod;
  scope: DashboardScope;
  statusId?: number | null;
  companyIds?: number[];
}): Promise<DashboardTrendIssue[]> {
  const params = new URLSearchParams({
    bucket: input.bucket,
    period: input.period,
    scope: input.scope,
  });
  if (input.statusId != null) params.set("statusId", String(input.statusId));
  if (input.companyIds?.length) params.set("companyIds", input.companyIds.join(","));
  return apiFetch<DashboardTrendIssue[]>(`/dashboard/trend-issues?${params}`, {}, getToken());
}

/**
 * The issues behind one donut slice:
 *
 *   GET /dashboard/dimension-issues?dim=category&id=<id>&app=<id>&scope=...&statusId=...&companyIds=...
 *
 * `app` narrows the list to one app's worth of rows, so the list adds up to
 * the number printed on that slice (capped at 200 rows). `statusId` rides along
 * for the same reason — except when `dim` is itself the status filter, where it
 * would only ever restate the same constraint — and `companyIds` rides along
 * always, so the list keeps matching the filtered slice it came from.
 */
export async function fetchDimensionIssues(input: {
  dim: DashboardDim;
  /** The slice's row id, or "none" for the no-app / no-category slice. */
  id: number | "none";
  app?: number;
  scope: DashboardScope;
  statusId?: number | null;
  companyIds?: number[];
}): Promise<DashboardTrendIssue[]> {
  const params = new URLSearchParams({
    dim: input.dim,
    id: String(input.id),
    scope: input.scope,
  });
  if (input.app != null) params.set("app", String(input.app));
  if (input.statusId != null && input.dim !== "status") {
    params.set("statusId", String(input.statusId));
  }
  if (input.companyIds?.length) params.set("companyIds", input.companyIds.join(","));
  return apiFetch<DashboardTrendIssue[]>(`/dashboard/dimension-issues?${params}`, {}, getToken());
}
