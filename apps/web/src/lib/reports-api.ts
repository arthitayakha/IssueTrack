"use client";

import { apiFetch } from "./api";
import { getToken } from "./rules-api";
import { fetchCategories, fetchPriorities, fetchStatuses } from "./board-api";
// apps-api's `fetchApps` — unlike board-api's, it types `companies[].maHours`,
// which the MA / คงเหลือ columns need. Same endpoint, same payload.
import { fetchCompanies, fetchApps, type AppCompanyLink } from "./apps-api";

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

export type ReportView = "issues" | "assignee" | "app" | "company";

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
  companyIds: number[];
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
  companyIds: [],
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

export type ReportRows = IssueRow | SummaryRow | CompanyRow;

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
  company: { field: "companyName", dir: "asc" },
};

/** Columns the table header offers as sortable, per view. */
export const SORTABLE_FIELDS: Record<ReportView, string[]> = {
  issues: ["title", "assigneeName", "receivedAt"],
  assignee: ["label", "issueCount", "openCount", "hoursActual", "hoursEntered"],
  app: ["label", "issueCount", "openCount", "medianActualMinutes", "medianEnteredMinutes"],
  // contract columns only — ชั่วโมงที่ใช้ทั้งหมด/คงเหลือ ระดับแอป ไม่เรียงได้
  // เพราะแถวคือคู่ แอป×บริษัท (ค่าเดียวซ้ำได้หลายแถว)
  company: ["companyName", "appName", "startedAt", "expiresAt", "maHours"],
};

export interface FilterOption {
  id: number;
  name: string;
}

/**
 * Contract facts of one app — the source behind the บริษัท column (issues
 * view) and **every** row of the `company` view. Built from the same
 * `GET /apps` call the filter panel already makes, so it costs no extra
 * request.
 *
 * The links are kept whole (not flattened to names) because `company` view is
 * **one row per pair** แอป×บริษัท: `started_at` / `expires_at` / `ma_hours`
 * all live on the pair, not on the app.
 */
export interface AppContract {
  id: number;
  name: string;
  /** Every `app_companies` row for this app, in the order the API sends. */
  companies: AppCompanyLink[];
}

/**
 * One row of the `company` view = **one pair** แอป×บริษัท (`app_companies`).
 *
 * An app linked to no company still yields a row (`companyId: null`) so nothing
 * disappears silently — it renders `—` and drops out the moment a company
 * filter is on.
 *
 * **Not carried here:** ชั่วโมงที่ใช้ทั้งหมด / คงเหลือ. Those are **app-level**
 * (`issues` has no `company_id`, so hours cannot be attributed to a pair) and
 * only become known once `fetchAppUsageAllTime()` resolves — the cells read
 * them from the `usage` prop at render time instead.
 *
 * MA ยัง **ไม่ถูกหัก** (`MA_DEDUCTION_PAUSED`) → ค่าสองตัวนั้นตอนนี้คือ 0 กับ
 * `maHours` เต็มก้อนเสมอ; `maHours == null` ยังแปลว่า "ยังไม่กรอก" เหมือนเดิม
 */
export interface CompanyRow {
  appId: number;
  appName: string;
  companyId: number | null;
  companyName: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  maHours: number | null;
}

export interface FilterOptions {
  statuses: FilterOption[];
  priorities: FilterOption[];
  categories: FilterOption[];
  apps: FilterOption[];
  companies: FilterOption[];
  people: FilterOption[];
  reporters: FilterOption[];
  /** Contract facts per app — see `AppContract`. Not a filter section. */
  appContracts: AppContract[];
}

/** Until the option lists land, sections render empty (not a spinner). */
export const EMPTY_FILTER_OPTIONS: FilterOptions = {
  statuses: [],
  priorities: [],
  categories: [],
  apps: [],
  companies: [],
  people: [],
  reporters: [],
  appContracts: [],
};

/**
 * How many filter chips are lit — drives the badge on the toolbar's funnel.
 *
 * The `company` view is contract data: it offers only the company / app
 * sections and the search box (date range is hidden — it filters *issues*, not
 * contracts). Counting the other fields there would tint the badge for filters
 * the user cannot even see.
 */
export function activeFilterCount(f: ReportFilters, view?: ReportView): number {
  if (view === "company") {
    let n = 0;
    if (f.search.trim()) n += 1;
    if (f.appIds.length) n += 1;
    if (f.companyIds.length) n += 1;
    return n;
  }
  let n = 0;
  if (f.from || f.to) n += 1;
  if (f.search.trim()) n += 1;
  if (f.assigneeIds.length) n += 1;
  if (f.reporterIds.length) n += 1;
  if (f.categoryIds.length) n += 1;
  if (f.statusIds.length) n += 1;
  if (f.priorityIds.length) n += 1;
  if (f.appIds.length) n += 1;
  if (f.companyIds.length) n += 1;
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
    case "company":
      switch (field) {
        case "companyName":
          return (r) => (r as CompanyRow).companyName ?? "";
        case "appName":
          return (r) => (r as CompanyRow).appName;
        case "startedAt":
          return (r) => (r as CompanyRow).startedAt;
        case "expiresAt":
          return (r) => (r as CompanyRow).expiresAt;
        case "maHours":
          return (r) => (r as CompanyRow).maHours;
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

/** Client-side page window — the company view's rows are built in the browser. */
export function paginate<T>(rows: T[], page: number, limit: number): ReportPage<T> {
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
  if (f.companyIds.length) p.set("companyIds", f.companyIds.join(","));
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

/**
 * Every summary group — the client sorts and pages these (tens of rows).
 *
 * Exported for `/systems`'s MA tab: it joins `hoursEntered` (the entered-time
 * sum per app) against `maHours` from `fetchApps()` to show "คงเหลือ".
 */
export async function fetchSummaryRows(
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
 *
 * `appContracts` rides the same `GET /apps` call the app section already
 * needs — the บริษัท / ชั่วโมง MA columns get their data for free.
 */
export async function loadFilterOptions(): Promise<FilterOptions> {
  try {
    const [statuses, priorities, categories, apps, companies, people] = await Promise.all([
      fetchStatuses(),
      fetchPriorities(),
      fetchCategories(),
      fetchApps(),
      fetchCompanies(),
      fetchReportPeople(),
    ]);
    return {
      statuses: statuses.data.map((s) => ({ id: s.id, name: s.name })),
      priorities: priorities.data.map((p) => ({ id: p.id, name: p.name })),
      categories: categories.data.map((c) => ({ id: c.id, name: c.name })),
      apps: apps.data.map((a) => ({ id: a.id, name: a.name })),
      // master data — deactivated companies drop out, same as the app section
      companies: companies.data
        .filter((c) => c.isVisible)
        .map((c) => ({ id: c.id, name: c.name })),
      people: people.assignees,
      reporters: people.reporters,
      appContracts: apps.data.map((a) => ({
        id: a.id,
        name: a.name,
        // full links, not just names — the company view's rows ARE these pairs
        companies: a.companies ?? [],
      })),
    };
  } catch {
    return EMPTY_FILTER_OPTIONS;
  }
}

/**
 * **การหักชั่วโมง MA — ยังไม่เปิด** (`true` = ยังไม่หักสักบาท)
 *
 * ตาม migration `1811` กับ `app-company.entity.ts`: `app_companies.ma_hours`
 * เป็นแค่ "เพดานที่กรอกได้ก่อน" ส่วนการหักเวลาจริง (`issues.actual_fix_duration`
 * ของงานที่ปิดแล้ว) **รอตัดสินใจรอบถัดไป** — แต่โค้ดฝั่งเว็บเดินหน้าหักไปแล้ว
 * งาน test งานเดียวที่กรอกเวลาจึงหัก MA ทุกแถวของแอปนั้น (ทุกบริษัทที่ผูกแอปเดียว)
 *
 * `true` → `fetchAppUsageAllTime()` คืน `Map` ว่าง**ทันที ไม่ยิง API** →
 * "ชั่วโมงที่ใช้ทั้งหมด" = 0 และ "คงเหลือ" = ชั่วโมง MA เต็มก้อน ทั้ง `/reports`
 * (จอ + CSV + PDF เพราะทุกอย่างอ่านจากตัวเลขนี้) และ `/systems`
 *
 * **เปิดกลับ = เปลี่ยนเป็น `false` ตรงนี้จุดเดียว** — แล้วอย่าลืมกำหนดกติกา
 * ที่ยังค้าง: หักเฉพาะงานในช่วงสัญญาของแถวนั้น? เฉพาะสถานะปิดแล้ว? ระบุ
 * บริษัทเป็นรายงาน (`issues` ยังไม่มี `company_id`)?
 */
export const MA_DEDUCTION_PAUSED = true;

/**
 * "ใช้ไป" ต่อแอป **แบบไม่กรองอะไรเลย** (`EMPTY_FILTERS`) — ตัวส่วนของสูตร
 * คงเหลือ = MA − ใช้ไป ในมุมมอง "ตามบริษัท"
 *
 * ต้องเป็น all-time เพราะ `hoursEntered` ของแถวบนจอ **ผ่านตัวกรองวันที่/
 * ค้นหา** อยู่แล้ว — ถ้าเอาตัวนั้นไปลบ MA พอผู้ใช้เลือกช่วงวันที่ ตัวเลข
 * คงเหลือจะขยับทั้งที่สัญญาไม่ได้เปลี่ยน (คนละค่ากับ `/systems` ด้วย)
 *
 * ตอน `MA_DEDUCTION_PAUSED = true` → คืน map ว่างทันที (ดูเหตุผลที่ const นั้น)
 */
export async function fetchAppUsageAllTime(): Promise<Map<number, number>> {
  // ยังไม่หัก → ค่าที่จะได้จาก `/reports/summary` ไม่มีทางถูกใช้อยู่แล้ว
  // จึงไม่ยิง request เปล่า ๆ ให้สองหน้าเห็น `ready` พร้อมตัวเลข 0/MA เต็ม
  if (MA_DEDUCTION_PAUSED) return new Map<number, number>();

  const rows = await fetchSummaryRows("app", EMPTY_FILTERS);
  const used = new Map<number, number>();
  for (const row of rows) {
    if (row.isTotal || row.appId == null) continue;
    used.set(row.appId, row.hoursEntered);
  }
  return used;
}

/* ------------------------------------------------------------------ */
/* company view — contract rows built client-side                     */
/* ------------------------------------------------------------------ */

/**
 * มุมมอง **"ตามบริษัท"** — แถว = 1 คู่ แอป×บริษัท สร้างจาก `GET /apps`
 * ที่หน้าโหลดไว้แล้ว **ไม่มี API call** (ข้อมูลสัญญาไม่ใช่ข้อมูลงาน)
 *
 * - แอปที่ยังไม่ผูกบริษัทก็ได้แถว (`companyId: null` → โชว์ `—`) ไม่ให้ข้อมูล
 *   หายเงียบ — แล้วก็หายไปเองทันทีที่เปิดตัวกรองบริษัท
 * - กรองได้แค่ **บริษัท / แอป / ค้นหา** — ช่วงวันที่ถูกซ่อนในมุมมองนี้เพราะมัน
 *   กรอง "วันที่ของงาน" ไม่ใช่วันที่สัญญา ส่วนตัวกรองสถานะ/หมวด/ผู้รับ/ผู้แจ้ง
 *   ไม่มีความหมายกับแถวสัญญา
 * - `search` จับทั้งชื่อแอปและชื่อบริษัท (case-insensitive)
 *
 * ไม่รวม "ชั่วโมงที่ใช้ทั้งหมด" / "คงเหลือ" — สองค่านั้นเป็นระดับ**แอป**
 * (`issues` ไม่มี `company_id`) และยังไม่รู้ค่าตอนสร้างแถว ให้ cell หยิบจาก
 * `usage` prop ตอน render เอง (ดู `CompanyRow`)
 */
export function buildCompanyRows(
  contracts: AppContract[],
  filters: ReportFilters,
  sort: SortState,
): CompanyRow[] {
  /**
   * ตัวกรองบริษัทในมุมมองนี้เดินตามเส้น **งาน → แอป → บริษัท** (`app_companies`)
   * — `issues` ไม่มี `company_id` จึงระบุคู่ไม่ได้โดยตรง (ดูเงื่อนไข
   * `wantedCompanies` ด้านล่าง; แอปที่ยังไม่ผูกบริษัท = แถว `[null]` ที่ถูก
   * ตัดออกเมื่อมี filter บริษัท บรรทัดถัดไป)
   *
   * ยัง**ไม่**ผูก "คนกับบริษัท" — ตาราง `users` ยังไม่มี `company_id`
   * (ประเด็น company ↔ user ยังค้างตัดสินใจอยู่)
   */
  const q = filters.search.trim().toLocaleLowerCase();
  const wantedCompanies = new Set(filters.companyIds);
  const wantedApps = new Set(filters.appIds);

  const rows: CompanyRow[] = [];
  for (const app of contracts) {
    // app ยังไม่ผูกบริษัท → 1 แถวว่าง (ไม่ใช่ 0 แถว) เพื่อไม่ให้หายเงียบ
    const links: Array<AppCompanyLink | null> =
      app.companies.length > 0 ? app.companies : [null];

    for (const link of links) {
      if (wantedCompanies.size > 0 && (link == null || !wantedCompanies.has(link.id))) {
        continue;
      }
      if (wantedApps.size > 0 && !wantedApps.has(app.id)) continue;
      if (
        q &&
        !app.name.toLocaleLowerCase().includes(q) &&
        !(link?.name ?? "").toLocaleLowerCase().includes(q)
      ) {
        continue;
      }
      rows.push({
        appId: app.id,
        appName: app.name,
        companyId: link?.id ?? null,
        companyName: link?.name ?? null,
        startedAt: link?.startedAt ?? null,
        expiresAt: link?.expiresAt ?? null,
        maHours: link?.maHours ?? null,
      });
    }
  }

  return sortRows("company", rows, sort) as CompanyRow[];
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
