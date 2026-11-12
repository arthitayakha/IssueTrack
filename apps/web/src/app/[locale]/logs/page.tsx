"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import PersonIcon from "@mui/icons-material/Person";
import CategoryIcon from "@mui/icons-material/Category";
import { useLocale, useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { Pagination } from "@/components/pagination";
import { useNotification } from "@/components/notification";
import { usePermissions } from "@/lib/permissions";
import { fetchActivityLogs, fetchAllLogRows, fetchLogActors } from "@/lib/logs-api";
import type { LogFilters, PaginatedLogs } from "@/lib/logs-api";
import { buildCsv, downloadCsv } from "@/lib/reports-api";
import { RANGE_LABEL_KEYS, RANGE_PRESET_KEYS, rangeDates } from "@/lib/date-presets";
import { DateRangeIconButton, type DateRangePreset, type DateRangeValue } from "@/components/date-range-select";
import { FilterPanel, type FilterSectionData } from "@/components/filter-panel";
import { ExportButton } from "@/components/export-button";
import { timeAgo } from "@/lib/time-ago";
import type { ActivityActorDto, ActivityLogDto, ActivityLogType } from "@kanban/shared";
import { ACTIVITY_GROUP_ORDER } from "@kanban/shared";
import DataTable, {
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/data-table";

const PAGE_SIZE = 10;

/**
 * Every group the feed can be narrowed to — the order comes from shared so the
 * filter and the API can never disagree on what the fifth group even is.
 */
const TYPES: Array<ActivityLogType | ""> = ["", ...ACTIVITY_GROUP_ORDER];

/**
 * Chip colour per group — pulled from the MUI palette, never a raw hex.
 * `Record<ActivityLogType, …>` is exhaustive on purpose: a new group without a
 * colour here is a type error, not an `undefined.main` crash on the page.
 */
const TYPE_COLOR: Record<
  ActivityLogType,
  "info" | "success" | "warning" | "primary" | "secondary"
> = {
  card: "info",
  comment: "success",
  rule: "warning",
  user: "primary",
  data: "secondary",
};

/** `card.edited` lists these keys — the same ones the board writes. */
const FIELD_KEYS = [
  "title",
  "description",
  "analysisCause",
  "resolution",
  "priority",
  "category",
  "label",
  "labels",
] as const;

function str(value: unknown): string {
  return typeof value === "string" && value ? value : "";
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The free-text column: turns a row's payload into one readable sentence
 * ("ลาก: Backlog → Doing", "แก้ไข: หัวข้อ, ความสำคัญ"). Falls back to nothing
 * when the action is unknown — the action chip still tells the story.
 */
function describe(row: ActivityLogDto, t: (key: string, values?: Record<string, string | number>) => string): string {
  const p = row.payload ?? {};
  switch (row.action) {
    case "card.created":
    case "card.deleted":
    case "card.restored": {
      const title = str(p.title);
      return title ? t("detail.title", { title }) : "";
    }
    case "card.moved": {
      const from = str(p.from) || t("detail.noStatus");
      const to = str(p.to);
      return to ? t("detail.move", { from, to }) : "";
    }
    case "card.edited": {
      const fields = Array.isArray(p.fields) ? p.fields : [];
      const labels = fields
        .map((f) => (FIELD_KEYS.includes(f as (typeof FIELD_KEYS)[number]) ? t(`fields.${f}`) : String(f)))
        .filter(Boolean);
      return labels.length ? t("detail.fields", { fields: labels.join(", ") }) : "";
    }
    case "card.assigned": {
      const from = num(p.from);
      const to = num(p.to);
      if (to === null) return t("detail.unassigned");
      if (from === null) return t("detail.assignedTo", { id: to });
      return t("detail.assignChanged", { from, to });
    }
    case "card.unlocked": {
      const status = str(p.status);
      return status ? t("detail.status", { status }) : "";
    }
    case "comment.created":
    case "comment.updated":
    case "comment.deleted": {
      const id = num(p.commentId);
      return id !== null ? t("detail.comment", { id }) : "";
    }
    case "rule.created":
    case "rule.updated":
    case "rule.deleted": {
      const name = str(p.ruleName);
      return name ? t("detail.ruleName", { name }) : "";
    }
    default: {
      // Rows written by the interceptor carry the request body as payload, so
      // the generic case renders its scalar fields — "what changed" stays
      // visible without needing a bespoke case per action (there are ~60 of
      // them, and more arrive with every new endpoint).
      //
      // Arrays/objects are skipped rather than stringified: `redacted` and the
      // permission matrix both read worse as `a,b,c` / `[object Object]` than
      // as nothing, and the action label already says what happened.
      return Object.entries(p)
        .filter(
          ([, value]) =>
            typeof value === "string" || typeof value === "number" || typeof value === "boolean",
        )
        .slice(0, 4)
        .map(([key, value]) => `${fieldLabel(t, key)}: ${String(value)}`)
        .join(", ");
    }
  }
}

/** `name` → "ชื่อ" when a message exists, else the raw key (never the key path). */
function fieldLabel(t: (key: string, values?: Record<string, string | number>) => string, key: string): string {
  const label = t(`fields.${key}`);
  return label.endsWith(`fields.${key}`) ? key : label;
}

/**
 * The action chip's i18n key.
 *
 * A key with no message makes next-intl return the **key path** — showing
 * `Logs.actions.user_created` in a table cell is worse than showing nothing,
 * so any unresolved key falls back to a humanised form of the action itself.
 * The interceptor invents actions for routes nobody tabled, so this path is
 * reachable on purpose, not defensively.
 */
function actionKey(action: string): string {
  return `actions.${action.replace(/\./g, "_")}`;
}

/** `user.frobnicatorUpdated` → `user frobnicator updated` (last-resort label). */
function humanizeAction(action: string): string {
  return action
    .replace(/\./g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

/**
 * The action label for a cell. next-intl has no `onError` configured here, so a
 * missing message comes back as the **key path** (`Logs.actions.user_created`) —
 * which reads far worse in a table than the action itself, hence the fallback.
 */
function actionLabel(
  t: (key: string, values?: Record<string, string | number>) => string,
  action: string,
): string {
  const key = actionKey(action);
  const label = t(key);
  return label.endsWith(key) ? humanizeAction(action) : label;
}

/**
 * The system-wide activity feed — every `activity_logs` row (cards, comments
 * and rule audit) in one table, behind `log.view`. Filters, search, paging
 * and a CSV export that follows the same filters.
 */
export default function LogsPage() {
  const t = useTranslations("Logs");
  const theme = useTheme();
  const locale = useLocale();
  const { notify } = useNotification();
  const { can } = usePermissions();

  const [logs, setLogs] = useState<PaginatedLogs | null>(null);
  const [actors, setActors] = useState<ActivityActorDto[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [actorFilter, setActorFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<ActivityLogType | "">("");
  const [range, setRange] = useState<DateRangeValue>({ from: "", to: "" });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [exporting, setExporting] = useState(false);
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);

  // the actor list only feeds the filter popover — its failure must not hide the feed
  useEffect(() => {
    let cancelled = false;
    fetchLogActors()
      .then((data) => {
        if (!cancelled) setActors(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // debounce the search box so typing does not fire a request per keystroke
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const filters = useMemo<LogFilters>(
    () => ({
      ...(actorFilter !== "all" ? { actorId: Number(actorFilter) } : {}),
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(search ? { search } : {}),
      ...(range.from ? { from: range.from } : {}),
      ...(range.to ? { to: range.to } : {}),
    }),
    [actorFilter, typeFilter, search, range],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchActivityLogs(filters, page, PAGE_SIZE);
        if (!cancelled) setLogs(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, reloadKey]);

  const resetFilters = useCallback(() => {
    setActorFilter("all");
    setTypeFilter("");
    setRange({ from: "", to: "" });
    setSearchInput("");
    setSearch("");
    setPage(1);
  }, []);

  const hasFilters =
    actorFilter !== "all" ||
    typeFilter !== "" ||
    Boolean(search) ||
    Boolean(range.from) ||
    Boolean(range.to);

  /** One chip per lit filter — actor / type / date range. */
  const filterCount =
    (actorFilter !== "all" ? 1 : 0) +
    (typeFilter !== "" ? 1 : 0) +
    (range.from || range.to ? 1 : 0) +
    (search.trim() ? 1 : 0);

  /** Single-select: picking a checkbox clears the other one in its section. */
  const toggleActor = (id: number) => () => {
    setActorFilter((prev) => (prev === String(id) ? "all" : String(id)));
    setPage(1);
  };

  const toggleType = (value: ActivityLogType) => () => {
    setTypeFilter((prev) => (prev === value ? "" : value));
    setPage(1);
  };

  /** Same preset menu as the reports toolbar — labels come from `Logs.filters`. */
  const rangePresets: DateRangePreset[] = RANGE_PRESET_KEYS.map((key) => ({
    key,
    label: t(`filters.${RANGE_LABEL_KEYS[key]}`),
    dates: rangeDates(key) ?? { from: "", to: "" },
  }));

  /**
   * The funnel popover: actor list (searchable in-panel past 6 entries) and
   * the three log groups. Both sections stay single-select to match the API.
   */
  const filterSections: FilterSectionData[] = [
    {
      key: "actor",
      title: t("filters.actor"),
      icon: <PersonIcon sx={{ fontSize: 18 }} />,
      count: actorFilter !== "all" ? 1 : 0,
      options: actors.map((actor) => ({
        id: actor.id,
        label: actor.name,
        checked: actorFilter === String(actor.id),
        onToggle: toggleActor(actor.id),
        start: <PersonIcon sx={{ fontSize: 16, flexShrink: 0, color: "primary.main" }} />,
      })),
      // ไม่มีอะไรเลือกเลย → เปิด section แรกไว้ (เหมือน /reports)
      initialOpen: actorFilter !== "all" || (typeFilter === "" && !range.from && !range.to),
    },
    {
      key: "type",
      title: t("filters.type"),
      icon: <CategoryIcon sx={{ fontSize: 18 }} />,
      count: typeFilter !== "" ? 1 : 0,
      options: TYPES.filter((value): value is ActivityLogType => value !== "").map((value) => ({
        id: value,
        label: t(`type.${value}`),
        checked: typeFilter === value,
        onToggle: toggleType(value),
        // จุดสีเดียวกับ chip คอลัมน์ "ประเภท" ในตาราง — ไม่ซ้ำคำกับ label
        start: (
          <Box
            component="span"
            sx={{
              width: 8,
              height: 8,
              flexShrink: 0,
              borderRadius: "50%",
              bgcolor: `${TYPE_COLOR[value]}.main`,
            }}
          />
        ),
      })),
      initialOpen: typeFilter !== "",
    },
  ];

  const handleExportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const all = await fetchAllLogRows(filters);
      const headers = [
        t("columns.time"),
        t("columns.actor"),
        t("columns.role"),
        t("columns.type"),
        t("columns.action"),
        t("columns.detail"),
      ];
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(
        `activity-logs-${stamp}.csv`,
        buildCsv(
          headers,
          all.map((row) => [
            new Date(row.createdAt).toLocaleString(locale),
            row.actorName ?? "—",
            row.actorRole ?? "—",
            t(`type.${row.type}`),
            actionLabel(t, row.action),
            describe(row, t),
          ]),
        ),
      );
      notify(t("exportDone", { count: all.length }));
    } catch (err) {
      notify(err instanceof Error ? err.message : t("exportFailed"), "error");
    } finally {
      setExporting(false);
    }
  }, [filters, locale, notify, t]);

  return (
    <RequirePermission permission="log.view">
      <DashboardLayout>
        {/* แถวเดียวกับ toolbar ของ /reports — ค้นหาชิดซ้าย ปุ่มที่เหลือชิดขวา
            (เดิมเป็น control เปล่า ๆ 6 ชิ้นเรียงกัน ไม่มี label ดูเท่ากันหมด) */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder={t("filters.searchPlaceholder")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            sx={{ flexGrow: 1, maxWidth: 480, minWidth: 200 }}
            inputProps={{
              "aria-label": t("filters.searchPlaceholder"),
              // กัน password manager เทข้อมูลที่บันทึกไว้ลงช่องค้นหา (เหมือน /reports)
              autoComplete: "off",
              name: "logs-search",
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          <Box sx={{ flex: 1, minWidth: 8 }} />

          {/* ช่วงวันที่แบบ preset — แทน DatePicker 2 ช่อง (shared กับ /reports) */}
          <DateRangeIconButton
            value={range}
            onChange={(next) => {
              setRange(next);
              setPage(1);
            }}
            presets={rangePresets}
            size="medium"
            ariaLabel={t("filters.range")}
          />

          {/* ตัวกรอง: ผู้กระทำ + ประเภท ใน popover เดียว (shared FilterPanel) */}
          <Tooltip title={t("filters.filtersBtn")}>
            <IconButton
              size="medium"
              color={filterCount > 0 ? "primary" : "default"}
              onClick={(e) => setFilterAnchor(e.currentTarget)}
              aria-label={t("filters.filtersBtn")}
              aria-expanded={Boolean(filterAnchor)}
            >
              <Badge badgeContent={filterCount} color="primary">
                <FilterListIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>
          <FilterPanel
            open={Boolean(filterAnchor)}
            anchorEl={filterAnchor}
            onClose={() => setFilterAnchor(null)}
            sections={filterSections}
            // ล้างให้หมดทุกชิ้นที่ badge นับ (ผู้กระทำ/ประเภท/วันที่/ค้นหา) — เหมือน /reports
            onClearAll={resetFilters}
            selectedCount={filterCount}
          />

          {hasFilters && (
            <Button size="small" onClick={resetFilters} sx={{ textTransform: "none", fontWeight: 600 }}>
              {t("filters.reset")}
            </Button>
          )}

          {can("log.export") && (
            // ปุ่ม export แชร์กับ /reports — มี CSV อันเดียวจึงเป็นปุ่มกดตรง ๆ ไม่มีลูกศร
            <ExportButton
              label={t("exportCsv")}
              actions={[{ key: "csv", label: t("exportCsv"), onClick: handleExportCsv }]}
              loading={exporting}
              loadingLabel={t("exporting")}
            />
          )}
        </Box>

        {logs && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {t("total", { count: logs.total })}
          </Typography>
        )}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
                {t("retry")}
              </Button>
            }
          >
            <Typography>{error}</Typography>
          </Alert>
        ) : !logs || logs.data.length === 0 ? (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <HistoryIcon sx={{ fontSize: 48, color: "text.disabled" }} />
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{ color: theme.palette.navy.main, mt: 1 }}
            >
              {t("empty.title")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t("empty.description")}
            </Typography>
          </Box>
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableRow>
                <DataTableCell>{t("columns.time")}</DataTableCell>
                <DataTableCell>{t("columns.actor")}</DataTableCell>
                <DataTableCell>{t("columns.type")}</DataTableCell>
                <DataTableCell>{t("columns.action")}</DataTableCell>
                <DataTableCell>{t("columns.detail")}</DataTableCell>
              </DataTableRow>
            </DataTableHead>
            <DataTableBody>
              {logs.data.map((row) => (
                <DataTableRow key={row.id}>
                  <DataTableCell sx={{ whiteSpace: "nowrap" }}>
                    <Tooltip title={new Date(row.createdAt).toLocaleString(locale)} placement="top">
                      <span>{timeAgo(row.createdAt, locale)}</span>
                    </Tooltip>
                  </DataTableCell>
                  <DataTableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {row.actorName ?? t("detail.system")}
                    </Typography>
                    {row.actorRole && (
                      <Typography variant="caption" color="text.secondary">
                        {row.actorRole}
                      </Typography>
                    )}
                  </DataTableCell>
                  <DataTableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={TYPE_COLOR[row.type]}
                      label={t(`type.${row.type}`)}
                      sx={{ fontWeight: 600 }}
                    />
                  </DataTableCell>
                  <DataTableCell>
                    <Typography variant="body2">{actionLabel(t, row.action)}</Typography>
                  </DataTableCell>
                  <DataTableCell sx={{ color: "text.secondary", maxWidth: 360 }}>
                    {describe(row, t) || "—"}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}

        {logs && (
          <Pagination
            page={page}
            totalPages={logs.totalPages}
            total={logs.total}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </DashboardLayout>
    </RequirePermission>
  );
}
