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

/**
 * `YYYY-MM-DD` + N ปี — ปัดวันที่ 29 ก.พ. ไป 28 ก.พ. เหมือน dayjs `.add(N, "year")`
 * ที่ฟอร์มต่ออายุ (`renew-form-dialog.tsx`) ใช้ตัด window การทบชั่วโมง ให้ฝั่ง
 * เซิร์ฟเวอร์ตรงกับฟอร์มเป๊ะ (ต่อวันครบ 1 ปีพอดี = ยังได้ทบ / เกิน = ไม่ได้)
 */
export function addYearsIso(value: string, years: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const nextYear = year + years;
  // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้ (month เป็น 1-based, Date เติม 0-based)
  const lastDay = new Date(Date.UTC(nextYear, month, 0)).getUTCDate();
  const nextDay = Math.min(day, lastDay);
  return `${String(nextYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}
