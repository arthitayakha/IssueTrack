"use client";

import type { DashboardPeriod, DashboardScope, DashboardSummary } from "@kanban/shared";
import { apiFetch } from "./api";
import { getToken } from "./board-api";

/**
 * Dashboard data layer — the `/` page's single round trip.
 *
 *   GET /dashboard/summary?scope=...&period=...
 *
 * The server returns aggregates only (counts / trend buckets / workload) and
 * downgrades `scope=all` to `own` when the caller lacks
 * `dashboard.overview.view` — always read the echoed `summary.scope`, not the
 * requested one.
 */
export async function fetchDashboardSummary(
  scope: DashboardScope,
  period: DashboardPeriod,
): Promise<DashboardSummary> {
  const params = new URLSearchParams({ scope, period });
  return apiFetch<DashboardSummary>(`/dashboard/summary?${params}`, {}, getToken());
}
