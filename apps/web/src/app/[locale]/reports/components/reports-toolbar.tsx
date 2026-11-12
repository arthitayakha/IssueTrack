"use client";

import { useEffect, useState, type DragEvent } from "react";
import {
  Badge,
  Box,
  Checkbox,
  Divider,
  IconButton,
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
import { useTranslations } from "next-intl";
import { DateRangeIconButton, type DateRangePreset } from "@/components/date-range-select";
import { ExportButton } from "@/components/export-button";
import { RANGE_LABEL_KEYS, RANGE_PRESET_KEYS, rangeDates } from "@/lib/date-presets";
import { activeFilterCount } from "@/lib/reports-api";
import type { FilterOptions, ReportFilters, ReportView } from "@/lib/reports-api";
import { REPORT_VIEW_ORDER } from "./report-views";
import { PINNED_COLUMNS } from "./report-columns";
import type { ReportColumnDef } from "./report-columns";
import { ReportsFilterPanel } from "./reports-filter-panel";

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
 * Row 1: **search on the left (same box as the board's toolbar), then every
 * other control pushed right with `ml: auto` — view, the date-range calendar
 * icon, the filter popover button, columns and export**. Checkbox
 * sections live inside the filter panel, mirroring the board's filter popover;
 * the calendar icon opens a preset menu (same entries the old Select listed),
 * and choosing "กำหนดเอง" in it opens a range popover (two MUI date pickers)
 * anchored under the icon. Search is debounced into the URL.
 */
export function ReportsToolbar({
  view,
  onViewChange,
  filters,
  onFiltersChange,
  options,
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

  /** Preset menu for the shared date-range icon (custom comes with it). */
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

  const activeCount = activeFilterCount(filters, view);

  /** The detail section only exists in the assignee view (its expandable rows). */
  const showDetailSection = view === "assignee";
  /** Any column hidden in either section tints the menu button. */
  const anyHidden = hidden.size > 0 || (showDetailSection && detailHidden.size > 0);

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        {/* ช่องค้นหาอยู่ซ้ายสุดและกว้างสุด — เท่ากับ toolbar ของหน้าบอร์ด
            (เดิมอยู่ขวาสุดหลัง spacer ทำให้ดูลอยคนละส่วนกับปุ่มอื่น) */}
        <TextField
          size="small"
          placeholder={t("toolbar.search")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ flexGrow: 1, maxWidth: 480, minWidth: 200 }}
          inputProps={{
            "aria-label": t("toolbar.search"),
            // ไม่ให้ password manager เทอีเมลที่บันทึกไว้ลงช่องค้นหา
            // (บั๊กเดียวกับ toolbar ของหน้าบอร์ด — ดู profile-dialog.tsx)
            autoComplete: "off",
            name: "reports-search",
          }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} />,
          }}
        />

        {/* ทุกปุ่มที่เหลือชิดขวา (ml: auto) — รวมปุ่มตัวกรอง เหมือนหน้าบอร์ด */}
        <Box sx={{ flex: 1, minWidth: 8 }} />

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

        {/* ช่วงวันที่กรอง "วันที่ของงาน" — ไม่มีความหมายกับ view ตามบริษัท
            (แถวคือสัญญา แอป×บริษัท) จึงซ่อนออกไป ไม่ใช่ปล่อยให้ไม่ทำงาน */}
        {view !== "company" && (
          <DateRangeIconButton
            value={{ from: filters.from, to: filters.to }}
            onChange={(range) => onFiltersChange({ ...filters, from: range.from, to: range.to })}
            presets={rangePresets}
            size="medium"
            ariaLabel={t("toolbar.range")}
          />
        )}

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

        {canExport && (
          // ปุ่มเดียวพร้อมเมนูเลือก PDF / CSV — shared กับหน้า /logs
          // (เดิมเป็น Button+Menu inline คนละสไตล์กับปุ่ม export หน้าอื่น)
          <ExportButton
            label={t("toolbar.export")}
            actions={[
              {
                key: "pdf",
                label: t("toolbar.exportPdf"),
                onClick: onExportPdf,
              },
              {
                key: "csv",
                label: t("toolbar.exportCsv"),
                onClick: onExportCsv,
              },
            ]}
            loading={exporting}
            loadingLabel={t("toolbar.exporting")}
          />
        )}
      </Stack>
    </Stack>
  );
}
