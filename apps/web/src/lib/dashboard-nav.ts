import type { DashboardPeriod } from "@kanban/shared";

/** One click's filter set — both destinations read the same param names. */
export type DrillParams = Record<
  string,
  string | number | readonly number[] | readonly string[] | null | undefined
>;

/**
 * Dashboard → /reports navigation.
 *
 * Every drill-down click on the dashboard navigates with the matching URL
 * filter instead of opening a dialog — the keys here are exactly the ones
 * `paramsToFilters()` reads in `reports/page.tsx` (and, via `boardsHref()`,
 * the board's own URL parser), so the filter panel shows the chip right away.
 *
 * Seats without `report.view` go to `/boards?view=table` with the same filter
 * instead — `RequirePermission` would bounce them straight back to `/`.
 */

/** `yyyy-mm-dd` → local Date at midnight; null when malformed. */
function parseYmd(value: string): Date | null {
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * A trend bucket (`yyyy-mm-dd` = bucket start, Bangkok) → the reports'
 * `from`/`to` window covering exactly that bar, mirroring the server's
 * `date_trunc`: day = the same day, week = +6 days (Mon–Sun), month = to the
 * month's last day, year = to 31 Dec.
 */
export function bucketToRange(
  bucket: string,
  period: DashboardPeriod,
): { from: string; to: string } {
  const start = parseYmd(bucket);
  if (!start) return { from: bucket, to: bucket };

  let end: Date;
  if (period === "day") end = start;
  else if (period === "week") {
    end = new Date(start);
    end.setDate(end.getDate() + 6);
  } else if (period === "month") {
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0); // last day
  } else {
    end = new Date(start.getFullYear(), 11, 31);
  }
  return { from: ymd(start), to: ymd(end) };
}

/**
 * `/reports?<qs>` from filter parts — empty/null values are dropped and
 * arrays are comma-joined, the same shape `paramsToFilters()` parses.
 */
export function reportsHref(params: DrillParams): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      q.set(key, value.join(","));
    } else {
      q.set(key, String(value));
    }
  }
  const qs = q.toString();
  return `/reports${qs ? `?${qs}` : ""}`;
}

/**
 * Dashboard → /boards fallback for seats without `report.view`.
 *
 * Same filter vocabulary as `/reports` (`paramsToFilters()` in the reports
 * page), so one `drillHref()` call works for both destinations. `view=table`
 * is forced: the drill list the popup used to show was a plain issue list, and
 * the board's table view is that list ("ประวัติการแจ้งปัญหา" for customers).
 * The board seeds its filter state from these params on mount.
 */
export function boardsHref(params: DrillParams): string {
  const q = new URLSearchParams();
  q.set("view", "table");
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    if (key === "view") continue; // forced above — never trust a caller's value
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      q.set(key, value.join(","));
    } else {
      q.set(key, String(value));
    }
  }
  return `/boards?${q.toString()}`;
}

/** The one entry point for every dashboard drill click. */
export function drillHref(canReport: boolean, params: DrillParams): string {
  return canReport ? reportsHref(params) : boardsHref(params);
}
