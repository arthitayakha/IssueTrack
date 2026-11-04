/**
 * Date helpers for the app-expiry feature. Everything is a plain `YYYY-MM-DD`
 * string so it round-trips cleanly between the `<input type="date">` field, the
 * `apps.expires_at` DATE column and the 30-day maths — no `Date` arithmetic
 * that could drift across a timezone boundary.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `pg` parses a DATE column into a JS `Date` at *local* midnight, so in UTC+7
 * `2026-12-04` arrives as `2026-12-03T17:00:00Z`. Formatting with the local
 * getters always recovers the stored date; `toISOString()` would report the
 * previous day. Strings pass through (trimmed to the date part).
 */
export function toIsoDate(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

/** True for a real `YYYY-MM-DD` date (rejects `2026-13-45` and friends). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/**
 * Today in the app's timezone (Bangkok), not the host's — a server running in
 * UTC must not open the 30-day window a day early or late.
 */
export function todayIso(timeZone = "Asia/Bangkok"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Whole days from `from` to `to`; negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}
