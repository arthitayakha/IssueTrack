const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
];

/**
 * Human-friendly relative time, e.g. "36 minutes ago" / "36 นาทีที่แล้ว".
 * Uses Intl.RelativeTimeFormat so the locale (th/en) drives the wording.
 * Anything older than a day is shown as a date instead — "3 ต.ค. 2569" /
 * "Oct 3, 2026" reads better than "3 days ago" once a row is really stale.
 */
export function timeAgo(value: string | Date, locale: string, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Number.isNaN(date.getTime())) return "";

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

  // past a day, drop the relative wording and show the plain date
  if (elapsedSeconds >= 60 * 60 * 24) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
  }

  for (const [unit, seconds] of UNITS) {
    if (elapsedSeconds >= seconds) {
      return formatter.format(-Math.floor(elapsedSeconds / seconds), unit);
    }
  }

  return formatter.format(0, "minute");
}
