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

/**
 * One programmer's open load (sorted by open load desc). The position rides
 * along so the client can build its filter dropdown from this list alone —
 * no second request, no `position.view` needed.
 */
export interface DashboardWorkloadRow {
  userId: number;
  name: string;
  openCount: number;
  /** The programmer's `positions` row — null when they hold no position. */
  positionId: number | null;
  positionName: string | null;
}

/**
 * Custom trend window — both bounds are `yyyy-mm-dd` interpreted as Bangkok
 * days. Absent/partial bounds fall back to the period's look-back window
 * (the server echoes what it actually applied).
 */
export interface DashboardRange {
  from?: string;
  to?: string;
}

/** GET /dashboard/summary response. */
export interface DashboardSummary {
  /** The scope actually applied (may be "own" after a server-side downgrade). */
  scope: DashboardScope;
  period: DashboardPeriod;
  /** Echoed custom trend window (`null` when the period default is in use). */
  from: string | null;
  to: string | null;
  /**
   * Echoed status cross-filter — the aggregates were narrowed to this status
   * (`null` = no filter). `statuses` and `total` are exempt: they are the
   * ring's context pair, so the chart that sets the filter never changes its
   * own numbers.
   */
  statusId: number | null;
  /** Page-wide total — never narrowed by `statusId` (see above). */
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

/**
 * One card inside a clicked trend bucket — GET /dashboard/trend-issues — or
 * behind one donut slice — GET /dashboard/dimension-issues. Both endpoints
 * return this exact shape so the two drill-downs share one dialog.
 *
 * Only the rows of that one bucket/slice ever cross the wire (capped
 * server-side), so the list can be as long as the bar it came from and no
 * longer.
 */
export interface DashboardTrendIssue {
  id: number;
  issueNumber: string | null;
  title: string;
  /** ISO timestamp — the card's created_at. */
  createdAt: string;
  status: { id: number; name: string; color: string | null } | null;
  /** Priorities carry no color column — the client maps name → chip color. */
  priority: { id: number; name: string } | null;
  reporter: { id: number; name: string } | null;
  assignee: { id: number; name: string } | null;
}
