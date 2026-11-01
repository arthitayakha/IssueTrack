/**
 * Dashboard types — mirror of `apps/api/src/modules/dashboard/dashboard.service.ts`.
 *
 * The summary endpoint returns **aggregates only**: counts per dimension,
 * trend buckets, and the programmers' workload. No issue rows ever cross the
 * wire, so the payload stays tiny no matter how many cards exist.
 */

/** Data scope. The server may downgrade a requested "all" to "own". */
export type DashboardScope = "all" | "assigned" | "reported" | "own";

/** Trend granularity — also decides the server-side look-back window. */
export type DashboardPeriod = "day" | "week" | "month" | "year";

export const DASHBOARD_SCOPES: readonly DashboardScope[] = ["all", "assigned", "reported", "own"];
export const DASHBOARD_PERIODS: readonly DashboardPeriod[] = ["day", "week", "month", "year"];

/** A labeled count row (status / priority / app / category dimension). */
export interface DashboardCountRow {
  id: number | null;
  name: string | null;
  /** Board column color (`issue_statuses.color`) — statuses only. */
  color?: string | null;
  count: number;
}

/** One trend bucket — `bucket` is `yyyy-mm-dd` (bucket start, Bangkok time). */
export interface DashboardTrendRow {
  bucket: string;
  count: number;
}

/** One programmer's open load + banked timer hours (sorted by hours desc). */
export interface DashboardWorkloadRow {
  userId: number;
  name: string;
  openCount: number;
  hours: number;
}

/** GET /dashboard/summary response. */
export interface DashboardSummary {
  /** The scope actually applied (may be "own" after a server-side downgrade). */
  scope: DashboardScope;
  period: DashboardPeriod;
  total: number;
  /** Every board column, zero-filled, in column order. */
  statuses: DashboardCountRow[];
  /** May include an `id: null` group (ไม่ระบุ). */
  priorities: DashboardCountRow[];
  /** Only cards that carry an app, busiest first. */
  apps: DashboardCountRow[];
  /** Only cards that carry a category, busiest first. */
  categories: DashboardCountRow[];
  trend: DashboardTrendRow[];
  /** Overview readers only; empty for personal scopes. */
  workload: DashboardWorkloadRow[];
}
