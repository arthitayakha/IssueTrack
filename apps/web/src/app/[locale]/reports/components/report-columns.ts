import type { ReportView } from "@/lib/reports-api";

export interface ReportColumnDef {
  /** Stable id used in the preference store and CSV keys. */
  key: string;
  /** i18n key relative to the Reports namespace (e.g. columns.index). */
  labelKey: string;
}

/**
 * Every column per view, in display order. One registry drives the
 * show/hide-column menu, the table's conditional cells and the CSV export,
 * so a column can never drift between screen and file.
 */
export const REPORT_COLUMNS: Record<ReportView, ReportColumnDef[]> = {
  issues: [
    { key: "index", labelKey: "columns.index" },
    { key: "issueNumber", labelKey: "columns.issueNumber" },
    { key: "receivedAt", labelKey: "columns.receivedAt" },
    { key: "assignee", labelKey: "columns.assignee" },
    { key: "reporter", labelKey: "columns.reporter" },
    { key: "title", labelKey: "columns.title" },
    { key: "description", labelKey: "columns.description" },
    { key: "analysis", labelKey: "columns.analysisCause" },
    { key: "resolution", labelKey: "columns.resolution" },
    { key: "workStarted", labelKey: "columns.workStarted" },
    { key: "workEnded", labelKey: "columns.workEnded" },
    { key: "duration", labelKey: "columns.duration" },
    { key: "enteredTime", labelKey: "columns.enteredTime" },
    { key: "operators", labelKey: "columns.operators" },
    { key: "status", labelKey: "columns.status" },
    { key: "category", labelKey: "columns.category" },
    { key: "app", labelKey: "columns.app" },
    { key: "priority", labelKey: "columns.priority" },
  ],
  assignee: [
    { key: "person", labelKey: "columns.person" },
    { key: "issueCount", labelKey: "columns.issueCount" },
    { key: "openCount", labelKey: "columns.openCount" },
    { key: "hoursActual", labelKey: "columns.hoursActual" },
    { key: "hoursEntered", labelKey: "columns.hoursEntered" },
    { key: "lastAt", labelKey: "columns.lastAt" },
  ],
  app: [
    { key: "app", labelKey: "columns.app" },
    { key: "issueCount", labelKey: "columns.issueCount" },
    { key: "openCount", labelKey: "columns.openCount" },
    { key: "medianActualMinutes", labelKey: "columns.medianActual" },
    { key: "medianEnteredMinutes", labelKey: "columns.medianEntered" },
    { key: "topAssignee", labelKey: "columns.topAssignee" },
    { key: "lastAt", labelKey: "columns.lastAt" },
  ],
};

/**
 * Columns of the person-detail table — the row that expands under each
 * programmer in the assignee view. Its own registry (and prefs slot) so the
 * show/hide menu can drive it separately from the summary grid above it.
 * Same six columns it always showed; they just became toggleable.
 */
export const REPORT_DETAIL_COLUMNS: ReportColumnDef[] = [
  { key: "index", labelKey: "columns.index" },
  { key: "title", labelKey: "columns.title" },
  { key: "status", labelKey: "columns.status" },
  { key: "category", labelKey: "columns.category" },
  { key: "hoursActual", labelKey: "columns.hoursActual" },
  { key: "hoursEntered", labelKey: "columns.hoursEntered" },
];

/**
 * Prefs slot for that detail table — kept outside the per-view keys (its
 * values are still `ColumnPrefs`, so loadColumnPrefs/normalize() read it
 * as-is; stores written before it existed keep working untouched).
 */
export const DETAIL_PREF_KEY = "assignee.detail";

/**
 * Columns that can never be dragged away from first place — the running
 * number (ครั้งที่ / ลำดับ) always leads the table. Shared by both registries.
 */
export const PINNED_COLUMNS = new Set(["index"]);

/** Per-view choices: which columns are hidden and the order of the rest. */
export interface ColumnPrefs {
  hidden: string[];
  /** Movable column keys in display order; pinned keys are ignored here. */
  order: string[];
}

export type ColumnPrefsByView = Record<string, ColumnPrefs>;

const STORAGE_KEY = "kanban-report-columns";
/** Older store that only held the hidden keys — migrated on first read. */
const LEGACY_STORAGE_KEY = "kanban-report-hidden-columns";

function normalize(parsed: unknown): ColumnPrefsByView {
  const out: ColumnPrefsByView = {};
  if (!parsed || typeof parsed !== "object") return out;
  for (const [view, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      // legacy shape: `{ [view]: hiddenKeys[] }`
      out[view] = { hidden: value as string[], order: [] };
    } else if (value && typeof value === "object") {
      const v = value as Partial<ColumnPrefs>;
      out[view] = {
        hidden: Array.isArray(v.hidden) ? v.hidden : [],
        order: Array.isArray(v.order) ? v.order : [],
      };
    }
  }
  return out;
}

/** `{ [view]: { hidden, order } }` — survives reloads; missing view = defaults. */
export function loadColumnPrefs(): ColumnPrefsByView {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const current = normalize(JSON.parse(raw));
      if (Object.keys(current).length > 0) return current;
    }
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) return normalize(JSON.parse(legacy));
  } catch {
    // corrupt or unavailable storage — fall back to defaults
  }
  return {};
}

export function saveColumnPrefs(value: ColumnPrefsByView): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // private mode / quota — the choice simply won't persist
  }
}

/**
 * Registry order with the user's order applied: pinned columns first, then
 * the stored order, then any key the store doesn't know yet (new columns).
 * Hidden columns keep their slot so unhiding restores the same position.
 */
function orderRegistry(registry: ReportColumnDef[], order?: string[]): ReportColumnDef[] {
  const pinned = registry.filter((c) => PINNED_COLUMNS.has(c.key));
  const movable = registry.filter((c) => !PINNED_COLUMNS.has(c.key));
  const byKey = new Map(movable.map((c) => [c.key, c]));

  const seen = new Set<string>();
  const sorted: ReportColumnDef[] = [];
  for (const key of order ?? []) {
    const col = byKey.get(key);
    if (col && !seen.has(key)) {
      sorted.push(col);
      seen.add(key);
    }
  }
  for (const col of movable) {
    if (!seen.has(col.key)) sorted.push(col);
  }
  return [...pinned, ...sorted];
}

/** The view's columns (summary grid) in the user's display order. */
export function orderedColumns(view: ReportView, order?: string[]): ReportColumnDef[] {
  return orderRegistry(REPORT_COLUMNS[view], order);
}

/** The expanded person-row columns in the user's display order. */
export function orderedDetailColumns(order?: string[]): ReportColumnDef[] {
  return orderRegistry(REPORT_DETAIL_COLUMNS, order);
}
