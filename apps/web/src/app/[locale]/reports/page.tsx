"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, CircularProgress, Snackbar, Typography } from "@mui/material";
import BarChartIcon from "@mui/icons-material/BarChart";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { Pagination } from "@/components/pagination";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions } from "@/lib/permissions";
import {
  fetchPeriodUsage,
  fetchUsageCounts,
  type DeductionState,
  type PeriodIssue,
  type UsageCount,
} from "@/lib/apps-api";
import {
  buildCompanyRows,
  buildCsv,
  DEFAULT_SORT,
  downloadCsv,
  fetchAllReportRows,
  fetchPersonTasks,
  fetchReportRows,
  loadFilterOptions,
  EMPTY_FILTER_OPTIONS,
  paginate,
  periodUsedOf,
  REPORT_PAGE_SIZE,
  SORTABLE_FIELDS,
} from "@/lib/reports-api";
import type {
  CompanyRow,
  FilterOptions,
  IssueRow,
  ReportFilters,
  ReportPage,
  ReportRows,
  ReportView,
  SortState,
  SummaryRow,
} from "@/lib/reports-api";
import { REPORT_VIEW_ORDER } from "./components/report-views";
import {
  loadColumnPrefs,
  saveColumnPrefs,
  orderedColumns,
  orderedDetailColumns,
  DETAIL_PREF_KEY,
} from "./components/report-columns";
import type { ColumnPrefs, ColumnPrefsByView } from "./components/report-columns";
import { exportReportPdf } from "@/lib/report-pdf";
// วันที่สัญญา (`YYYY-MM-DD`) — ห้าม `new Date()` ตรง ๆ (เพี้ยนใน timezone ติดลบ)
import { formatDay } from "@/lib/app-expiry";
import { ReportsToolbar } from "./components/reports-toolbar";
import { ReportsTable } from "./components/reports-table";

/**
 * Export matrix shared by CSV and PDF: visible columns in the user's display
 * order, so both files show exactly what the table shows on screen.
 */
type CsvMatrix = {
  keys: string[];
  headers: string[];
  data: Array<Array<string | number>>;
  /**
   * Data-row indices of the summary rows, when task rows were spliced under
   * them (assignee view). The PDF bolds/strips them so an aggregate still reads
   * as one line; CSV ignores it.
   */
  summaryRows?: number[];
};

/** One exportable column: key mirrors the show/hide registry. */
interface ExportCol<T> {
  key: string;
  header: string;
  value: (row: T, index: number) => string | number;
}

/** ปัดเศษ 1 ตำแหน่ง — ชั่วโมงกรอกอาจมีเศษทศนิยม (วินาที → ชม.) */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * A CSV-only column rides right after its table counterpart: the real issue
 * number always follows the running number, even after a reorder.
 */
const CSV_ANCHORS: Record<string, string> = { issueNumber: "index" };

/**
 * Visible columns only, in the user's display order — CSV always matches
 * what the table shows.
 */
function matrix<T>(
  cols: Array<ExportCol<T>>,
  rows: T[],
  hidden: Set<string>,
  order: string[],
): CsvMatrix {
  const rank = new Map(order.map((k, i) => [k, i]));
  const position = (key: string): number => {
    const hit = rank.get(key);
    if (hit !== undefined) return hit;
    const anchor = CSV_ANCHORS[key];
    const at = anchor !== undefined ? rank.get(anchor) : undefined;
    return at !== undefined ? at + 0.5 : Number.MAX_SAFE_INTEGER;
  };
  const visible = cols
    .filter((c) => !hidden.has(c.key))
    .map((c, i) => ({ c, i }))
    .sort((a, b) => position(a.c.key) - position(b.c.key) || a.i - b.i)
    .map(({ c }) => c);
  return {
    keys: visible.map((c) => c.key),
    headers: visible.map((c) => c.header),
    data: rows.map((r, i) => visible.map((c) => c.value(r, i))),
  };
}

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n));
}

function parseView(raw: string): ReportView {
  const v = new URLSearchParams(raw).get("view") ?? "issues";
  return (REPORT_VIEW_ORDER as string[]).includes(v) ? (v as ReportView) : "issues";
}

function parseSort(raw: string, view: ReportView): SortState {
  const params = new URLSearchParams(raw);
  const def = DEFAULT_SORT[view];
  const field = params.get("sort");
  if (!field || !SORTABLE_FIELDS[view].includes(field)) return def;
  const dir = params.get("dir");
  return {
    field,
    dir: dir === "asc" ? "asc" : dir === "desc" ? "desc" : def.dir,
  };
}

function parsePage(raw: string): number {
  const n = Number(new URLSearchParams(raw).get("page") ?? "1");
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function paramsToFilters(raw: string): ReportFilters {
  const p = new URLSearchParams(raw);
  return {
    from: p.get("from") ?? "",
    to: p.get("to") ?? "",
    search: p.get("q") ?? "",
    assigneeIds: parseIds(p.get("assignee")),
    reporterIds: parseIds(p.get("reporter")),
    categoryIds: parseIds(p.get("category")),
    statusIds: parseIds(p.get("status")),
    priorityIds: parseIds(p.get("priority")),
    appIds: parseIds(p.get("app")),
    companyIds: parseIds(p.get("company")),
  };
}

function filtersToPatch(f: ReportFilters) {
  return {
    from: f.from || null,
    to: f.to || null,
    q: f.search.trim() || null,
    assignee: f.assigneeIds.length ? f.assigneeIds : null,
    reporter: f.reporterIds.length ? f.reporterIds : null,
    category: f.categoryIds.length ? f.categoryIds : null,
    status: f.statusIds.length ? f.statusIds : null,
    priority: f.priorityIds.length ? f.priorityIds : null,
    app: f.appIds.length ? f.appIds : null,
    company: f.companyIds.length ? f.companyIds : null,
  };
}

/**
 * Reports — one table, with the view dropdown (issues / assignee / app)
 * swapping the columns; every filter/sort/page value is mirrored into the URL
 * so a report link can be shared. Data comes from reports-api, which talks to
 * the real backend (GET /issues, /reports/summary).
 */
function ReportsScreen() {
  const t = useTranslations("Reports");
  /**
   * translator ของ namespace `Settings` — ใช้ตอน export ให้ CSV/PDF ออก
   * คำเดียวกับที่จอโชว์ (เช่น ประเภทสัญญา "ต่ออายุ"/"ซื้อชั่วโมง" ที่
   * ตารางอ่านจาก `Settings.renew` / `Settings.kindBuy`)
   */
  const st = useTranslations("Settings");
  /**
   * translator ของ namespace `Boards` — ชื่อ task type (`Boards.taskType.*`)
   * ของแถวรายละเอียด "รายการที่ตัด" ตอน export ให้คำเดียวกับที่ตารางกางบนจอ
   */
  const bt = useTranslations("Boards");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const userEmail = useAuthStore((s) => s.user?.email ?? "");

  /* ---------------- URL-derived state ---------------- */

  const rawKey = searchParams.toString();
  const view = useMemo(() => parseView(rawKey), [rawKey]);
  const filters = useMemo(() => paramsToFilters(rawKey), [rawKey]);
  const sort = useMemo(() => parseSort(rawKey, view), [rawKey, view]);
  const page = useMemo(() => parsePage(rawKey), [rawKey]);
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  const updateParams = useCallback(
    (patch: Record<string, string | number | number[] | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) {
          next.delete(key);
        } else {
          next.set(key, Array.isArray(value) ? value.join(",") : String(value));
        }
      }
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, pathname, router],
  );

  const changeFilters = useCallback(
    (next: ReportFilters) => updateParams({ ...filtersToPatch(next), page: null }),
    [updateParams],
  );

  const changeView = useCallback(
    (v: ReportView) =>
      updateParams({
        view: v,
        sort: DEFAULT_SORT[v].field,
        dir: DEFAULT_SORT[v].dir,
        page: null,
      }),
    [updateParams],
  );

  const changeSort = useCallback(
    (s: SortState) => updateParams({ sort: s.field, dir: s.dir, page: null }),
    [updateParams],
  );

  /* ---------------- options + rows ---------------- */

  const [options, setOptions] = useState<FilterOptions>(EMPTY_FILTER_OPTIONS);
  const [rows, setRows] = useState<ReportPage<ReportRows> | null>(null);
  /**
   * Which view `rows` actually belongs to. The URL flips `view` immediately on
   * a toolbar switch while the fetch effect only marks `loading` *after* the
   * render — without this, one frame renders the new view's columns against the
   * old view's rows (e.g. `r.operatorNames.length` on a summary row) and crashes.
   */
  const [rowsView, setRowsView] = useState<ReportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /**
   * `GET /apps` เสร็จแล้วหรือยัง — เฉพาะ view ตามบริษัทที่ต้องใช้
   * (แถวถูกสร้างจากมันในเบราว์เซอร์) กันระหว่างทางโผล่ "ไม่พบข้อมูล"
   * ทั้งที่ยังดึงสัญญาไม่เสร็จ
   */
  const [contractsReady, setContractsReady] = useState(false);

  // refresh 🔄 ต้องดึงสัญญาใหม่ด้วย — ไม่งั้นเพิ่มบริษัท/คู่ใหม่แล้วกดรีเฟรชไม่เห็น
  useEffect(() => {
    let cancelled = false;
    loadFilterOptions()
      .then((o) => {
        if (!cancelled) setOptions(o);
      })
      .catch(() => undefined)
      .finally(() => {
        // set ทั้งสองทาง — `loadFilterOptions` คืน EMPTY ตอนพังเองอยู่แล้ว
        if (!cancelled) setContractsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /**
   * view "company" — contract data, **rows built in the browser** from the
   * `GET /apps` payload already loaded (no API call; these rows are not
   * issues). Split from the fetch effect below so that a late-landing
   * `GET /apps` does not re-trigger a wasted refetch for the other views.
   *
   * Before the contracts land, nothing is written: `rowsView` still holds the
   * previous view, so `rowsView !== view` keeps the spinner up instead of
   * flashing "no data".
   */
  useEffect(() => {
    if (view !== "company" || !contractsReady) return;
    const built = buildCompanyRows(options.appContracts, filters, sort);
    const paged = paginate(built, page, REPORT_PAGE_SIZE);
    setRows(paged);
    setRowsView("company");
    setLoading(false);
    setError(null);
    // paginate() clamps out-of-range pages — keep the URL honest
    if (paged.page !== page) updateParams({ page: paged.page });
  }, [view, contractsReady, options.appContracts, filters, sort, page, updateParams]);

  useEffect(() => {
    if (view === "company") return; // handled by the client-side effect above
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchReportRows(view, { filters, sort, page })
      .then((res) => {
        if (cancelled) return;
        setRows(res);
        setRowsView(view);
        // paginate() clamps out-of-range pages — keep the URL honest
        if (res.page !== page) updateParams({ page: res.page });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("states.error"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters/sort derive from rawKey; refetch per param change is intended
  }, [view, filters, sort, page, reloadKey, updateParams, t]);

  /* ---------------- expandable person detail ---------------- */

  const [expandedPersonId, setExpandedPersonId] = useState<number | null>(null);
  const [personTasks, setPersonTasks] = useState<IssueRow[] | null>(null);
  const [personTasksLoading, setPersonTasksLoading] = useState(false);

  // collapsing on view/filter change keeps the detail honest
  useEffect(() => {
    setExpandedPersonId(null);
    setPersonTasks(null);
  }, [view, filterKey]);

  useEffect(() => {
    if (expandedPersonId == null) {
      setPersonTasks(null);
      return;
    }
    let cancelled = false;
    setPersonTasksLoading(true);
    fetchPersonTasks(expandedPersonId, filters)
      .then((r) => {
        if (!cancelled) setPersonTasks(r);
      })
      .catch(() => {
        if (!cancelled) setPersonTasks([]);
      })
      .finally(() => {
        if (!cancelled) setPersonTasksLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterKey carries the filter values; page/sort changes must not refetch the detail
  }, [expandedPersonId, filterKey, reloadKey]);

  const handleTogglePerson = useCallback((personId: number) => {
    setExpandedPersonId((cur) => (cur === personId ? null : personId));
  }, []);

  /* ---------------- expandable "รายการที่ตัด" (view ตามบริษัท) ---------------- */

  /**
   * **จำนวนงานที่ถูกตัด + "ใช้ไป" ของทุกรอบในหน้านี้** — `GET /apps/usage-counts`
   * ยิง **ครั้งเดียว** ต่อหน้า (ไม่ใช่ต่อแถว) · **รายรอบ** เพราะแถวของ view นี้
   * = 1 รอบอยู่แล้ว → คอลัมน์ "รายการที่ตัด" / "ใช้ไป" / "คงเหลือ" (จอ + CSV + PDF)
   * อ่านชุดเดียวกันทั้งหมด (เดิม "ใช้ไป/คงเหลือ" แยกไปใช้ map ระดับ**คู่** ทำให้
   * แถวที่เพิ่งซื้อชั่วโม์โชว์ "ใช้ไป 40 / คงเหลือ 0" ทั้งที่ยังไม่ได้ใช้ — ผู้ใช้ทัก)
   *
   * `status` แยก "ยังโหลด" (`…`) / "ดึงไม่ได้` (`—`) / "รู้ค่า" — ห้ามเดาเป็น 0
   */
  const [deductionCounts, setDeductionCounts] = useState<{
    status: "loading" | "ready" | "error";
    byRecord: Map<number, UsageCount>;
  }>({ status: "loading", byRecord: new Map() });

  /** `recordId` ของแถวกางอยู่ — `null` = ไม่มีแถวกาง */
  const [expandedRecordId, setExpandedRecordId] = useState<number | null>(null);
  /** รายการจริงของรอบที่กาง — โหลดตอนกดเท่านั้น (ไม่ยิงตอนเปิด view) */
  const [deductionDetail, setDeductionDetail] = useState<DeductionState>({ status: "loading" });
  const [deductionRetry, setDeductionRetry] = useState(0);

  /** `recordId → appId` จาก payload สัญญาที่โหลดไว้แล้ว (ไม่ต้องยิงเพิ่ม) */
  const recordAppId = useMemo(() => {
    const map = new Map<number, number>();
    for (const app of options.appContracts) {
      for (const link of app.companies) map.set(link.recordId, app.id);
    }
    return map;
  }, [options.appContracts]);

  /**
   * recordIds ของหน้าที่แสดง (view ตามบริษัท เท่านั้น) — **primitive** จึงใช้เป็น
   * dep ได้โดยไม่ต้องพึ่ง object `rows` ที่สร้างใหม่ทุก render (ไม่งั้นยิงซ้ำไม่หยุด)
   */
  const deductionIdsKey =
    view === "company" && rowsView === "company" && rows
      ? (rows.data as CompanyRow[])
          .map((r) => r.recordId)
          .filter((id): id is number => id != null)
          .join(",")
      : "";

  useEffect(() => {
    if (deductionIdsKey === "") {
      setDeductionCounts({ status: "loading", byRecord: new Map() });
      return;
    }
    const ids = deductionIdsKey.split(",").map((value) => Number.parseInt(value, 10));
    let cancelled = false;
    setDeductionCounts({ status: "loading", byRecord: new Map() });
    fetchUsageCounts(ids)
      .then((list) => {
        if (cancelled) return;
        setDeductionCounts({
          status: "ready",
          byRecord: new Map(list.map((item) => [item.recordId, item])),
        });
      })
      .catch(() => {
        if (cancelled) return;
        // fail-open: คอลัมน์โชว์ `—` ทุกแถว — ห้ามเดาเป็น "0 รายการ"
        setDeductionCounts({ status: "error", byRecord: new Map() });
      });
    return () => {
      cancelled = true;
    };
  }, [deductionIdsKey]);

  // แถวที่กางต้องเป็นของหน้า/ตัวกรองปัจจุบันเสมอ — เปลี่ยน = ยุบ (เหมือน person detail)
  useEffect(() => {
    setExpandedRecordId(null);
  }, [deductionIdsKey]);

  useEffect(() => {
    if (expandedRecordId == null) {
      setDeductionDetail({ status: "loading" });
      return;
    }
    const appId = recordAppId.get(expandedRecordId);
    if (appId == null) {
      // แถวถูกลบ/ไม่อยู่ใน payload สัญญาอีก → บอกตรง ๆ ว่าดึงไม่ได้ ไม่โชว์ว่า "ไม่มี"
      setDeductionDetail({ status: "error" });
      return;
    }
    let cancelled = false;
    setDeductionDetail({ status: "loading" });
    fetchPeriodUsage(appId, expandedRecordId)
      .then((data) => {
        if (!cancelled) setDeductionDetail({ status: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setDeductionDetail({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [expandedRecordId, recordAppId, deductionRetry]);

  const handleToggleDeduction = useCallback((recordId: number) => {
    setExpandedRecordId((cur) => (cur === recordId ? null : recordId));
  }, []);

  const retryDeductionDetail = useCallback(() => setDeductionRetry((n) => n + 1), []);

  /* ---------------- column prefs: show/hide + order (per view) ---------------- */

  const [prefs, setPrefs] = useState<ColumnPrefsByView>({});
  useEffect(() => {
    setPrefs(loadColumnPrefs());
  }, []);

  const hidden = useMemo(() => new Set(prefs[view]?.hidden ?? []), [prefs, view]);
  /** The view's columns in the user's display order (pinned first). */
  const columns = useMemo(() => orderedColumns(view, prefs[view]?.order), [prefs, view]);
  /** Same order as key list — what the CSV export follows. */
  const orderKeys = useMemo(() => columns.map((c) => c.key), [columns]);

  const updatePrefs = useCallback(
    (updater: (cur: ColumnPrefs) => ColumnPrefs) => {
      setPrefs((prev) => {
        const cur = prev[view] ?? { hidden: [], order: [] };
        const next = { ...prev, [view]: updater(cur) };
        saveColumnPrefs(next);
        return next;
      });
    },
    [view],
  );

  const toggleColumn = useCallback(
    (key: string) => {
      updatePrefs((cur) => {
        const isHidden = cur.hidden.includes(key);
        // keep at least one column on screen — an empty table helps nobody
        if (!isHidden && columns.length - cur.hidden.length <= 1) return cur;
        return {
          ...cur,
          hidden: isHidden ? cur.hidden.filter((k) => k !== key) : [...cur.hidden, key],
        };
      });
    },
    [updatePrefs, columns.length],
  );

  /** Drag & drop result from the column menu — persisted immediately. */
  const reorderColumns = useCallback(
    (order: string[]) => {
      updatePrefs((cur) => ({ ...cur, order }));
    },
    [updatePrefs],
  );

  /* ---------------- person-detail table prefs (own slot, same store) ------- */

  const detailHidden = useMemo(
    () => new Set(prefs[DETAIL_PREF_KEY]?.hidden ?? []),
    [prefs],
  );
  /** The expanded person-row columns in display order (ลำดับ pinned first). */
  const detailColumns = useMemo(
    () => orderedDetailColumns(prefs[DETAIL_PREF_KEY]?.order),
    [prefs],
  );

  const updateDetailPrefs = useCallback(
    (updater: (cur: ColumnPrefs) => ColumnPrefs) => {
      setPrefs((prev) => {
        const cur = prev[DETAIL_PREF_KEY] ?? { hidden: [], order: [] };
        const next = { ...prev, [DETAIL_PREF_KEY]: updater(cur) };
        saveColumnPrefs(next);
        return next;
      });
    },
    [],
  );

  const toggleDetailColumn = useCallback(
    (key: string) => {
      updateDetailPrefs((cur) => {
        const isHidden = cur.hidden.includes(key);
        // same floor as the summary grid — one column minimum on screen
        if (!isHidden && detailColumns.length - cur.hidden.length <= 1) return cur;
        return {
          ...cur,
          hidden: isHidden ? cur.hidden.filter((k) => k !== key) : [...cur.hidden, key],
        };
      });
    },
    [updateDetailPrefs, detailColumns.length],
  );

  const reorderDetailColumns = useCallback(
    (order: string[]) => {
      updateDetailPrefs((cur) => ({ ...cur, order }));
    },
    [updateDetailPrefs],
  );

  /* ---------------- export ---------------- */

  const canExport = can("report.export");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  /**
   * Assignee CSV = one flat sheet: the visible detail columns ride after the
   * summary ones, and each person's tasks follow their summary row (name in
   * `person`). Same fetch — and same 50-task cap — as the row on screen, one
   * person at a time so the export doesn't fan out into dozens of requests.
   */
  const fetchDetailForExport = useCallback(
    async (all: ReportRows[]): Promise<Map<number, IssueRow[]>> => {
      const byPerson = new Map<number, IssueRow[]>();
      for (const r of all as SummaryRow[]) {
        if (r.isTotal || r.personId == null) continue; // unassigned/total rows can't expand
        byPerson.set(r.personId, await fetchPersonTasks(r.personId, filters));
      }
      return byPerson;
    },
    [filters],
  );

  /** Detail export columns keyed like the registry — values mirror the screen. */
  const detailExportCols = useCallback(
    (): Array<ExportCol<IssueRow>> => [
      { key: "index", header: t("columns.index"), value: (_r, i) => i + 1 },
      { key: "title", header: t("columns.title"), value: (r) => r.title },
      { key: "status", header: t("columns.status"), value: (r) => r.statusName ?? "" },
      { key: "category", header: t("columns.category"), value: (r) => r.categoryName ?? "" },
      { key: "hoursActual", header: t("columns.hoursActual"), value: (r) => r.hoursActual },
      { key: "hoursEntered", header: t("columns.hoursEntered"), value: (r) => r.hoursEntered },
    ],
    [t],
  );

  /**
   * คอลัมน์รายละเอียดของ view **ตามบริษัท** — "รายการที่ตัด" ที่กางใต้แถวบนจอ
   * ออกมาเป็นคอลัมน์เสริมต่อท้าย (แพตเทิร์นเดียวกับ assignee detail) · หัวข้อ
   * ใช้ key `Settings.deduction*` เดียวกับตารางกางบนจอ จึงไม่ต้องเพิ่ม key ใหม่
   * และ task type ใช้ `Boards.taskType.*` เหมือนกัน (จอ/CSV/PDF ห้ามต่างกัน)
   */
  const companyDetailExportCols = useCallback(
    (): Array<ExportCol<PeriodIssue>> => [
      {
        key: "deductionIssueNo",
        header: st("deductionIssueNo"),
        value: (i) => i.issueNumber ?? "—",
      },
      { key: "deductionTitle", header: st("deductionTitle"), value: (i) => i.title },
      {
        key: "deductionType",
        header: st("deductionType"),
        value: (i) => (i.taskType ? bt(`taskType.${i.taskType}`) : "—"),
      },
      { key: "deductionHours", header: st("deductionHours"), value: (i) => i.hours },
      {
        key: "deductionAt",
        header: st("deductionAt"),
        // fmtDate เดียวกับตารางกางบนจอ — ห้ามใช้ formatDay (คนละฟอร์แมตกับจอ)
        value: (i) =>
          i.deductedAt
            ? new Date(i.deductedAt).toLocaleDateString(locale, { dateStyle: "short" })
            : "—",
      },
      {
        key: "deductionAssignee",
        header: st("deductionAssignee"),
        value: (i) => i.assigneeName ?? st("deductionUnassigned"),
      },
    ],
    [st, bt, locale],
  );

  const buildExport = useCallback(
    /**
     * `exportCounts` — ใช้เฉพาะตอน export: นับ "รายการที่ตัด" ของ**ทุกแถวใน
     * ไฟล์** (state `deductionCounts` บนจอจำได้เฉพาะแถวของหน้าปัจจุบัน
     * ถ้าไม่ส่ง แถวนอกหน้า 1 จะexportว่างเปล่า)
     */
    (all: ReportRows[], exportCounts?: Map<number, UsageCount>): CsvMatrix => {
      const fmt = (iso: string) =>
        new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
      const fmtDay = (iso: string) =>
        new Date(iso).toLocaleDateString(locale, { dateStyle: "short" });
      /**
       * วันที่สัญญา (`YYYY-MM-DD`) — ใช้ `formatDay` ของ `app-expiry` เหมือน
       * ตารางจอ เพราะ `new Date("2026-11-05")` parse เป็น UTC midnight จะ
       * เพี้ยน 1 วันใน timezone ติดลบ และ CSV/PDF ต้องโชว์ตรงกับจอ
       */
      const fmtContractDay = (iso: string | null) =>
        iso ? formatDay(iso, locale) : "";
      const fmtDuration = (totalSeconds: number) => {
        const totalMinutes = Math.round((totalSeconds || 0) / 60);
        return `${t("duration.hours", { h: Math.floor(totalMinutes / 60) })} ${t("duration.minutes", { m: totalMinutes % 60 })}`;
      };
      const sumLabel = (r: SummaryRow) =>
        r.labelKey ? t(`columns.${r.labelKey}`) : (r.label ?? "");

      /**
       * คอลัมน์สัญญา — ค่าเดียวกับที่ตารางจอโชว์ (จอ/CSV/PDF ห้ามต่างกัน)
       *
       * - บริษัท (view รายการปัญหา): **บริษัทของผู้แจ้งงาน** ชื่อเดียว
       *   (`IssueRow.companyName`) — ไม่ใช่ชื่อบริษัททั้งหมดของแอปอีกแล้ว
       * - 3 ตัวล่าง (view ตามบริษัท): **รายรอบ** — ของแถวนั้น (1 แถว = 1 รอบ)
       *   อ่านจาก `usage-counts` (`exportCounts` = ชุดที่ยิงใหม่ตอน export ทุกหน้า)
       *   ค่าเดียวกับคอลัมน์ "ใช้ไป"/"คงเหลือ" บนจอ · ยังโหลด/ดึงไม่ได้/ไม่รู้จัก
       *   แถวนั้น → "" (ห้ามโชว์ MA เต็มก้อนหรือ 0 เพราะยังไม่รู้ค่าจริง)
       *
       * (`MA_DEDUCTION_PAUSED` → `periodUsedOf` คืน 0 ให้เอง; ยังไม่กรอก MA → "")
       */
      const countsMap = exportCounts ?? deductionCounts.byRecord;
      const usedOf = (r: CompanyRow): number | null =>
        r.recordId == null ? null : periodUsedOf(countsMap, r.recordId);
      const usedHoursOf = (r: CompanyRow) => {
        const used = usedOf(r);
        return used === null ? "" : used;
      };
      const remainingOf = (r: CompanyRow) => {
        if (r.maHours == null) return "";
        const used = usedOf(r);
        return used === null ? "" : round1(r.maHours - used);
      };
      /** จำนวนงานที่ถูกตัดของ **รอบนั้น** — คอลัมน์ "รายการที่ตัด" (CSV ตรงกับจอ) */
      const deductedCountOf = (r: CompanyRow) => {
        if (r.recordId == null) return "";
        const entry = (exportCounts ?? deductionCounts.byRecord).get(r.recordId);
        return entry ? entry.count : "";
      };

      switch (view) {
        case "issues": {
          const rs = all as IssueRow[];
          const cols: Array<ExportCol<IssueRow>> = [
            { key: "index", header: t("columns.index"), value: (_r, i) => i + 1 },
            { key: "issueNumber", header: t("columns.issueNumber"), value: (r) => `#${r.issueNumber}` },
            { key: "receivedAt", header: t("columns.receivedAt"), value: (r) => (r.receivedAt ? fmt(r.receivedAt) : "") },
            { key: "assignee", header: t("columns.assignee"), value: (r) => r.assigneeName ?? t("columns.unassigned") },
            { key: "reporter", header: t("columns.reporter"), value: (r) => r.reporterName ?? "" },
            { key: "title", header: t("columns.title"), value: (r) => r.title },
            { key: "description", header: t("columns.description"), value: (r) => r.description },
            { key: "analysis", header: t("columns.analysisCause"), value: (r) => r.analysisCause ?? "" },
            { key: "resolution", header: t("columns.resolution"), value: (r) => r.resolution ?? "" },
            { key: "workStarted", header: t("columns.workStarted"), value: (r) => (r.workStartedAt ? fmt(r.workStartedAt) : "") },
            { key: "workEnded", header: t("columns.workEnded"), value: (r) => (r.workEndedAt ? fmt(r.workEndedAt) : "") },
            { key: "duration", header: t("columns.duration"), value: (r) => fmtDuration(r.durationSeconds) },
            { key: "enteredTime", header: t("columns.enteredTime"), value: (r) => fmtDuration(Math.round(r.hoursEntered * 3600)) },
            { key: "operators", header: t("columns.operators"), value: (r) => r.operatorNames?.join(", ") ?? "" },
            { key: "status", header: t("columns.status"), value: (r) => r.statusName ?? "" },
            { key: "category", header: t("columns.category"), value: (r) => r.categoryName ?? "" },
            { key: "app", header: t("columns.app"), value: (r) => r.appName ?? "" },
            // บริษัท = ของผู้แจ้งงาน — ตรงกับที่จอโชว์ (1 คน = 1 บริษัท)
            { key: "company", header: t("columns.company"), value: (r) => r.companyName ?? "" },
            { key: "priority", header: t("columns.priority"), value: (r) => r.priorityName ?? "" },
          ];
          return matrix(cols, rs, hidden, orderKeys);
        }
        case "assignee": {
          const rs = all as SummaryRow[];
          const cols: Array<ExportCol<SummaryRow>> = [
            { key: "person", header: t("columns.person"), value: (r) => sumLabel(r) },
            { key: "issueCount", header: t("columns.issueCount"), value: (r) => r.issueCount },
            { key: "openCount", header: t("columns.openCount"), value: (r) => r.openCount },
            { key: "hoursActual", header: t("columns.hoursActual"), value: (r) => r.hoursActual },
            { key: "hoursEntered", header: t("columns.hoursEntered"), value: (r) => r.hoursEntered },
            { key: "lastAt", header: t("columns.lastAt"), value: (r) => (r.lastAt ? fmtDay(r.lastAt) : "") },
          ];
          return matrix(cols, rs, hidden, orderKeys);
        }
        case "app": {
          const rs = all as SummaryRow[];
          const cols: Array<ExportCol<SummaryRow>> = [
            { key: "app", header: t("columns.app"), value: (r) => sumLabel(r) },
            { key: "issueCount", header: t("columns.issueCount"), value: (r) => r.issueCount },
            { key: "openCount", header: t("columns.openCount"), value: (r) => r.openCount },
            { key: "medianActualMinutes", header: t("columns.medianActual"), value: (r) => r.medianActualMinutes ?? "" },
            { key: "medianEnteredMinutes", header: t("columns.medianEntered"), value: (r) => r.medianEnteredMinutes ?? "" },
            { key: "topAssignee", header: t("columns.topAssignee"), value: (r) => r.topAssignee ?? "" },
            { key: "lastAt", header: t("columns.lastAt"), value: (r) => (r.lastAt ? fmtDay(r.lastAt) : "") },
          ];
          return matrix(cols, rs, hidden, orderKeys);
        }
        case "company": {
          const rs = all as CompanyRow[];
          const cols: Array<ExportCol<CompanyRow>> = [
            { key: "company", header: t("columns.company"), value: (r) => r.companyName ?? "" },
            { key: "app", header: t("columns.app"), value: (r) => r.appName },
            // ประเภทสัญญา — คำเดียวกับ chip บนจอ (จอ/CSV/PDF ห้ามต่างกัน)
            {
              key: "kind",
              header: t("columns.type"),
              value: (r) => (r.kind == null ? "" : r.kind === "buy" ? st("kindBuy") : st("renew")),
            },
            { key: "startedAt", header: t("columns.startedAt"), value: (r) => fmtContractDay(r.startedAt) },
            { key: "expiresAt", header: t("columns.expiresAt"), value: (r) => fmtContractDay(r.expiresAt) },
            { key: "maHours", header: t("columns.maHours"), value: (r) => r.maHours ?? "" },
            { key: "usedHours", header: t("columns.usedHours"), value: (r) => usedHoursOf(r) },
            { key: "remaining", header: t("columns.remaining"), value: (r) => remainingOf(r) },
            // ระดับแถว (แถว = 1 รอบ) — ค่าจาก `usage-counts` เหมือนที่จอโชว์
            { key: "deductedCount", header: t("columns.deductedCount"), value: (r) => deductedCountOf(r) },
          ];
          return matrix(cols, rs, hidden, orderKeys);
        }
        default:
          return { keys: [], headers: [], data: [] };
      }
    },
    [view, locale, t, st, hidden, orderKeys, deductionCounts],
  );

  /**
   * **view ตามบริษัท — export พร้อมแถวรายละเอียด "รายการที่ตัด"** ใต้แถวสัญญา
   * (แพตเทิร์นเดียวกับ assignee detail) · ต่างจากจอที่นับ**เฉพาะแถวของหน้า
   * ปัจจุบัน**: export ออก**ทุกแถว**ของ filter จึงต้องยิง `usage-counts` ใหม่
   * ครบทุก `recordId` (แยก chunk ละ 100 — `MAX_USAGE_COUNT_IDS` ตัดทิ้งเกินนั้น)
   * ไม่งั้นแถวนอกหน้า 1 จะexport **ว่างเปล่า** (บั๊กเดิม)
   *
   * ดึงรายการจริง**เฉพาะแถวที่นับ > 0** และ**ทีละแถว** (กันยิงพร้อมกันเป็นสิบ
   * เหมือน `fetchDetailForExport`) · **fail-open ทุกขั้น**: ยิงนับไม่ได้ → ใช้ตัว
   * ที่หน้าจอโหลดไว้ (ขาดแถวต่างหน้าก็ยังดีกว่าล้มทั้งไฟล์) · ยิงรายการไม่ได้ →
   * ข้ามรายละเอียดของแถวนั้น แถวสรุป + ตัวนับยังอยู่ครบ — ห้ามให้คำขอเดียว
   * ทำให้ export ทั้งไฟล์พัง
   *
   * `summaryRows` ทำเครื่องหมายแถวสัญญาให้ PDF เติมพื้น/ตัวหนา (CSV ไม่ใช้)
   */
  const buildCompanyExportWithDetail = useCallback(
    async (all: ReportRows[]): Promise<CsvMatrix> => {
      const rs = all as CompanyRow[];
      const recordIds = rs
        .map((r) => r.recordId)
        .filter((id): id is number => id != null);

      /** นับของทุกแถวในไฟล์ — `null` = ยังไม่รู้ (fail-open ห้ามเดาเป็น 0) */
      let exportCounts: Map<number, UsageCount> | undefined;
      if (recordIds.length > 0) {
        const merged = new Map<number, UsageCount>();
        try {
          for (let i = 0; i < recordIds.length; i += 100) {
            const chunk = await fetchUsageCounts(recordIds.slice(i, i + 100));
            for (const entry of chunk) merged.set(entry.recordId, entry);
          }
          exportCounts = merged;
        } catch {
          // ยิงนับไม่ได้ → ใช้ตัวของหน้าจอ (แถวต่างหน้าจะว่าง — ดีกว่าล้ม export)
          exportCounts = deductionCounts.status === "ready" ? deductionCounts.byRecord : undefined;
        }
      }

      const summary = buildExport(all, exportCounts);
      if (recordIds.length === 0) return summary; // ไม่มีรอบผูกแอป → ไม่มีรายละเอียด

      /**
       * รายการจริงของแถวที่นับ > 0 — `recordId → งานที่ถูกตัด` · ข้ามแถวที่
       * ไม่รู้ค่านับ (ยิงนับล้มเหลว) เพราะถ้าเดาว่า "0" แล้วจริง ๆ มีรายการ
       * รายงานก็จะเงียบหายเหมือนกัน — ปล่อยให้แถวสรุปกับตัวนับนำทางไปเอง
       */
      const detailByRecord = new Map<number, PeriodIssue[]>();
      for (const r of rs) {
        if (r.recordId == null) continue;
        const count = exportCounts?.get(r.recordId)?.count;
        if (count == null || count <= 0) continue;
        const appId = recordAppId.get(r.recordId);
        if (appId == null) continue; // แถวหายจาก payload สัญญา → ข้าม (เหมือนฝั่งจอ)
        try {
          const period = await fetchPeriodUsage(appId, r.recordId);
          detailByRecord.set(r.recordId, period.issues);
        } catch {
          // fail-open: ข้ามรายละเอียดของแถวนี้ เหลือแถวสรุปกับตัวนับตามเดิม
        }
      }
      if (detailByRecord.size === 0) return summary; // ไม่มีรายการ → หน้าตาไฟล์เท่าเดิม

      const detailCols = companyDetailExportCols();
      const summaryKeySet = new Set(summary.keys);
      const extra = detailCols.filter((c) => !summaryKeySet.has(c.key));
      const companyIdx = summary.keys.indexOf("company");

      const data: CsvMatrix["data"] = [];
      const summaryRows: number[] = [];
      summary.data.forEach((sumRow, i) => {
        summaryRows.push(data.length);
        data.push([...sumRow, ...extra.map(() => "")]);
        const r = rs[i];
        if (r?.recordId == null) return;
        const issues = detailByRecord.get(r.recordId);
        if (!issues || issues.length === 0) return;
        // ชื่อบริษัทซ้ำทุกแถว detail — ให้ CSV แยกกลุ่มได้ (เหมือน assignee ซ้ำ `person`)
        const label = r.companyName ?? "";
        issues.forEach((issue) => {
          const row = summary.keys.map((_k, ki) => (ki === companyIdx ? label : ""));
          data.push([...row, ...extra.map((c) => c.value(issue, 0))]);
        });
      });

      return {
        keys: [...summary.keys, ...extra.map((c) => c.key)],
        headers: [...summary.headers, ...extra.map((c) => c.header)],
        data,
        summaryRows,
      };
    },
    [buildExport, deductionCounts, recordAppId, companyDetailExportCols],
  );

  /**
   * The export body — one flat sheet shared by CSV **and** PDF, so the two
   * files can never drift. In the assignee view each person's task rows ride
   * under their summary row (name in `person`), and the detail columns the
   * user showed come along as extra columns at the end — except the shared
   * ชั่วโมงจริง/ชั่วโมงกรอก, which fill from the task itself so a column never
   * appears twice. `summaryRows` records which indices are the aggregates
   * (the PDF styles them; the CSV just writes the rows out).
   *
   * The **company** view delegates to `buildCompanyExportWithDetail` — its
   * "รายการที่ตัด" detail (the rows you expand on screen) rides the same way.
   */
  const buildExportWithDetail = useCallback(
    async (all: ReportRows[]): Promise<CsvMatrix> => {
      if (view === "company") return buildCompanyExportWithDetail(all);
      const summary = buildExport(all);
      if (view !== "assignee") return summary;

      // display order (as the on-screen table shows), not registry order
      const detailByKey = new Map(detailExportCols().map((c) => [c.key, c]));
      const detailCols = detailColumns
        .filter((c) => !detailHidden.has(c.key))
        .map((c) => detailByKey.get(c.key))
        .filter((c): c is ExportCol<IssueRow> => c !== undefined);
      // every detail column hidden = nothing to splice under the summaries
      if (detailCols.length === 0) return summary;
      const summaryKeySet = new Set(summary.keys);
      const extra = detailCols.filter((c) => !summaryKeySet.has(c.key));
      const detailKeySet = new Set(detailCols.map((c) => c.key));
      const personIdx = summary.keys.indexOf("person");
      const tasksByPerson = await fetchDetailForExport(all);

      const data: CsvMatrix["data"] = [];
      const summaryRows: number[] = [];
      summary.data.forEach((sumRow, i) => {
        summaryRows.push(data.length);
        data.push([...sumRow, ...extra.map(() => "")]);
        const r = all[i] as SummaryRow;
        if (r.isTotal || r.personId == null) return; // unassigned/total rows have no detail
        const label = r.labelKey ? t(`columns.${r.labelKey}`) : (r.label ?? "");
        const tasks = tasksByPerson.get(r.personId) ?? [];
        tasks.forEach((task, ti) => {
          const row = summary.keys.map((k, ki) => {
            if (ki === personIdx) return label;
            // summary-only columns (งานทั้งหมด / ยังเปิดอยู่ / งานล่าสุด) stay empty
            if (!detailKeySet.has(k)) return "";
            if (k === "hoursActual") return task.hoursActual;
            if (k === "hoursEntered") return task.hoursEntered;
            return "";
          });
          data.push([...row, ...extra.map((c) => c.value(task, ti))]);
        });
      });

      return {
        keys: [...summary.keys, ...extra.map((c) => c.key)],
        headers: [...summary.headers, ...extra.map((c) => c.header)],
        data,
        summaryRows,
      };
    },
    [view, buildExport, buildCompanyExportWithDetail, t, detailHidden, detailColumns, detailExportCols, fetchDetailForExport],
  );

  /**
   * Rows behind an export — **same set CSV and PDF share**, so the two files
   * can never diverge.
   *
   * `company` view never hits the API: its rows are contract pairs built from
   * `GET /apps` in the browser (see the company effect). Everything else keeps
   * walking the real endpoints page by page.
   */
  const loadAllRows = useCallback(async (): Promise<ReportRows[]> => {
    if (view === "company") {
      if (!contractsReady) return [];
      return buildCompanyRows(options.appContracts, filters, sort);
    }
    return fetchAllReportRows(view, { filters, sort });
  }, [view, contractsReady, options.appContracts, filters, sort]);

  const handleExportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const all = await loadAllRows();
      const { headers, data } = await buildExportWithDetail(all);
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`report-${view}-${stamp}.csv`, buildCsv(headers, data));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("states.exportFailed"));
    } finally {
      setExporting(false);
    }
  }, [loadAllRows, buildExportWithDetail, view, t]);

  /* ---------------- export header text (shared by the PDF header) ---------------- */

  /**
   * PDF "ช่วงวันที่" — **ห้ามโชว์ใน view ตามบริษัท** เพราะช่วงวันที่ถูกซ่อน
   * และไม่ได้กรองอะไรในมุมมองนี้ (แถวคือสัญญา ไม่ใช่งาน) — ปล่อยโชว์
   * จะเหมือนบอกว่ากรองแล้วทั้งที่ไม่ได้กรอง
   */
  const rangeText =
    view === "company"
      ? t("print.allRange")
      : filters.from || filters.to
        ? `${filters.from || "…"} – ${filters.to || "…"}`
        : t("print.allRange");
  const generatedText = new Date().toLocaleString(locale, {
    dateStyle: "short",
    timeStyle: "short",
  });

  /**
   * Export PDF = pdfmake (see lib/report-pdf): every row matching the filters
   * (same set, order and columns as CSV — not just the page on screen), A4
   * landscape with the Thai font embedded. Replaces window.print(), which
   * could only hand orientation control to the browser dialog.
   */
  const handleExportPdf = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const all = await loadAllRows();
      const { keys, headers, data, summaryRows } = await buildExportWithDetail(all);
      const stamp = new Date().toISOString().slice(0, 10);
      await exportReportPdf({
        view,
        keys,
        headers,
        data,
        summaryRows,
        title: t("title"),
        viewLabel: t(`views.${view}`),
        rangeLine: t("print.range", { range: rangeText }),
        generatedLine: t("print.generated", {
          date: generatedText,
          user: userEmail || "—",
        }),
        filename: `report-${view}-${stamp}.pdf`,
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("states.exportFailed"));
    } finally {
      setExporting(false);
    }
  }, [
    loadAllRows,
    buildExportWithDetail,
    view,
    rangeText,
    generatedText,
    userEmail,
    t,
  ]);

  /* ---------------- render ---------------- */

  return (
    <RequirePermission permission="report.view">
      <DashboardLayout>
        <Box>
          <Box sx={{ mb: 2.5 }}>
            <ReportsToolbar
              view={view}
              onViewChange={changeView}
              filters={filters}
              onFiltersChange={changeFilters}
              options={options}
              onRefresh={() => setReloadKey((k) => k + 1)}
              onExportPdf={handleExportPdf}
              onExportCsv={handleExportCsv}
              canExport={canExport}
              exporting={exporting}
              hidden={hidden}
              onToggleColumn={toggleColumn}
              columns={columns}
              onReorder={reorderColumns}
              detailColumns={detailColumns}
              detailHidden={detailHidden}
              onToggleDetailColumn={toggleDetailColumn}
              onReorderDetail={reorderDetailColumns}
            />
          </Box>

          {loading || (rowsView !== view && !error) ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
                  {t("states.retry")}
                </Button>
              }
            >
              <Typography>{error}</Typography>
            </Alert>
          ) : !rows || rows.data.length === 0 ? (
            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                bgcolor: "background.paper",
                py: 8,
                textAlign: "center",
              }}
            >
              <BarChartIcon sx={{ fontSize: 48, color: "text.disabled" }} />
              <Typography variant="h6" fontWeight={700} sx={{ color: "navy.main", mt: 1 }}>
                {t("states.emptyTitle")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t("states.emptyDesc")}
              </Typography>
            </Box>
          ) : (
            <ReportsTable
              view={view}
              rows={rows.data}
              total={rows.total}
              page={rows.page}
              limit={rows.limit}
              sort={sort}
              onSortChange={changeSort}
              hidden={hidden}
              columns={columns}
              detailHidden={detailHidden}
              detailColumns={detailColumns}
              expandedPersonId={expandedPersonId}
              personTasks={personTasks}
              personTasksLoading={personTasksLoading}
              onTogglePerson={handleTogglePerson}
              deductions={{
                counts: deductionCounts,
                expandedRecordId,
                detail: deductionDetail,
                onToggle: handleToggleDeduction,
                onRetryDetail: retryDeductionDetail,
              }}
            />
          )}

          {rows && rowsView === view && !loading && !error && (
            <Box>
              <Pagination
                page={rows.page}
                totalPages={rows.totalPages}
                total={rows.total}
                limit={rows.limit}
                onPageChange={(p) => updateParams({ page: p })}
              />
            </Box>
          )}
        </Box>

        <Snackbar
          open={Boolean(exportError)}
          autoHideDuration={5000}
          onClose={() => setExportError(null)}
        >
          <Alert severity="error" variant="filled" onClose={() => setExportError(null)}>
            {exportError}
          </Alert>
        </Snackbar>
      </DashboardLayout>
    </RequirePermission>
  );
}

export default function ReportsPage() {
  // `useSearchParams` must sit under a Suspense boundary on statically
  // rendered pages — the same pattern the login/boards pages use.
  return (
    <Suspense fallback={null}>
      <ReportsScreen />
    </Suspense>
  );
}
