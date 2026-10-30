"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  IconButton,
  InputAdornment,
  ListItemText,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import RefreshIcon from "@mui/icons-material/Refresh";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs, { type Dayjs } from "dayjs";
import "dayjs/locale/th";
import { useTranslations, useLocale } from "next-intl";
import { activeFilterCount } from "@/lib/reports-api";
import type { FilterOptions, ReportFilters, ReportView } from "@/lib/reports-api";
import { REPORT_VIEW_ORDER } from "./report-views";
import { PINNED_COLUMNS } from "./report-columns";
import type { ReportColumnDef } from "./report-columns";
import { ReportsFilterPanel } from "./reports-filter-panel";

/* ---------------- date-range presets ---------------- */

type RangeKey = "all" | "today" | "week" | "thisMonth" | "lastMonth" | "d90" | "custom";

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

function currentRange(f: ReportFilters): RangeKey {
  if (!f.from && !f.to) return "all";
  const now = new Date();
  const today = isoLocal(now);
  if (f.from === today && f.to === today) return "today";
  if (f.from === isoLocal(weekFirst(now)) && f.to === today) return "week";
  const monthFirst = new Date(now.getFullYear(), now.getMonth(), 1);
  if (f.from === isoLocal(monthFirst) && f.to === today) return "thisMonth";
  const prevFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevLast = new Date(now.getFullYear(), now.getMonth(), 0);
  if (f.from === isoLocal(prevFirst) && f.to === isoLocal(prevLast)) return "lastMonth";
  const d90 = new Date(now);
  d90.setDate(d90.getDate() - 89);
  if (f.from === isoLocal(d90) && f.to === today) return "d90";
  return "custom";
}

function rangeDates(key: RangeKey): { from: string; to: string } | null {
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

/* ---------------- custom range popover (replaces the old date inputs) ------ */

const RANGE_LABEL_KEYS: Record<RangeKey, string> = {
  all: "rangeAll",
  today: "rangeToday",
  week: "rangeWeek",
  thisMonth: "rangeThisMonth",
  lastMonth: "rangeLastMonth",
  d90: "range90",
  custom: "rangeCustom",
};

/**
 * Anchored popover (same pattern as the column menu) holding two MUI date
 * pickers instead of the old native `type="date"` inputs — the calendar
 * follows the app locale (dayjs `th`). Dates apply live as they are picked;
 * the footer only clears the pair or dismisses the popover.
 */
function RangePopover({
  anchorEl,
  onClose,
  filters,
  onFiltersChange,
}: {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  filters: ReportFilters;
  onFiltersChange: (filters: ReportFilters) => void;
}) {
  const t = useTranslations("Reports");
  const locale = useLocale();

  /** The ISO pair stays ordered: moving one side past the other drags it along. */
  const setFrom = (value: Dayjs | null) => {
    const from = value ? value.format("YYYY-MM-DD") : "";
    const to = from && filters.to && from > filters.to ? from : filters.to;
    onFiltersChange({ ...filters, from, to });
  };
  const setTo = (value: Dayjs | null) => {
    const to = value ? value.format("YYYY-MM-DD") : "";
    const from = to && filters.from && to < filters.from ? to : filters.from;
    onFiltersChange({ ...filters, from, to });
  };

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        paper: {
          sx: {
            width: 300,
            maxWidth: "calc(100vw - 24px)",
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
          },
        },
      }}
    >
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        adapterLocale={locale === "th" ? "th" : undefined}
      >
        <Box sx={{ px: 2, pt: 1.75 }}>
          <Typography variant="subtitle2" fontWeight={700}>
            {t("toolbar.pickRangeTitle")}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
            {t("toolbar.pickRangeHint")}
          </Typography>
          <DatePicker
            label={t("filters.from")}
            value={filters.from ? dayjs(filters.from) : null}
            onChange={setFrom}
            format="DD/MM/YYYY"
            slotProps={{ textField: { size: "small", fullWidth: true } }}
          />
          <Box sx={{ mt: 1.5 }}>
            <DatePicker
              label={t("filters.to")}
              value={filters.to ? dayjs(filters.to) : null}
              onChange={setTo}
              format="DD/MM/YYYY"
              minDate={filters.from ? dayjs(filters.from) : undefined}
              slotProps={{ textField: { size: "small", fullWidth: true } }}
            />
          </Box>
        </Box>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            px: 2,
            py: 1.25,
            mt: 1.75,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Button
            size="small"
            onClick={() => onFiltersChange({ ...filters, from: "", to: "" })}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            {t("toolbar.clearRange")}
          </Button>
          <Button
            size="small"
            variant="contained"
            onClick={onClose}
            sx={{ textTransform: "none", fontWeight: 600 }}
          >
            {t("toolbar.apply")}
          </Button>
        </Box>
      </LocalizationProvider>
    </Popover>
  );
}

/* ---------------- column list (one menu section) ---------------- */

/**
 * One checkbox + drag-reorder section of the column menu. The drag state
 * lives here rather than in the toolbar so the summary and detail sections
 * never share a dragKey/dropIndex — grabbing a row in one list can't move a
 * row in the other.
 */
function ColumnList({
  columns,
  hidden,
  onToggle,
  onReorder,
}: {
  columns: ReportColumnDef[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onReorder: (order: string[]) => void;
}) {
  const t = useTranslations("Reports");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const handleDragStart = (key: string) => (e: DragEvent<HTMLElement>) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", key);
    setDragKey(key);
    setDropIndex(null);
  };

  /** Insertion point = index in `columns` where the row would land. */
  const handleDragOver = (index: number) => (e: DragEvent<HTMLElement>) => {
    if (!dragKey) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIndex(index);
  };

  const handleDrop = (index: number) => (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const key = e.dataTransfer.getData("text/plain") || dragKey;
    setDragKey(null);
    setDropIndex(null);
    if (!key) return;
    const from = columns.findIndex((c) => c.key === key);
    if (from < 0) return;
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    // dropping below its old spot shifts the target one place left after removal
    const target = from < index ? index - 1 : index;
    if (target === from) return;
    next.splice(target, 0, moved);
    onReorder(next.map((c) => c.key));
  };

  const handleDragEnd = () => {
    setDragKey(null);
    setDropIndex(null);
  };

  const dropLine = (index: number) =>
    dropIndex === index ? (
      <Box sx={{ height: 2, bgcolor: "primary.main", borderRadius: 1 }} />
    ) : null;

  return (
    <>
      {columns.map((col, i) => {
        const pinned = PINNED_COLUMNS.has(col.key);
        // the pinned first column can't be dropped above — drop "on" it
        // lands right after it instead
        const overIndex = pinned ? i + 1 : i;
        return (
          <Box key={col.key}>
            {dropLine(i)}
            <MenuItem
              dense
              draggable={!pinned}
              onDragStart={pinned ? undefined : handleDragStart(col.key)}
              onDragOver={handleDragOver(overIndex)}
              onDrop={handleDrop(overIndex)}
              onDragEnd={handleDragEnd}
              onClick={() => onToggle(col.key)}
              sx={{
                ...(pinned ? {} : { cursor: "grab" }),
                ...(dragKey === col.key ? { opacity: 0.4 } : {}),
              }}
            >
              {pinned ? (
                <Box sx={{ width: 24, display: "flex", justifyContent: "center" }}>
                  <DragIndicatorIcon fontSize="small" sx={{ color: "text.disabled" }} />
                </Box>
              ) : (
                <DragIndicatorIcon
                  fontSize="small"
                  sx={{ color: "text.disabled", mr: 0.5 }}
                />
              )}
              <Checkbox size="small" checked={!hidden.has(col.key)} disableRipple />
              <ListItemText
                primary={t(col.labelKey)}
                primaryTypographyProps={{ fontSize: 13.5 }}
              />
            </MenuItem>
          </Box>
        );
      })}
      {/* drop zone past the last row — append to the end of the list */}
      <Box
        onDragOver={handleDragOver(columns.length)}
        onDrop={handleDrop(columns.length)}
        sx={{
          height: 8,
          bgcolor: dropIndex === columns.length ? "primary.main" : "transparent",
          borderRadius: 1,
          mx: 1,
        }}
      />
    </>
  );
}

/* ---------------- toolbar ---------------- */

export interface ReportsToolbarProps {
  view: ReportView;
  onViewChange: (view: ReportView) => void;
  filters: ReportFilters;
  onFiltersChange: (filters: ReportFilters) => void;
  options: FilterOptions;
  onRefresh: () => void;
  onExportPdf: () => void;
  onExportCsv: () => void;
  canExport: boolean;
  exporting: boolean;
  /** Column keys the user hid for the current view (show/hide menu). */
  hidden: Set<string>;
  onToggleColumn: (key: string) => void;
  /** Columns for the current view, already in the user's display order. */
  columns: ReportColumnDef[];
  /** Persist a new display order (drag & drop inside the column menu). */
  onReorder: (order: string[]) => void;
  /** Person-detail table (assignee view) — its own section in the same menu. */
  detailColumns: ReportColumnDef[];
  detailHidden: Set<string>;
  onToggleDetailColumn: (key: string) => void;
  onReorderDetail: (order: string[]) => void;
}

/**
 * Row 1: view + date-range presets + the filter popover button, then search
 * and the export buttons on the right (the reference layout). Checkbox
 * sections live inside the filter panel, mirroring the board's filter
 * popover; choosing "custom" opens a range popover (two MUI date pickers)
 * anchored under this row. Search is debounced into the URL.
 */
export function ReportsToolbar({
  view,
  onViewChange,
  filters,
  onFiltersChange,
  options,
  onRefresh,
  onExportPdf,
  onExportCsv,
  canExport,
  exporting,
  hidden,
  onToggleColumn,
  columns,
  onReorder,
  detailColumns,
  detailHidden,
  onToggleDetailColumn,
  onReorderDetail,
}: ReportsToolbarProps) {
  const t = useTranslations("Reports");
  const [searchInput, setSearchInput] = useState(filters.search);
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const [columnAnchor, setColumnAnchor] = useState<HTMLElement | null>(null);
  /** Keeps the "custom" range selected until a preset replaces it. */
  const [customMode, setCustomMode] = useState(false);
  /** Anchor for the custom-range popover (the preset select itself). */
  const rangeSelectRef = useRef<HTMLDivElement | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!filters.search) setSearchInput("");
  }, [filters.search]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFiltersChange({ ...filters, search: searchInput });
      }
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput, filters, onFiltersChange]);

  const detectedRange = currentRange(filters);
  const rangeKey: RangeKey = customMode || detectedRange === "custom" ? "custom" : detectedRange;
  const activeCount = activeFilterCount(filters);

  function handleRange(e: SelectChangeEvent<RangeKey>) {
    const key = e.target.value as RangeKey;
    if (key === "custom") {
      // keep the current dates and open the range popover under the select
      setCustomMode(true);
      setRangeAnchor(rangeSelectRef.current);
      return;
    }
    setCustomMode(false);
    setRangeAnchor(null);
    const dates = rangeDates(key);
    if (dates) onFiltersChange({ ...filters, from: dates.from, to: dates.to });
  }

  /** Compact "1 ต.ค." piece of the custom renderValue. */
  const spanLabel = (iso: string) => (iso ? dayjs(iso).format("D MMM") : "—");

  /** The detail section only exists in the assignee view (its expandable rows). */
  const showDetailSection = view === "assignee";
  /** Any column hidden in either section tints the menu button. */
  const anyHidden = hidden.size > 0 || (showDetailSection && detailHidden.size > 0);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Select<ReportView>
          size="small"
          value={view}
          onChange={(e) => onViewChange(e.target.value as ReportView)}
          renderValue={(v) => (
            <Typography variant="body2" fontWeight={700}>
              {t(`views.${v}`)}
            </Typography>
          )}
          sx={{ minWidth: 215 }}
          inputProps={{ "aria-label": t("toolbar.view") }}
        >
          {REPORT_VIEW_ORDER.map((v) => (
            <MenuItem key={v} value={v}>
              <Typography variant="body2">{t(`views.${v}`)}</Typography>
            </MenuItem>
          ))}
        </Select>

        <Select<RangeKey>
          size="small"
          ref={rangeSelectRef}
          value={rangeKey}
          onChange={handleRange}
          renderValue={(v) => (
            <Typography variant="body2" fontWeight={700}>
              {v === "custom" && (filters.from || filters.to)
                ? `${t("toolbar.rangeCustom")} · ${spanLabel(filters.from)} – ${spanLabel(filters.to)}`
                : t(`toolbar.${RANGE_LABEL_KEYS[v]}`)}
            </Typography>
          )}
          sx={{ minWidth: 165 }}
          inputProps={{ "aria-label": t("toolbar.range") }}
        >
          <MenuItem value="all">{t("toolbar.rangeAll")}</MenuItem>
          <MenuItem value="today">{t("toolbar.rangeToday")}</MenuItem>
          <MenuItem value="week">{t("toolbar.rangeWeek")}</MenuItem>
          <MenuItem value="thisMonth">{t("toolbar.rangeThisMonth")}</MenuItem>
          <MenuItem value="lastMonth">{t("toolbar.rangeLastMonth")}</MenuItem>
          <MenuItem value="d90">{t("toolbar.range90")}</MenuItem>
          <MenuItem value="custom">{t("toolbar.rangeCustom")}</MenuItem>
        </Select>

        <Tooltip title={t("toolbar.filtersBtn")}>
          <IconButton
            size="medium"
            color={activeCount > 0 ? "primary" : "default"}
            onClick={(e) => setFilterAnchor(e.currentTarget)}
            aria-label={t("toolbar.filtersBtn")}
            aria-expanded={Boolean(filterAnchor)}
          >
            <Badge badgeContent={activeCount} color="primary">
              <FilterListIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>

        <ReportsFilterPanel
          open={Boolean(filterAnchor)}
          anchorEl={filterAnchor}
          onClose={() => setFilterAnchor(null)}
          view={view}
          filters={filters}
          onFiltersChange={onFiltersChange}
          options={options}
        />

        <Tooltip title={t("toolbar.columns")}>
          <IconButton
            size="medium"
            color={anyHidden ? "primary" : "default"}
            onClick={(e) => setColumnAnchor(e.currentTarget)}
            aria-label={t("toolbar.columns")}
            aria-expanded={Boolean(columnAnchor)}
          >
            <ViewColumnIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Popover
          open={Boolean(columnAnchor)}
          anchorEl={columnAnchor}
          onClose={() => setColumnAnchor(null)}
          anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
          transformOrigin={{ vertical: "top", horizontal: "left" }}
        >
          <Box sx={{ py: 1, minWidth: 260, maxHeight: 440, overflowY: "auto" }}>
            <Typography variant="subtitle2" sx={{ px: 2, py: 0.75, fontWeight: 700 }}>
              {t("toolbar.columns")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ px: 2, display: "block" }}>
              {t("toolbar.dragHint")}
            </Typography>
            <Typography
              variant="overline"
              color="text.secondary"
              sx={{ px: 2, pt: 1, display: "block", fontWeight: 700 }}
            >
              {t("toolbar.sectionSummary")}
            </Typography>
            <Divider sx={{ mt: 0.5 }} />
            <ColumnList
              columns={columns}
              hidden={hidden}
              onToggle={onToggleColumn}
              onReorder={onReorder}
            />
            {showDetailSection && (
              <>
                <Divider sx={{ mt: 1 }} />
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ px: 2, pt: 1, display: "block", fontWeight: 700 }}
                >
                  {t("toolbar.sectionDetail")}
                </Typography>
                <ColumnList
                  columns={detailColumns}
                  hidden={detailHidden}
                  onToggle={onToggleDetailColumn}
                  onReorder={onReorderDetail}
                />
              </>
            )}
          </Box>
        </Popover>

        <Box sx={{ flex: 1, minWidth: 8 }} />

        <TextField
          size="small"
          placeholder={t("toolbar.search")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ minWidth: 230 }}
          inputProps={{ "aria-label": t("toolbar.search") }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        <Tooltip title={t("toolbar.refresh")}>
          <IconButton size="medium" onClick={onRefresh} aria-label={t("toolbar.refresh")}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        {canExport && (
          <>
            <Button
              variant="outlined"
              startIcon={<PictureAsPdfIcon />}
              onClick={onExportPdf}
              disabled={exporting}
            >
              {t("toolbar.exportPdf")}
            </Button>
            <Button
              variant="contained"
              startIcon={<FileDownloadIcon />}
              onClick={onExportCsv}
              disabled={exporting}
            >
              {t("toolbar.exportCsv")}
            </Button>
          </>
        )}
      </Stack>

      <RangePopover
        anchorEl={rangeAnchor}
        onClose={() => setRangeAnchor(null)}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
    </Stack>
  );
}
