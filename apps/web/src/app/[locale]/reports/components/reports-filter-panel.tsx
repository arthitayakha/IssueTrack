"use client";

import type { ReactNode } from "react";
import { Box } from "@mui/material";
import { useTheme, type Theme } from "@mui/material/styles";
import ViewKanbanIcon from "@mui/icons-material/ViewKanban";
import AppsIcon from "@mui/icons-material/Apps";
import BusinessIcon from "@mui/icons-material/Business";
import FlagIcon from "@mui/icons-material/Flag";
import CategoryIcon from "@mui/icons-material/Category";
import PersonIcon from "@mui/icons-material/Person";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { useTranslations } from "next-intl";
import { activeFilterCount, EMPTY_FILTERS } from "@/lib/reports-api";
import type { FilterOptions, ReportFilters, ReportView } from "@/lib/reports-api";
import {
  FilterPanel,
  type FilterOption,
  type FilterSectionData,
} from "@/components/filter-panel";

/* ---------------- colour helpers (same mapping as the board filter) ---------------- */

function getStatusColor(theme: Theme, name: string): string {
  const key = name.toLowerCase();
  if (key.includes("backlog")) return theme.custom.columnColors.backlog;
  if (key.includes("todo")) return theme.custom.columnColors.todo;
  if (key.includes("doing")) return theme.custom.columnColors.doing;
  if (key.includes("done")) return theme.custom.columnColors.done;
  if (key.includes("review")) return theme.custom.columnColors.review;
  return theme.custom.columnColors.default;
}

function getPriorityColor(theme: Theme, name: string): string {
  const key = name.toLowerCase();
  if (key.includes("urgent") || key.includes("critical")) return theme.palette.error.main;
  if (key.includes("high")) return theme.palette.warning.main;
  if (key.includes("medium")) return theme.palette.info.main;
  if (key.includes("low")) return theme.palette.success.main;
  return theme.palette.grey[500];
}

/* ---------------- section option type ---------------- */

/* ---------------- per-view section order ---------------- */

type SectionKey =
  | "assignee"
  | "status"
  | "priority"
  | "category"
  | "app"
  | "company"
  | "reporter";

/**
 * Which filter sections each report view shows, top to bottom — every view
 * used to open the identical six sections, which is why the panel felt the
 * same on every dropdown. `assignee` is labelled โปรแกรมเมอร์ (same wording
 * as the by-assignee table header) and leads the issues view; the summary
 * views end on it and skip the reporter section entirely.
 * `company` sits under `app`: an issue reaches a company through its reporter.
 *
 * `company` view = contract data (rows are แอป×บริษัท pairs): only the two
 * sections that mean anything on a contract. สถานะ/หมวด/ผู้รับ/ผู้แจ้ง/ความสำคัญ
 * are issue fields — they filter nothing here, and date range is hidden in the
 * toolbar for the same reason.
 */
const VIEW_SECTIONS: Record<ReportView, SectionKey[]> = {
  issues: ["assignee", "status", "priority", "category", "app", "company", "reporter"],
  assignee: ["status", "priority", "category", "app", "company", "assignee"],
  app: ["status", "priority", "category", "app", "company", "assignee"],
  company: ["company", "app"],
};

/* ---------------- panel ---------------- */

export interface ReportsFilterPanelProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  /** Drives which sections show and in what order (VIEW_SECTIONS). */
  view: ReportView;
  filters: ReportFilters;
  onFiltersChange: (next: ReportFilters) => void;
  options: FilterOptions;
}

/**
 * Reports filter popover — the same panel the board uses (image reference):
 * header with count badge, collapsible checkbox sections (status dots /
 * category & priority icons / person sections), and a "clear all" footer.
 * The sections themselves follow the current view (VIEW_SECTIONS); the date
 * range lives in the toolbar's range presets instead.
 */
export function ReportsFilterPanel({
  open,
  anchorEl,
  onClose,
  view,
  filters,
  onFiltersChange,
  options,
}: ReportsFilterPanelProps) {
  const t = useTranslations("Reports");
  const theme = useTheme();
  const totalSelected = activeFilterCount(filters, view);

  const startsOpen = (count: number, fallback: boolean) =>
    totalSelected > 0 ? count > 0 : fallback;

  const toggleIn = (
    key:
      | "statusIds"
      | "priorityIds"
      | "categoryIds"
      | "appIds"
      | "companyIds"
      | "assigneeIds"
      | "reporterIds",
    id: number,
  ) => {
    const current = filters[key];
    onFiltersChange({
      ...filters,
      [key]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    });
  };

  const statusOptions: FilterOption[] = options.statuses.map((status) => ({
    id: status.id,
    label: status.name,
    checked: filters.statusIds.includes(status.id),
    onToggle: () => toggleIn("statusIds", status.id),
    start: (
      <Box
        component="span"
        sx={{
          width: 8,
          height: 8,
          flexShrink: 0,
          borderRadius: "50%",
          bgcolor: getStatusColor(theme, status.name),
        }}
      />
    ),
  }));

  const appOptions: FilterOption[] = options.apps.map((app) => ({
    id: app.id,
    label: app.name,
    checked: filters.appIds.includes(app.id),
    onToggle: () => toggleIn("appIds", app.id),
    start: <AppsIcon sx={{ fontSize: 16, flexShrink: 0, color: "info.main" }} />,
  }));

  const companyOptions: FilterOption[] = options.companies.map((company) => ({
    id: company.id,
    label: company.name,
    checked: filters.companyIds.includes(company.id),
    onToggle: () => toggleIn("companyIds", company.id),
    start: <BusinessIcon sx={{ fontSize: 16, flexShrink: 0, color: "warning.main" }} />,
  }));

  const priorityOptions: FilterOption[] = options.priorities.map((priority) => ({
    id: priority.id,
    label: priority.name,
    checked: filters.priorityIds.includes(priority.id),
    onToggle: () => toggleIn("priorityIds", priority.id),
    start: (
      <FlagIcon sx={{ fontSize: 16, flexShrink: 0, color: getPriorityColor(theme, priority.name) }} />
    ),
  }));

  const categoryOptions: FilterOption[] = options.categories.map((category) => ({
    id: category.id,
    label: category.name,
    checked: filters.categoryIds.includes(category.id),
    onToggle: () => toggleIn("categoryIds", category.id),
    start: <CategoryIcon sx={{ fontSize: 16, flexShrink: 0, color: "secondary.main" }} />,
  }));

  const assigneeOptions: FilterOption[] = options.people.map((person) => ({
    id: person.id,
    label: person.name,
    checked: filters.assigneeIds.includes(person.id),
    onToggle: () => toggleIn("assigneeIds", person.id),
    start: <PersonIcon sx={{ fontSize: 16, flexShrink: 0, color: "primary.main" }} />,
  }));

  const reporterOptions: FilterOption[] = options.reporters.map((person) => ({
    id: person.id,
    label: person.name,
    checked: filters.reporterIds.includes(person.id),
    onToggle: () => toggleIn("reporterIds", person.id),
    start: <ChatBubbleOutlineIcon sx={{ fontSize: 16, flexShrink: 0, color: "success.main" }} />,
  }));

  /** Everything a section needs, keyed once — the view decides the order. */
  const sections: Record<
    SectionKey,
    { title: string; icon: ReactNode; count: number; options: FilterOption[] }
  > = {
    assignee: {
      title: t("filters.sectionAssignee"),
      icon: <PersonIcon sx={{ fontSize: 18 }} />,
      count: filters.assigneeIds.length,
      options: assigneeOptions,
    },
    status: {
      title: t("filters.status"),
      icon: <ViewKanbanIcon sx={{ fontSize: 18 }} />,
      count: filters.statusIds.length,
      options: statusOptions,
    },
    priority: {
      title: t("filters.priority"),
      icon: <FlagIcon sx={{ fontSize: 18 }} />,
      count: filters.priorityIds.length,
      options: priorityOptions,
    },
    category: {
      title: t("filters.category"),
      icon: <CategoryIcon sx={{ fontSize: 18 }} />,
      count: filters.categoryIds.length,
      options: categoryOptions,
    },
    app: {
      title: t("filters.app"),
      icon: <AppsIcon sx={{ fontSize: 18 }} />,
      count: filters.appIds.length,
      options: appOptions,
    },
    company: {
      title: t("filters.company"),
      icon: <BusinessIcon sx={{ fontSize: 18 }} />,
      count: filters.companyIds.length,
      options: companyOptions,
    },
    reporter: {
      title: t("filters.sectionReporter"),
      icon: <ChatBubbleOutlineIcon sx={{ fontSize: 18 }} />,
      count: filters.reporterIds.length,
      options: reporterOptions,
    },
  };

  /**
   * แปลง Record → array ตามลำดับของ view — ส่วน chrome ทั้งหมด (หัว panel /
   * ปุ่มล้าง) อยู่ที่ `components/filter-panel.tsx` แชร์กับบอร์ดและ `/systems`
   */
  const orderedSections: FilterSectionData[] = VIEW_SECTIONS[view].map((key, index) => {
    const section = sections[key];
    return {
      // keyed by view too — switching view re-mounts the sections so
      // each one returns to its per-view default open state
      key: `${view}-${key}`,
      title: section.title,
      icon: section.icon,
      count: section.count,
      options: section.options,
      initialOpen: startsOpen(section.count, index === 0),
    };
  });

  return (
    <FilterPanel
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      sections={orderedSections}
      onClearAll={() => onFiltersChange({ ...EMPTY_FILTERS })}
      selectedCount={totalSelected}
    />
  );
}
