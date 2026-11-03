"use client";

import { useEffect, useState, type DragEvent } from "react";
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
import SearchIcon from "@mui/icons-material/Search";
import FilterListIcon from "@mui/icons-material/FilterList";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import RefreshIcon from "@mui/icons-material/Refresh";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import { useTranslations } from "next-intl";
import { DateRangeSelect, type DateRangePreset } from "@/components/date-range-select";
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

/* ---------------- date-range presets (the control itself is shared) --------- */

/** Preset keys in menu order — the shared control appends "custom". */
const RANGE_PRESET_KEYS: Exclude<RangeKey, "custom">[] = [
  "all",
  "today",
  "week",
  "thisMonth",
  "lastMonth",
  "d90",
];

const RANGE_LABEL_KEYS: Record<Exclude<RangeKey, "custom">, string> = {
  all: "rangeAll",
  today: "rangeToday",
  week: "rangeWeek",
  thisMonth: "rangeThisMonth",
  lastMonth: "rangeLastMonth",
  d90: "range90",
};

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

  /** Preset menu for the shared date-range control (custom comes with it). */
  const rangePresets: DateRangePreset[] = RANGE_PRESET_KEYS.map((key) => ({
    key,
    label: t(`toolbar.${RANGE_LABEL_KEYS[key]}`),
    dates: rangeDates(key) ?? { from: "", to: "" },
  }));

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

  const activeCount = activeFilterCount(filters);

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

        <DateRangeSelect
          value={filters}
          onChange={(range) => onFiltersChange({ ...filters, from: range.from, to: range.to })}
          presets={rangePresets}
          minWidth={165}
          ariaLabel={t("toolbar.range")}
        />

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
    </Stack>
  );
}
