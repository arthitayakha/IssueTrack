import type { DashboardPeriod } from "@kanban/shared";

/**
 * Bucket labels for the trend chart and its drill-down dialog.
 *
 * Split into their own module so the two components can share them without
 * importing each other (chart → dialog → chart would be a cycle).
 */

const MONTHS_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Label for one `yyyy-mm-dd` bucket — the chart asks for short ticks
 * (28/9 · ก.ย. 26), the drill-down dialog asks for `full` (28/9/2026 · ก.ย. 2026)
 * so its title reads as a date, not a chart tick.
 */
export function formatBucketLabel(
  key: string,
  period: DashboardPeriod,
  locale: string,
  full = false,
): string {
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  if (period === "month") {
    const months = locale === "th" ? MONTHS_TH : MONTHS_EN;
    const year = full ? String(d.getFullYear()) : String(d.getFullYear()).slice(2);
    return `${months[d.getMonth()]} ${year}`;
  }
  if (period === "year") return String(d.getFullYear());
  return full
    ? `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
    : `${d.getDate()}/${d.getMonth() + 1}`;
}
