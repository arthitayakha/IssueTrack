/**
 * Date-range presets shared by every toolbar that offers them — the reports
 * toolbar and the activity-log toolbar both build their calendar-icon menu
 * from this list, so "สัปดาห์นี้" means the same days on both screens.
 *
 * Pure date maths, no React: the caller turns each key into a
 * `DateRangePreset` (label from its own i18n namespace + `rangeDates(key)`).
 */

/** Preset identity; `custom` is appended by `DateRangeIconButton` itself. */
export type RangeKey = "all" | "today" | "week" | "thisMonth" | "lastMonth" | "d90" | "custom";

/** `yyyy-mm-dd` in local time (never UTC — that shifts days near midnight). */
function isoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Monday of the current week (ISO week start). */
function weekFirst(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Mon = 0 … Sun = 6
  d.setDate(d.getDate() - dow);
  return d;
}

/** The dates a preset applies; `null` = "custom" (keep whatever is set). */
export function rangeDates(key: RangeKey): { from: string; to: string } | null {
  const now = new Date();
  const today = isoLocal(now);
  if (key === "all") return { from: "", to: "" };
  if (key === "today") return { from: today, to: today };
  if (key === "week") return { from: isoLocal(weekFirst(now)), to: today };
  if (key === "thisMonth") {
    return { from: isoLocal(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  if (key === "lastMonth") {
    return {
      from: isoLocal(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: isoLocal(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (key === "d90") {
    const d = new Date(now);
    d.setDate(d.getDate() - 89);
    return { from: isoLocal(d), to: today };
  }
  return null;
}

/** Preset keys in menu order — the shared control appends "custom". */
export const RANGE_PRESET_KEYS: Exclude<RangeKey, "custom">[] = [
  "all",
  "today",
  "week",
  "thisMonth",
  "lastMonth",
  "d90",
];

/**
 * i18n key per preset, relative to the caller's namespace — reports reads
 * `toolbar.rangeAll`, logs reads `filters.rangeAll`.
 */
export const RANGE_LABEL_KEYS: Record<Exclude<RangeKey, "custom">, string> = {
  all: "rangeAll",
  today: "rangeToday",
  week: "rangeWeek",
  thisMonth: "rangeThisMonth",
  lastMonth: "rangeLastMonth",
  d90: "range90",
};
