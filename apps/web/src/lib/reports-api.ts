"use client";

import { apiFetch } from "./api";
import { getToken } from "./rules-api";
import {
  fetchApps,
  fetchCategories,
  fetchPriorities,
  fetchStatuses,
} from "./board-api";

/**
 * Reports data layer — every row on the /reports page comes from the real
 * API:
 *
 *   GET /issues            (+ createdFrom/createdTo + sortBy/sortOrder)
 *   GET /reports/summary   grouped aggregates (person | app)
 *   GET /reports/people    distinct assignees / reporters (filter panel)
 *
 * Summary groups are returned whole (tens at most), so the client sorts and
 * pages them; list views are paged server-side. CSV export walks every page
 * of the current filters.
 */

export const REPORT_PAGE_SIZE = 10;
/** Export walks the real API page by page — capped so a huge filter cannot hang the tab. */
const EXPORT_PAGE_LIMIT = 100;
const EXPORT_MAX_PAGES = 50;

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type ReportView = "issues" | "assignee" | "app";

/** Mirrors theme.custom.columnColors — drives the soft status dots. */
export type StatusKey = "backlog" | "todo" | "doing" | "review" | "done";

export interface ReportFilters {
  /** yyyy-mm-dd, empty = no bound */
  from: string;
  to: string;
  search: string;
  assigneeIds: number[];
  reporterIds: number[];
  categoryIds: number[];
  statusIds: number[];
  priorityIds: number[];
  appIds: number[];
}

export const EMPTY_FILTERS: ReportFilters = {
  from: "",
  to: "",
  search: "",
  assigneeIds: [],
  reporterIds: [],
  categoryIds: [],
  statusIds: [],
  priorityIds: [],
  appIds: [],
};

export interface SortState {
  field: string;
  dir: "asc" | "desc";
}

export interface ReportPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface IssueRow {
  id: string;
  issueNumber: string | null;
  title: string;
  /** วันที่เริ่มรับเรื่อง — issues.received_at (stamped on entering รอดำเนินการ) */
  receivedAt: string | null;
  /** รายละเอียด — issues.description */
  description: string;
  /** วิเคราะห์ / สาเหตุ — filled when the rules open the analysis fields */
  analysisCause: string | null;
  /** การแก้ไข — filled when the rules open the resolution fields */
  resolution: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  reporterId: number | null;
  reporterName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  appId: number | null;
  appName: string | null;
  statusId: number | null;
  statusName: string | null;
  statusKey: StatusKey | null;
  priorityId: number | null;
  priorityName: string | null;
  /** ชั่วโมงจริง — issues.tracked_duration (timer/work sessions total) */
  hoursActual: number;
  /** ชั่วโมงกรอก — issues.actual_fix_duration typed on the issue */
  hoursEntered: number;
  createdAt: string;
  updatedAt: string;
  /** Work-session aggregates (?withTimeline=1): first start / last end / total. */
  workStartedAt: string | null;
  workEndedAt: string | null;
  durationSeconds: number;
  operatorNames: string[];
}

/** Rows of the "by assignee" / "by app" views (labelKey = i18n fallback). */
export interface SummaryRow {
  personId?: number | null;
  categoryId?: number | null;
  appId?: number | null;
  label: string | null;
  labelKey?: "unassigned" | "total" | "noCategory" | "noApp";
  issueCount: number;
  openCount: number;
  hoursActual: number;
  hoursEntered: number;
  /** ค่ากลางเวลาจับ (นาที) — computed in SQL; null = no recorded time in the group. */
  medianActualMinutes: number | null;
  /** ค่ากลางเวลากรอก (นาที) — same, from actual_fix_duration. */
  medianEnteredMinutes: number | null;
  lastAt: string | null;
  topAssignee?: string | null;
  isTotal?: boolean;
}

export type ReportRows = IssueRow | SummaryRow;

export interface ReportQuery {
  filters: ReportFilters;
  sort: SortState;
  page: number;
  limit?: number;
}

export const DEFAULT_SORT: Record<ReportView, SortState> = {
  issues: { field: "createdAt", dir: "desc" },
  assignee: { field: "hoursActual", dir: "desc" },
  app: { field: "medianActualMinutes", dir: "desc" },
};

/** Columns the table header offers as sortable, per view. */
export const SORTABLE_FIELDS: Record<ReportView, string[]> = {
  issues: ["title", "assigneeName", "receivedAt"],
  assignee: ["label", "issueCount", "openCount", "hoursActual", "hoursEntered"],
  app: ["label", "issueCount", "openCount", "medianActualMinutes", "medianEnteredMinutes"],
};

export interface FilterOption {
  id: number;
  name: string;
}

export interface FilterOptions {
  statuses: FilterOption[];
  priorities: FilterOption[];
  categories: FilterOption[];
  apps: FilterOption[];
  people: FilterOption[];
  reporters: FilterOption[];
}

/** Until the option lists land, sections render empty (not a spinner). */
export const EMPTY_FILTER_OPTIONS: FilterOptions = {
  statuses: [],
  priorities: [],
  categories: [],
  apps: [],
  people: [],
  reporters: [],
};

export function activeFilterCount(f: ReportFilters): number {
  let n = 0;
  if (f.from || f.to) n += 1;
  if (f.search.trim()) n += 1;
  if (f.assigneeIds.length) n += 1;
  if (f.reporterIds.length) n += 1;
  if (f.categoryIds.length) n += 1;
  if (f.statusIds.length) n += 1;
  if (f.priorityIds.length) n += 1;
  if (f.appIds.length) n += 1;
  return n;
}

/* ------------------------------------------------------------------ */
/* Client-side sort + page (used for summary groups and the CSV dump)  */
/* ------------------------------------------------------------------ */

function accessorFor(
  view: ReportView,
  field: string,
): ((row: ReportRows) => string | number | null) | undefined {
  switch (view) {
    case "issues":
      switch (field) {
        case "title":
          return (r) => (r as IssueRow).title;
        case "assigneeName":
          return (r) => (r as IssueRow).assigneeName;
        case "hoursActual":
          return (r) => (r as IssueRow).hoursActual;
        case "hoursEntered":
          return (r) => (r as IssueRow).hoursEntered;
        case "createdAt":
          return (r) => (r as IssueRow).createdAt;
        default:
          return undefined;
      }
    case "assignee":
      switch (field) {
        case "label":
          return (r) => (r as SummaryRow).label ?? "";
        case "issueCount":
          return (r) => (r as SummaryRow).issueCount;
        case "openCount":
          return (r) => (r as SummaryRow).openCount;
        case "hoursActual":
          return (r) => (r as SummaryRow).hoursActual;
        case "hoursEntered":
          return (r) => (r as SummaryRow).hoursEntered;
        default:
          return undefined;
      }
    case "app":
      switch (field) {
        case "label":
          return (r) => (r as SummaryRow).label ?? "";
        case "issueCount":
          return (r) => (r as SummaryRow).issueCount;
        case "openCount":
          return (r) => (r as SummaryRow).openCount;
        case "medianActualMinutes":
          return (r) => (r as SummaryRow).medianActualMinutes;
        case "medianEnteredMinutes":
          return (r) => (r as SummaryRow).medianEnteredMinutes;
        default:
          return undefined;
      }
    default:
      return undefined;
  }
}

/** Nulls sink to the bottom regardless of direction; the total row stays pinned. */
function sortRows(view: ReportView, rows: ReportRows[], sort: SortState): ReportRows[] {
  const totalIdx = rows.findIndex((r) => (r as SummaryRow).isTotal);
  const total = totalIdx >= 0 ? rows[totalIdx] : undefined;
  const body = totalIdx >= 0 ? rows.filter((_, i) => i !== totalIdx) : rows;

  const acc = accessorFor(view, sort.field);
  if (!acc) {
    return total ? [...body, total] : body;
  }
  const dir = sort.dir === "asc" ? 1 : -1;
  const sorted = [...body].sort((a, b) => {
    const va = acc(a);
    const vb = acc(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "th") * dir;
  });
  return total ? [...sorted, total] : sorted;
}

function paginate<T>(rows: T[], page: number, limit: number): ReportPage<T> {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(Math.max(1, page), totalPages);
  return {
    data: rows.slice((current - 1) * limit, current * limit),
    total,
    page: current,
    limit,
    totalPages,
  };
}

/* ------------------------------------------------------------------ */
/* Real API branches                                                   */
/* ------------------------------------------------------------------ */

function statusKeyFromName(name: string | null | undefined): StatusKey | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (n === "backlog") return "backlog";
  if (n === "todo" || n === "to do") return "todo";
  if (n === "doing" || n === "in progress") return "doing";
  if (n === "review") return "review";
  if (n === "done") return "done";
  return null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Shape returned by GET /issues rows (toResponse). */
interface RawIssue {
  id: number | string;
  issueNumber: string | null;
  title: string;
  analysisCause?: string | null;
  resolution?: string | null;
  receivedAt?: string | null;
  description?: string;
  workStartedAt?: string | null;
  workEndedAt?: string | null;
  durationSeconds?: number;
  operatorNames?: string[];
  statusId: number | null;
  statusName: string | null;
  priorityId: number | null;
  priorityName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  appId: number | null;
  appName: string | null;
  programmerId: number | string | null;
  programmerName: string | null;
  customerId?: number | string | null;
  customerName: string | null;
  trackedDuration?: number;
  actualFixDuration?: number | null;
  createdAt: string;
  updatedAt: string;
}

function mapIssue(raw: RawIssue): IssueRow {
  return {
    id: String(raw.id),
    issueNumber: raw.issueNumber,
    title: raw.title,
    receivedAt: raw.receivedAt ?? null,
    description: raw.description ?? "",
    analysisCause: raw.analysisCause ?? null,
    resolution: raw.resolution ?? null,
    workStartedAt: raw.workStartedAt ?? null,
    workEndedAt: raw.workEndedAt ?? null,
    durationSeconds: raw.durationSeconds ?? 0,
    operatorNames: raw.operatorNames ?? [],
    assigneeId: raw.programmerId == null ? null : Number(raw.programmerId),
    assigneeName: raw.programmerName,
    reporterId: raw.customerId == null ? null : Number(raw.customerId),
    reporterName: raw.customerName,
    categoryId: raw.categoryId,
    categoryName: raw.categoryName,
    appId: raw.appId,
    appName: raw.appName,
    statusId: raw.statusId,
    statusName: raw.statusName,
    statusKey: statusKeyFromName(raw.statusName),
    priorityId: raw.priorityId,
    priorityName: raw.priorityName,
    // ชั่วโมงจริง from the timer total; ชั่วโมงกรอก from actualFixDuration
    hoursActual: round1((raw.trackedDuration ?? 0) / 3600),
    hoursEntered: round1((raw.actualFixDuration ?? 0) / 3600),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function filterParams(f: ReportFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.from) p.set("createdFrom", f.from);
  if (f.to) p.set("createdTo", f.to);
  if (f.search.trim()) p.set("search", f.search.trim());
  if (f.assigneeIds.length) p.set("assigneeIds", f.assigneeIds.join(","));
  if (f.reporterIds.length) p.set("reporterIds", f.reporterIds.join(","));
  if (f.categoryIds.length) p.set("categoryIds", f.categoryIds.join(","));
  if (f.statusIds.length) p.set("statuses", f.statusIds.join(","));
  if (f.priorityIds.length) p.set("priorityIds", f.priorityIds.join(","));
  if (f.appIds.length) p.set("appIds", f.appIds.join(","));
  return p;
}

interface RawPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

async function fetchRealIssues(query: ReportQuery): Promise<ReportPage<IssueRow>> {
  const p = filterParams(query.filters);
  p.set("page", String(query.page));
  p.set("limit", String(query.limit ?? REPORT_PAGE_SIZE));
  p.set("sortBy", query.sort.field);
  p.set("sortOrder", query.sort.dir);
  // work-session aggregates for the report's start/end/duration/operator columns
  p.set("withTimeline", "1");
  const res = await apiFetch<RawPage<RawIssue>>(`/issues?${p.toString()}`, {}, getToken());
  return { ...res, data: res.data.map(mapIssue) };
}

/** Every summary group — the client sorts and pages these (tens of rows). */
async function fetchSummaryRows(
  groupBy: "person" | "app",
  filters: ReportFilters,
): Promise<SummaryRow[]> {
  const p = filterParams(filters);
  p.set("groupBy", groupBy);
  return apiFetch<SummaryRow[]>(`/reports/summary?${p.toString()}`, {}, getToken());
}

async function fetchRealSummary(
  groupBy: "person" | "app",
  query: ReportQuery,
): Promise<ReportPage<SummaryRow>> {
  const rows = await fetchSummaryRows(groupBy, query.filters);
  const view: ReportView = groupBy === "person" ? "assignee" : "app";
  const sorted = sortRows(view, rows, query.sort) as SummaryRow[];
  return paginate(sorted, query.page, query.limit ?? REPORT_PAGE_SIZE);
}

async function fetchRealRows(
  view: ReportView,
  query: ReportQuery,
): Promise<ReportPage<ReportRows>> {
  switch (view) {
    case "issues":
      return fetchRealIssues(query);
    case "assignee":
      return fetchRealSummary("person", query);
    case "app":
      return fetchRealSummary("app", query);
    default:
      return paginate<ReportRows>([], query.page, query.limit ?? REPORT_PAGE_SIZE);
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function fetchReportRows(
  view: ReportView,
  query: ReportQuery,
): Promise<ReportPage<ReportRows>> {
  return fetchRealRows(view, query);
}

/**
 * Every row matching the current filters — the CSV export must not stop at
 * the page on screen, and the person-detail table shows the full task list.
 */
export async function fetchAllReportRows(
  view: ReportView,
  query: Omit<ReportQuery, "page" | "limit">,
): Promise<ReportRows[]> {
  if (view === "assignee" || view === "app") {
    // summaries already arrive complete — sort and hand everything back
    const groupBy = view === "assignee" ? "person" : "app";
    const rows = await fetchSummaryRows(groupBy, query.filters);
    return sortRows(view, rows, query.sort);
  }
  const all: ReportRows[] = [];
  for (let page = 1; page <= EXPORT_MAX_PAGES; page++) {
    const res = await fetchRealRows(view, { ...query, page, limit: EXPORT_PAGE_LIMIT });
    all.push(...res.data);
    if (page >= res.totalPages) break;
  }
  // Past EXPORT_MAX_PAGES the loop stops early — the caller can compare
  // rows.length against the reported total to warn about the cap.
  return all;
}

/** Tasks of one person — powers the expandable row in the assignee view. */
export async function fetchPersonTasks(
  personId: number,
  filters: ReportFilters,
): Promise<IssueRow[]> {
  const rows = await fetchAllReportRows("issues", {
    filters: { ...filters, assigneeIds: [personId] },
    sort: DEFAULT_SORT.issues,
  });
  return (rows as IssueRow[]).slice(0, 50);
}

/* ------------------------------------------------------------------ */
/* Filter options                                                      */
/* ------------------------------------------------------------------ */

/** Response of GET /reports/people — people actually occurring in each role. */
export interface ReportPeople {
  assignees: FilterOption[];
  reporters: FilterOption[];
}

/**
 * The two people lists for the filter panel. The backend derives them from
 * the issues themselves (assignee = programmer_id, reporter = customer_id),
 * so the sections show the people who really occur in that role instead of
 * the whole member list twice.
 */
export async function fetchReportPeople(): Promise<ReportPeople> {
  return apiFetch<ReportPeople>("/reports/people", {}, getToken());
}

/**
 * Dropdown/section options from the existing board endpoints. On any failure
 * the panel renders with empty sections instead of breaking the page.
 */
export async function loadFilterOptions(): Promise<FilterOptions> {
  try {
    const [statuses, priorities, categories, apps, people] = await Promise.all([
      fetchStatuses(),
      fetchPriorities(),
      fetchCategories(),
      fetchApps(),
      fetchReportPeople(),
    ]);
    return {
      statuses: statuses.data.map((s) => ({ id: s.id, name: s.name })),
      priorities: priorities.data.map((p) => ({ id: p.id, name: p.name })),
      categories: categories.data.map((c) => ({ id: c.id, name: c.name })),
      apps: apps.data.map((a) => ({ id: a.id, name: a.name })),
      people: people.assignees,
      reporters: people.reporters,
    };
  } catch {
    return EMPTY_FILTER_OPTIONS;
  }
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

/**
 * RFC-4180-ish CSV with a UTF-8 BOM so Excel opens Thai text correctly, plus
 * formula-injection guarding (cells starting with = + - @ get a leading ').
 */
export function buildCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const escape = (value: string | number): string => {
    let s = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
