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
  buildCsv,
  DEFAULT_SORT,
  downloadCsv,
  fetchAllReportRows,
  fetchPersonTasks,
  fetchReportRows,
  loadFilterOptions,
  EMPTY_FILTER_OPTIONS,
  SORTABLE_FIELDS,
} from "@/lib/reports-api";
import type {
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
};

/** One exportable column: key mirrors the show/hide registry. */
interface ExportCol<T> {
  key: string;
  header: string;
  value: (row: T, index: number) => string | number;
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

  useEffect(() => {
    let cancelled = false;
    loadFilterOptions()
      .then((o) => {
        if (!cancelled) setOptions(o);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
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

  const buildExport = useCallback(
    (all: ReportRows[]): CsvMatrix => {
      const fmt = (iso: string) =>
        new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
      const fmtDay = (iso: string) =>
        new Date(iso).toLocaleDateString(locale, { dateStyle: "short" });
      const fmtDuration = (totalSeconds: number) => {
        const totalMinutes = Math.round((totalSeconds || 0) / 60);
        return `${t("duration.hours", { h: Math.floor(totalMinutes / 60) })} ${t("duration.minutes", { m: totalMinutes % 60 })}`;
      };
      const sumLabel = (r: SummaryRow) =>
        r.labelKey ? t(`columns.${r.labelKey}`) : (r.label ?? "");

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
        default:
          return { keys: [], headers: [], data: [] };
      }
    },
    [view, locale, t, hidden, orderKeys],
  );

  const handleExportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const all = await fetchAllReportRows(view, { filters, sort });
      const summary = buildExport(all);
      let headers = summary.headers;
      let data = summary.data;

      if (view === "assignee") {
        /**
         * One flat sheet: each person's task rows ride under their summary
         * row, with the name in `person`. The detail columns the user showed
         * come along as extra columns at the end — except the shared
         * ชั่วโมงจริง/ชั่วโมงกรอก, which fill from the task itself so a column
         * never appears twice.
         */
        const detailCols = detailExportCols().filter((c) => !detailHidden.has(c.key));
        const summaryKeySet = new Set(summary.keys);
        const extra = detailCols.filter((c) => !summaryKeySet.has(c.key));
        const detailKeySet = new Set(detailCols.map((c) => c.key));
        const personIdx = summary.keys.indexOf("person");
        const tasksByPerson = await fetchDetailForExport(all);

        headers = [...summary.headers, ...extra.map((c) => c.header)];
        data = [];
        summary.data.forEach((sumRow, i) => {
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
      }

      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`report-${view}-${stamp}.csv`, buildCsv(headers, data));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : t("states.exportFailed"));
    } finally {
      setExporting(false);
    }
  }, [
    view,
    filters,
    sort,
    buildExport,
    t,
    detailHidden,
    detailExportCols,
    fetchDetailForExport,
  ]);

  /* ---------------- export header text (shared by the PDF header) ---------------- */

  const rangeText =
    filters.from || filters.to
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
      const all = await fetchAllReportRows(view, { filters, sort });
      const { keys, headers, data } = buildExport(all);
      const stamp = new Date().toISOString().slice(0, 10);
      await exportReportPdf({
        view,
        keys,
        headers,
        data,
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
    view,
    filters,
    sort,
    buildExport,
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
          <Box sx={{ mb: 3 }}>
            <Typography variant="h4" fontWeight={700} sx={{ color: "navy.main" }}>
              {t("title")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t("subtitle")}
            </Typography>
          </Box>

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
