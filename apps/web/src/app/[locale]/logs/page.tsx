"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
  useTheme,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import HistoryIcon from "@mui/icons-material/History";
import SearchIcon from "@mui/icons-material/Search";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs, { type Dayjs } from "dayjs";
import { useLocale, useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { Pagination } from "@/components/pagination";
import { useNotification } from "@/components/notification";
import { usePermissions } from "@/lib/permissions";
import { fetchActivityLogs, fetchAllLogRows, fetchLogActors } from "@/lib/logs-api";
import type { LogFilters, PaginatedLogs } from "@/lib/logs-api";
import { buildCsv, downloadCsv } from "@/lib/reports-api";
import { timeAgo } from "@/lib/time-ago";
import type { ActivityActorDto, ActivityLogDto, ActivityLogType } from "@kanban/shared";
import DataTable, {
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/data-table";

const PAGE_SIZE = 10;

/** The three groups the feed can be narrowed to. */
const TYPES: Array<ActivityLogType | ""> = ["", "card", "comment", "rule"];

/** Chip colour per group — pulled from the MUI palette, never a raw hex. */
const TYPE_COLOR: Record<ActivityLogType, "info" | "success" | "warning"> = {
  card: "info",
  comment: "success",
  rule: "warning",
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
    default:
      return "";
  }
}

/** The action chip's i18n key — unknown actions show the raw string. */
function actionKey(action: string): string {
  return `actions.${action.replace(/\./g, "_")}`;
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
  const [from, setFrom] = useState<Dayjs | null>(null);
  const [to, setTo] = useState<Dayjs | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const [exporting, setExporting] = useState(false);

  // the actor list only feeds the dropdown — its failure must not hide the feed
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
      ...(from ? { from: from.format("YYYY-MM-DD") } : {}),
      ...(to ? { to: to.format("YYYY-MM-DD") } : {}),
    }),
    [actorFilter, typeFilter, search, from, to],
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
    setFrom(null);
    setTo(null);
    setSearchInput("");
    setSearch("");
    setPage(1);
  }, []);

  const hasFilters =
    actorFilter !== "all" || typeFilter !== "" || Boolean(search) || from !== null || to !== null;

  const handleTypeChange = (e: SelectChangeEvent) => {
    setTypeFilter(e.target.value as ActivityLogType | "");
    setPage(1);
  };

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
            t(actionKey(row.action)),
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
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
            {t("title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("subtitle")}
          </Typography>
        </Box>

        <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={locale === "th" ? "th" : undefined}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
            <Select
              size="small"
              value={actorFilter}
              onChange={(e) => {
                setActorFilter(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 190 }}
              aria-label={t("filters.actor")}
            >
              <MenuItem value="all">{t("filters.actorAll")}</MenuItem>
              {actors.map((actor) => (
                <MenuItem key={actor.id} value={String(actor.id)}>
                  {actor.name}
                </MenuItem>
              ))}
            </Select>

            <Select
              size="small"
              value={typeFilter}
              onChange={handleTypeChange}
              sx={{ minWidth: 170 }}
              aria-label={t("filters.type")}
            >
              {TYPES.map((value) => (
                <MenuItem key={value || "all"} value={value}>
                  {value ? t(`type.${value}`) : t("filters.typeAll")}
                </MenuItem>
              ))}
            </Select>

            <DatePicker
              label={t("filters.from")}
              value={from}
              onChange={(value) => {
                setFrom(value);
                setPage(1);
              }}
              format="DD/MM/YYYY"
              slotProps={{ textField: { size: "small" } }}
            />
            <DatePicker
              label={t("filters.to")}
              value={to}
              onChange={(value) => {
                setTo(value);
                setPage(1);
              }}
              format="DD/MM/YYYY"
              minDate={from ?? undefined}
              slotProps={{ textField: { size: "small" } }}
            />

            <TextField
              size="small"
              placeholder={t("filters.searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              sx={{ minWidth: 230 }}
              inputProps={{ "aria-label": t("filters.searchPlaceholder") }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            {hasFilters && (
              <Button size="small" onClick={resetFilters} sx={{ textTransform: "none", fontWeight: 600 }}>
                {t("filters.reset")}
              </Button>
            )}

            <Tooltip title={t("refresh")}>
              <IconButton size="medium" onClick={() => setReloadKey((k) => k + 1)} aria-label={t("refresh")}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            {can("log.export") && (
              <Button
                variant="contained"
                startIcon={<FileDownloadIcon />}
                onClick={handleExportCsv}
                disabled={exporting}
              >
                {exporting ? t("exporting") : t("exportCsv")}
              </Button>
            )}
          </Box>
        </LocalizationProvider>

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
                    <Typography variant="body2">{t(actionKey(row.action))}</Typography>
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
