"use client";

import { DONE_STATUS_ID, type IssueTaskType } from "@kanban/shared";
import { apiFetch } from "./api";
import { getToken } from "./rules-api";
import { fetchCategories, fetchPriorities, fetchStatuses } from "./board-api";
// apps-api's `fetchApps` — unlike board-api's, it types `companies[].maHours`,
// which the MA / คงเหลือ columns need. Same endpoint, same payload.
import { fetchCompanies, fetchApps, type AppCompanyLink, type UsageCount } from "./apps-api";

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

/**
 * **ประเภทสัญญา** ของแถวในมุมมอง "ตามบริษัท" — ค่าของ `app_companies.kind`
 * (`renew` = ต่ออายุ/เพิ่มรายการ, `buy` = ซื้อชั่วโมง) · ใช้ทั้งตัวกรอง `kinds`
 * และคอลัมน์ "ประเภท" ของตาราง ให้สองที่อ่าน type เดียวกัน
 */
export type ContractKind = "renew" | "buy";

/** ค่าที่ตัวกรองประเภทงานรับได้ — whitelist ชุดเดียวกับฝั่ง backend. */
export const TASK_TYPE_VALUES: IssueTaskType[] = ["bug", "ma", "requirement"];

export interface ReportFilters {
  /** yyyy-mm-dd, empty = no bound */
  from: string;
  to: string;
  /**
   * Which dashboard trend bar opened this list: `pending` / `done`. Both bars
   * cohort by CREATION date and split by CURRENT status, so `from`/`to` always
   * bind `createdFrom/To`; the bar adds `notDone=1` (pending) or `statuses=[4]`
   * (done). `""` = no bar, the ordinary unfiltered list.
   */
  series: "" | "pending" | "done";
  search: string;
  assigneeIds: number[];
  /**
   * "ยังไม่มอบหมาย" (`programmer_id IS NULL`) — **internal only**, set by the
   * expandable unassigned row's task fetch. No filter-panel UI, not counted in
   * `activeFilterCount`, never written to the URL by `filtersToPatch`.
   */
  noAssignee?: boolean;
  reporterIds: number[];
  categoryIds: number[];
  statusIds: number[];
  priorityIds: number[];
  /** "ไม่ระบุความสำคัญ" — priority_id IS NULL, from the dashboard's NULL bar. */
  noPriority: boolean;
  appIds: number[];
  /**
   * "ไม่มีแอป" / "ไม่มีหมวดหมู่" — ชิ้นโดนัท NULL ของ dashboard ไม่มี id ให้กรอง
   * จึงส่งธงแทน (`?noApp=1` / `?noCategory=1`). เป็น **OR ของ dimension
   * เดียวกัน** เหมือน backend: ติ๊ก POS + "ไม่มีแอป" = `app_id IS NULL OR IN (…)`
   */
  noApp: boolean;
  noCategory: boolean;
  companyIds: number[];
  /**
   * **ประเภทงาน** (`IssueTaskType[]`) — ตัวกรองจริงของหน้ารายงาน (section
   * "ประเภทงาน" ใน popover) ส่งเป็น `?taskTypes=bug,ma,requirement` ให้ทุก
   * มุมมองที่มีงาน (รายการปัญหา / ตามผู้รับผิดชอบ / ตามแอป) · whitelist ฝั่ง
   * backend กรอกมาเฉพาะ 3 ค่านี้แล้ว
   *
   * ⚠️ แยกจาก `fetchAppUsageAllTime()` ที่ยิง `taskTypes=ma` **เอง** เพื่อคำนวณ
   * "ใช้ไป" — ตัวนั้นไม่ได้ผ่าน `ReportFilters` จึงไม่กระทบตัวเลข MA ไม่ว่า
   * user จะกรอง type อะไรบนจอ
   */
  taskTypes: IssueTaskType[];
  /**
   * "ไม่ระบุประเภทงาน" (`task_type IS NULL`) — bucket โดนัทของ dimension
   * เดียวกันกับ `noApp` / `noCategory`: ติ๊กรวมกับ type จริง = OR บนฝั่ง
   * server (`IN (...) OR IS NULL`) ไม่ใช่ AND ที่จะว่างเสมอ
   */
  noTaskType: boolean;
  /**
   * **ประเภทสัญญา** (`app_companies.kind`) — `renew` = ต่ออายุ/เพิ่มรายการ,
   * `buy` = ซื้อชั่วโมง · **ใช้เฉพาะมุมมอง "ตามบริษัท"** ซึ่งแถวถูกสร้างใน
   * เบราว์เซอร์ (`buildCompanyRows`) จึงกรองฝั่ง client ล้วน ไม่มี API call
   */
  kinds: ContractKind[];
}

export const EMPTY_FILTERS: ReportFilters = {
  from: "",
  to: "",
  series: "",
  search: "",
  assigneeIds: [],
  reporterIds: [],
  categoryIds: [],
  statusIds: [],
  priorityIds: [],
  noPriority: false,
  appIds: [],
  noApp: false,
  noCategory: false,
  companyIds: [],
  taskTypes: [],
  noTaskType: false,
  kinds: [],
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
  /**
   * คอลัมน์ "บริษัท" (view รายการปัญหา) — **บริษัทของผู้แจ้งงาน**
   * (`issues.customer_id` → `users.company_id` → `companies`) เท่านั้น
   * 1 คน = 1 บริษัท · `null` = ไม่มีผู้แจ้ง / ผู้แจ้งไม่มีบริษัท → โชว์ `—`
   *
   * (เดิมคอลัมน์นี้อ่านผ่านแอปของงาน → `app_companies` จึงเทชื่อบริษัท
   * **ทั้งหมด**ที่แอปผูกไว้มาทุกแถว — เปลี่ยนให้ตรงกับบอร์ดแล้ว)
   */
  companyName: string | null;
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
  /** Median time tracked (minutes) — computed in SQL; the screen/export show it as "X ชั่วโมง Y นาที"; null = no recorded time in the group. */
  medianActualMinutes: number | null;
  /** Median time entered (minutes) — same, from actual_fix_duration. */
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
  // ตามแอปเรียงตาม "ชั่วโมงจริง" ที่เป็น**ผลรวม** (แทนที่ median เดิม — ดู report-columns.ts)
  app: { field: "hoursActual", dir: "desc" },
  company: { field: "companyName", dir: "asc" },
};

/** Columns the table header offers as sortable, per view. */
export const SORTABLE_FIELDS: Record<ReportView, string[]> = {
  issues: ["title", "assigneeName", "receivedAt"],
  assignee: ["label", "issueCount", "openCount", "hoursActual", "hoursEntered"],
  // ตามแอปเรียงได้เฉพาะคอลัมน์ sum — ค่ากลาง (median) ถูกแทนที่แล้ว (ดู report-columns.ts)
  app: ["label", "issueCount", "openCount", "hoursActual", "hoursEntered"],
  // contract columns only — ชั่วโมงที่ใช้ทั้งหมด/คงเหลือ ระดับแอป ไม่เรียงได้
  // เพราะแถวคือคู่ แอป×บริษัท (ค่าเดียวซ้ำได้หลายแถว)
  company: ["companyName", "appName", "startedAt", "expiresAt", "maHours"],
};

export interface FilterOption {
  id: number;
  name: string;
}

/**
 * Contract facts of one app — the source behind **every** row of the `company`
 * view (and its contract columns). Built from the same `GET /apps` call the
 * filter panel already makes, so it costs no extra request.
 *
 * **ไม่ใช่**แหล่งของคอลัมน์ "บริษัท" ใน view รายการปัญหาอีกแล้ว — คอลัมน์นั้น
 * อ่านจาก `IssueRow.companyName` (บริษัทของผู้แจ้ง) ตรง ๆ เพราะแอปผูกได้
 * หลายบริษัท แล้วทุกแถวจะเทชื่อมาหมดเหมือนกันหมด
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
 * **Not carried here:** ชั่วโมงที่ใช้ทั้งหมด / คงเหลือ. Those come from
 * `fetchAppUsageAllTime()` as a **per-pair** map (`pairKey(appId, companyId)`) —
 * โยงงานกับคู่ผ่านบริษัทของผู้แจ้งงาน — และยังไม่รู้ค่าตอนสร้างแถว
 * ให้ cell หยิบจาก `usage` prop ตอน render เอง (ดู `CompanyRow`)
 *
 * MA **ถูกหักแล้ว** (`MA_DEDUCTION_PAUSED = false`) — แต่ "ใช้ไป" นับเฉพาะงาน
 * type `ma` (bug, requirement กับ NULL ไม่หัก); `maHours == null` ยัง
 * แปลว่า "ยังไม่กรอก" เหมือนเดิม
 *
 * **`recordId`** = PK ของแถวนั้นใน `app_companies` — จำเป็นสำหรับคอลัมน์
 * "รายการที่ตัด" ซึ่งต้องถาม **รายรอบ** (`GET /apps/usage-counts` /
 * `GET /apps/:id/companies/:recordId/usage`) เพราะแถวละ 1 รอบอยู่แล้ว
 * (`null` = แอปยังไม่ผูกบริษัท → ไม่มีรอบให้ถาม)
 */
export interface CompanyRow {
  appId: number;
  appName: string;
  companyId: number | null;
  companyName: string | null;
  /** แถวสัญญานี้มาจากอะไร — `renew` (ต่ออายุ/เพิ่มรายการ) หรือ `buy` (ซื้อชั่วโมง) */
  kind: ContractKind | null;
  startedAt: string | null;
  expiresAt: string | null;
  maHours: number | null;
  /** `app_companies.id` ของรอบนี้ — คีย์ของคอลัมน์ "รายการที่ตัด" */
  recordId: number | null;
  /**
   * แถวนี้เป็น**ช่วงล่าสุดของคู่** แอป×บริษัท (`recordId` มากสุดของคู่) หรือไม่ ·
   * คอลัมน์ **"ประเภทงาน"** ซึ่งเป็นตัวเลข**ระดับคู่** โชว์**เฉพาะแถวนี้** เพื่อ
   * ไม่ให้ตัวเลขซ้ำทุกรอบของคู่เดียวกัน และให้ CSV/PDF ไม่บวกซ้ำตอนเอาไป sum
   * · `false` (แถวดเก่า / แอปยังไม่ผูกบริษัท) → เซลล์เว้นว่าง — ต่างจาก `—`
   * ซึ่งแปลว่า "ดึงไม่รู้ค่า"
   */
  isLatestOfPair: boolean;
}

/** One row of `GET /reports/usage` — hours already narrowed to one แอป×บริษัท pair. */
export interface AppUsageRow {
  appId: number;
  companyId: number;
  hours: number;
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
 * The `company` view is contract data: it offers only the company / app /
 * ประเภท sections and the search box (date range is hidden — it filters
 * *issues*, not contracts). Counting the other fields there would tint the
 * badge for filters the user cannot even see.
 *
 * A section counts as **one chip however many boxes are ticked inside it** —
 * same rule as every other section (`noTaskType` rides with `taskTypes`).
 */
export function activeFilterCount(f: ReportFilters, view?: ReportView): number {
  if (view === "company") {
    let n = 0;
    if (f.search.trim()) n += 1;
    if (f.appIds.length) n += 1;
    if (f.companyIds.length) n += 1;
    if (f.kinds.length) n += 1;
    return n;
  }
  let n = 0;
  if (f.from || f.to) n += 1;
  if (f.search.trim()) n += 1;
  if (f.assigneeIds.length) n += 1;
  if (f.reporterIds.length) n += 1;
  if (f.categoryIds.length || f.noCategory) n += 1;
  if (f.statusIds.length) n += 1;
  if (f.priorityIds.length || f.noPriority) n += 1;
  if (f.taskTypes.length || f.noTaskType) n += 1;
  if (f.appIds.length || f.noApp) n += 1;
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
  /** บริษัทของผู้แจ้ง — `toResponse()` ส่งมาให้แล้ว (ใช้กับ popup บอร์ดด้วย) */
  customerCompanyName?: string | null;
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
    companyName: raw.customerCompanyName ?? null,
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
  // Both trend bars cohort by creation date — only the current-status clause
  // differs, so `from`/`to` always bind the created-date window.
  if (f.from) p.set("createdFrom", f.from);
  if (f.to) p.set("createdTo", f.to);
  if (f.search.trim()) p.set("search", f.search.trim());
  if (f.assigneeIds.length) p.set("assigneeIds", f.assigneeIds.join(","));
  if (f.noAssignee) p.set("noAssignee", "1");
  if (f.reporterIds.length) p.set("reporterIds", f.reporterIds.join(","));
  if (f.categoryIds.length) p.set("categoryIds", f.categoryIds.join(","));
  if (f.noCategory) p.set("noCategory", "1");
  // The bar's cohort split rides with whatever the user selected by hand;
  // pending = "not currently done" (orphans included), done = status id 4.
  const statusIds =
    f.series === "done" ? [...new Set([...f.statusIds, DONE_STATUS_ID])] : f.statusIds;
  if (statusIds.length) p.set("statuses", statusIds.join(","));
  if (f.series === "pending") p.set("notDone", "1");
  if (f.priorityIds.length) p.set("priorityIds", f.priorityIds.join(","));
  if (f.noPriority) p.set("noPriority", "1");
  if (f.appIds.length) p.set("appIds", f.appIds.join(","));
  if (f.noApp) p.set("noApp", "1");
  if (f.companyIds.length) p.set("companyIds", f.companyIds.join(","));
  // ประเภทงาน — OR-part เดียวกับ noApp/noCategory (ดู ReportFilters.taskTypes)
  if (f.taskTypes.length) p.set("taskTypes", f.taskTypes.join(","));
  if (f.noTaskType) p.set("noTaskType", "1");
  // `kinds` จงใจ**ไม่ถูกส่ง** — มันเป็นตัวกรอง client-side ของมุมมอง
  // ตามบริษัท (แถวสร้างจาก GET /apps ในเบราว์เซอร์ ไม่ผ่าน endpoint ไหน)
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

/**
 * Tasks with **no assignee** — the `ยังไม่มอบหมาย` row's expandable detail.
 * Same cap and source as `fetchPersonTasks`; only the dimension filter differs
 * (`noAssignee` → `programmer_id IS NULL`). All other active filters still apply.
 */
export async function fetchUnassignedTasks(filters: ReportFilters): Promise<IssueRow[]> {
  const rows = await fetchAllReportRows("issues", {
    filters: { ...filters, noAssignee: true },
    sort: DEFAULT_SORT.issues,
  });
  return (rows as IssueRow[]).slice(0, 50);
}

/** Expandable-group key: a person's id, or the NULL-assignee group. */
export type AssigneeGroup = number | "unassigned";

/** Task list behind one assignee summary row (person or the unassigned group). */
export function fetchAssigneeTasks(group: AssigneeGroup, filters: ReportFilters): Promise<IssueRow[]> {
  return group === "unassigned" ? fetchUnassignedTasks(filters) : fetchPersonTasks(group, filters);
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
 * needs — every ตามบริษัท row (and its ชั่วโมง MA / คงเหลือ columns) comes
 * from it for free. The รายการปัญหา view's บริษัท column does **not**: that one
 * is the reporter's company, read from each issue payload.
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
 * **การหักชั่วโม์ MA — เปิดแล้ว** (`false` = หักจริงตามกฎด้านล่าง)
 *
 * กติกาที่เคาะไว้ (ตามตาราง "กฎการหักชั่วโมง MA"):
 * - `ma` → **หัก** (เอา `actual_fix_duration` เข้า "ใช้ไป" — เดิมชื่อ `feature`
 *   rename โดย migration `1827000000000`)
 * - `bug` / `requirement` (เลิกหักตามข้อสรุปผู้ใช้) → **ไม่หัก** /
 *   ยังไม่ระบุ type (`NULL`, รวมงานเก่า) → **ไม่หัก**
 * - หัก **ตอนกรอกเวลาจริง** — ไม่ต้องรอสถานะปิดงาน: ตัวเลขเป็นผลรวมที่
 *   อ่านตอนโหลด พอกรอกเวลาปุ๊บ รอบโหลดถัดไป "คงเหลือ" ลดเองทันที
 * - **หักเฉพาะคู่ แอป×บริษัทของผู้แจ้งงาน** — งานลูกค้าบริษัทไหนหักคู่นั้น;
 *   จับคู่ไม่ได้ (ผู้แจ้งไม่มีบริษัท / ไม่มีผู้แจ้ง / แอปไม่ผูกคู่นั้น) = **ไม่หักที่ไหนเลย**
 *
 * คอลัมน์ "ชั่วโมงกรอก" ในรายงาน (จอ + CSV + PDF) **ยังโชว์เวลาครบทุก type**
 * — การหักมีผลเฉพาะ "ใช้ไป / คงเหลือ" ของ MA เท่านั้น
 *
 * **ปิดกลับ = เปลี่ยนเป็น `true` ตรงนี้จุดเดียว** (แล้ว `fetchAppUsageAllTime()`
 * จะคืน Map ว่างทันที — คงเหลือกลับเป็น MA เต็มก้อน)
 *
 * ยังคงไม่กรองช่วงสัญญา / ไม่กรองเฉพาะงานปิดแล้ว (all-time ต่อคู่ เหมือน
 * เดิม) — ถ้าจะเพิ่มเงื่อนไขพวกนั้นค่อยว่ากันรอบหน้า
 */
export const MA_DEDUCTION_PAUSED = false;

/**
 * คีย์ของ Map "ใช้ไป" — **คู่ แอป×บริษัท** (`"appId:companyId"`)
 *
 * ต้องเป็นคู่เพราะแถวบน `/systems` และมุมมอง "ตามบริษัท" ของ `/reports`
 * คือหนึ่งแถวต่อหนึ่งคู่ — ถ้า key เป็นแค่ appId งานของลูกค้าบริษัทเดียว
 * จะโดนหักจากทุกแถวของแอปเดียวกัน (บั๊ก "MA ลดหมดทุกแถว")
 */
export function pairKey(appId: number, companyId: number | null): string {
  return `${appId}:${companyId}`;
}

/**
 * "ใช้ไป" ต่อ **คู่ แอป×บริษัท** — ตัวส่วนของสูตร คงเหลือ = MA − ใช้ไป
 *
 * ⚠️ **ไม่มีหน้าเรียกใช้แล้ว** หลังเปลี่ยน "ใช้ไป/คงเหลือ" เป็น**รายรอบ**ทุกหน้า
 * (ดู `periodUsedOf()` ด้านล่าง) — เก็บไว้เป็นตัวอ้างอิงของตัวเลขระดับคู่จาก
 * `GET /reports/usage` เผื่อจะเพิ่มคอลัมน์ "ใช้ไปทั้งคู่" ภายหลัง ·
 * `MA_DEDUCTION_PAUSED` ยังเป็นสวิตช์ปิดหักตัวเดิม (ตอนนี้ `periodUsedOf` อ่านด้วย)
 *
 * - **all-time** (`EMPTY_FILTERS`) เพราะ `hoursEntered` ของแถวบนจอ **ผ่านตัว
 *   กรองวันที่/ค้นหา** อยู่แล้ว — ถ้าเอาตัวนั้นไปลบ MA พอผู้ใช้เลือกช่วงวันที่
 *   ตัวเลขคงเหลือจะขยับทั้งที่สัญญาไม่ได้เปลี่ยน (คนละค่ากับ `/systems` ด้วย)
 * - **`taskTypes=ma`** — ไม่นับเวลาของงาน bug / requirement และงานที่ยังไม่ระบุ
 *   type (NULL) เข้าการหัก (ดูกติกาที่ `MA_DEDUCTION_PAUSED`)
 * - **โยงงานกับบริษัทผ่านผู้แจ้งงาน** (`issues.customer_id` → `users.company_id`)
 *   — `GET /reports/usage` ทิ้งแถวที่จับคู่ไม่ได้ให้เอง งานที่ผู้แจ้งไม่มีบริษัท
 *   จึงไม่ถูกหักจากคู่ไหนเลย (map จะไม่มีคีย์นั้น → คอลัมน์อ่านเป็น 0)
 *
 * คีย์ด้วย `pairKey(appId, companyId)` — ดูเหตุผลที่ function นั้น
 */
export async function fetchAppUsageAllTime(): Promise<Map<string, number>> {
  // ปิดหัก → ค่าที่จะได้จาก `/reports/usage` ไม่มีทางถูกใช้อยู่แล้ว
  // จึงไม่ยิง request เปล่า ๆ ให้สองหน้าเห็น `ready` พร้อมตัวเลข 0/MA เต็ม
  if (MA_DEDUCTION_PAUSED) return new Map<string, number>();

  const params = new URLSearchParams({
    taskTypes: "ma",
  });
  const rows = await apiFetch<AppUsageRow[]>(
    `/reports/usage?${params.toString()}`,
    {},
    getToken(),
  );
  const used = new Map<string, number>();
  for (const row of rows) used.set(pairKey(row.appId, row.companyId), row.hours);
  return used;
}

/**
 * **"ใช้ไป" ของ "รอบนั้น"** (`recordId`) — ตัวส่วนของสูตร
 * `คงเหลือ = MA ของแถวนั้น − ใช้ไปของรอบนั้น`
 *
 * เดิมทุกหน้าอ่านยอด **รวมตลอดเวลาของคู่** (`fetchAppUsageAllTime`) ซึ่งทำให้
 * แถวที่**เพิ่งซื้อชั่วโม์ (ยังไม่ได้ใช้เลย)** โชว์ "ใช้ไป 40 / คงเหลือ 0" ทั้งที่
 * 40 ชม. นั้นถูกใช้ไปตอน**รอบแรก** — ผู้ใช้ถามว่า "ยังไม่ได้ใช้ทำไมมีใช้ไป" จึง
 * เปลี่ยนเป็น **รายรอบทุกหน้า** · ค่ามาจาก `GET /apps/usage-counts`
 * (`periodUsedHours`) ซึ่งผูกงานเข้ารอบด้วย `pickPeriodId()` — งานที่กรอก
 * *ก่อน* รอบนั้นจะถูกสร้าง = ของรอบก่อนหน้า (ดู `ma-attribution.ts`)
 *
 * 3 กรณี — **ห้ามเดาเป็น 0**:
 * - `counts === null` → ยังโหลด → `null` (ให้โชว์ `…`)
 * - ไม่มีคีย์ → ดึงไม่ได้ / ไม่รู้จักแถวนั้น → `null` (ให้โชว์ `—`)
 * - **`MA_DEDUCTION_PAUSED` → `0`** — จุดเดียวที่ปิดหัก MA (ค่าของ
 *   `fetchAppUsageAllTime` เดิม ยังใช้กับสูตรนี้เหมือนกัน)
 *
 * **งานที่กรอกก่อนระบบ** (`actual_fix_at IS NULL` = ไม่ระบุรอบ) **ไม่ถูกนับที่นี่**
 * — ยอดรวมทุกรอบจึงอาจน้อยกว่า "ใช้ไป" เดิมเล็กน้อย; ชั่วโม์พวกนั้นถูกเล่าใน
 * แท็บ "งานที่ถูกตัด MA" (`unattributedHours`) ไม่ได้หายไปไหน
 */
export function periodUsedOf(
  counts: Map<number, UsageCount> | null,
  recordId: number,
): number | null {
  if (counts === null) return null;
  if (MA_DEDUCTION_PAUSED) return 0;
  const entry = counts.get(recordId);
  return entry ? round1(entry.periodUsedHours) : null;
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
 * - กรองได้ **บริษัท / แอป / ประเภท (renew|buy) / ค้นหา** — ช่วงวันที่ถูกซ่อนใน
 *   มุมมองนี้เพราะมัน กรอง "วันที่ของงาน" ไม่ใช่วันที่สัญญา ส่วนตัวกรอง
 *   สถานะ/หมวด/ผู้รับ/ผู้แจ้ง/ความสำคัญ/ประเภทงาน ไม่มีความหมายกับแถวสัญญา
 * - `search` จับทั้งชื่อแอปและชื่อบริษัท (case-insensitive)
 *
 * ไม่รวม "ชั่วโมงที่ใช้ทั้งหมด" / "คงเหลือ" — สองค่านั้นอ่านจาก map ระดับ
 * **คู่** (`fetchAppUsageAllTime()` → `pairKey(appId, companyId)`) ซึ่งยังไม่รู้
 * ค่าตอนสร้างแถว ให้ cell หยิบจาก `usage` prop ตอน render เอง (ดู `CompanyRow`)
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
   * `users.company_id` (migration 1816) ถูกใช้กรองทั้ง**บอร์ด**และ**รายงานมุม view
   * รายการปัญหา/สรุป** แล้ว (`issues.service.ts` → `companyReporterIds`,
   * `reports.service.ts` → `applyIssueDims`) — เหลือ**มุมนี้มุมเดียว**ที่ยังเดิน
   * เส้นงาน → แอป → บริษัท เพราะแถวของมุมนี้คือ "คู่สัญญา แอป×บริษัท"
   * ไม่ใช่ "งานของคนคนหนึ่ง"
   */
  const q = filters.search.trim().toLocaleLowerCase();
  const wantedCompanies = new Set(filters.companyIds);
  const wantedApps = new Set(filters.appIds);
  const wantedKinds = new Set(filters.kinds);

  const rows: Array<Omit<CompanyRow, "isLatestOfPair">> = [];
  for (const app of contracts) {
    // app ยังไม่ผูกบริษัท → 1 แถวว่าง (ไม่ใช่ 0 แถว) เพื่อไม่ให้หายเงียบ
    const links: Array<AppCompanyLink | null> =
      app.companies.length > 0 ? app.companies : [null];

    for (const link of links) {
      if (wantedCompanies.size > 0 && (link == null || !wantedCompanies.has(link.id))) {
        continue;
      }
      if (wantedApps.size > 0 && !wantedApps.has(app.id)) continue;
      /**
       * **ประเภทสัญญา** — เลือก renew/buy แล้วแถวที่ `kind` ว่าง (แอปยังไม่ผูก
       * บริษัท → ไม่มีรอบสัญญาเลย) ถูกตัดออก เหมือน filter บริษัทที่ตัดแถว
       * `[null]` อยู่แล้ว — สองฝั่งต้องตรงกัน ไม่งั้นจะเหลือแถว `—` ลอย ๆ
       * ตอนเปิด filter ค้างอยู่
       */
      if (wantedKinds.size > 0 && (link == null || !wantedKinds.has(link.kind))) {
        continue;
      }
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
        // ประเภทของแถวนั้น — `GET /apps` ส่ง `kind` มาอยู่แล้ว (ไม่ยิงขอเพิ่ม)
        kind: link?.kind ?? null,
        startedAt: link?.startedAt ?? null,
        expiresAt: link?.expiresAt ?? null,
        maHours: link?.maHours ?? null,
        // แถวละ 1 รอบ → recordId ของรอบนั้น (คอลัมน์ "รายการที่ตัด" ใช้ตัวนี้)
        recordId: link?.recordId ?? null,
      });
    }
  }

  /**
   * **แถวล่าสุดของแต่ละคู่** = `recordId` มากสุดในกลุ่มแถวที่ *เหลืออยู่หลัง
   * กรองแล้ว* · คำนวณจากค่า max เอง **ไม่พึ่งลำดับ** ที่ API ส่งมา (กันเปลี่ยน
   * ทีหลัง) · **ทำไมต้องหลังกรอง**: filter "ประเภท" ตัดได้เฉพาะแถวของบางรอบ
   * (คู่เดียวกันมีได้ทั้ง renew และ buy) — ถ้าเทียบกับแถวทั้งคู่ก่อนกรอง แล้ว
   * แถวล่าสุดถูกตัดทิ้ง คู่นั้นจะไม่มีแถวไหนโชว์ตัวเลขเลย
   */
  const latestByPair = new Map<string, number>();
  for (const row of rows) {
    if (row.recordId == null) continue;
    const key = pairKey(row.appId, row.companyId);
    const current = latestByPair.get(key);
    if (current == null || row.recordId > current) latestByPair.set(key, row.recordId);
  }

  const withLatest: CompanyRow[] = rows.map((row) => ({
    ...row,
    isLatestOfPair:
      row.recordId != null && latestByPair.get(pairKey(row.appId, row.companyId)) === row.recordId,
  }));

  return sortRows("company", withLatest, sort) as CompanyRow[];
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
