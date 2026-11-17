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
// ประเภทสัญญา (renew/buy) + ประเภทงาน (บั๊ก/MA/Requirement)
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import ScheduleIcon from "@mui/icons-material/Schedule";
import TaskIcon from "@mui/icons-material/Task";
import BugReportIcon from "@mui/icons-material/BugReport";
import DescriptionIcon from "@mui/icons-material/Description";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { useTranslations } from "next-intl";
import type { IssueTaskType } from "@kanban/shared";
import { activeFilterCount, EMPTY_FILTERS, TASK_TYPE_VALUES } from "@/lib/reports-api";
import type {
  ContractKind,
  FilterOptions,
  ReportFilters,
  ReportView,
} from "@/lib/reports-api";
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
  | "taskType"
  | "category"
  | "app"
  | "kind"
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
 * `taskType` (ประเภทงาน) sits **right after `priority`** in the three views
 * that carry issues — it is an issue field like status/priority, so it groups
 * with them rather than with the dimensions (หมวด/แอป/บริษัท).
 *
 * `company` view = contract data (rows are แอป×บริษัท pairs): only the
 * sections that mean anything on a contract. สถานะ/หมวด/ผู้รับ/ผู้แจ้ง/
 * ความสำคัญ/ประเภทงาน are issue fields — they filter nothing here, and date
 * range is hidden in the toolbar for the same reason. It gains `kind`
 * (ประเภท: ต่ออายุ / ซื้อชั่วโมง), which is contract data.
 */
const VIEW_SECTIONS: Record<ReportView, SectionKey[]> = {
  issues: ["assignee", "status", "priority", "taskType", "category", "app", "company", "reporter"],
  assignee: ["status", "priority", "taskType", "category", "app", "company", "assignee"],
  app: ["status", "priority", "taskType", "category", "app", "company", "assignee"],
  company: ["company", "app", "kind"],
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
  /**
   * ป้ายของตัวกรอง 2 ตัวใหม่ — อ่านจาก namespace ที่มีคำอยู่แล้ว (กติกาห้ามลบ
   * key ที่ไม่ใช้ จึงใช้ของเดิมให้ครบก่อนเพิ่ม key ใหม่):
   * - `Settings.renew` / `Settings.kindBuy` = ป้าย chip "ประเภท" บนตาราง
   * - `Boards.detail.taskType` = หัวข้อ section "ประเภทงาน"
   * - `Boards.taskType.*` = ชื่อ type 3 ค่า + `Boards.detail.taskTypeUnset`
   */
  const st = useTranslations("Settings");
  const bt = useTranslations("Boards");
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

  /** toggle ประเภทงาน (`IssueTaskType[]`) — list ตัวหนังสือ จึงแยกจาก `toggleIn`. */
  const toggleTaskType = (value: IssueTaskType) => {
    const current = filters.taskTypes;
    onFiltersChange({
      ...filters,
      taskTypes: current.includes(value)
        ? current.filter((x) => x !== value)
        : [...current, value],
    });
  };

  /** toggle ประเภทสัญญา (`ContractKind[]`) — เฉพาะมุมมองตามบริษัท. */
  const toggleKind = (value: ContractKind) => {
    const current = filters.kinds;
    onFiltersChange({
      ...filters,
      kinds: current.includes(value) ? current.filter((x) => x !== value) : [...current, value],
    });
  };

  /**
   * "ไม่มีแอป" / "ไม่มีหมวดหมู่" / "ไม่ระบุประเภทงาน" — the NULL bucket of
   * each dimension, which has no id to sit in `appIds`/`categoryIds`/
   * `taskTypes` (the dashboard's `id: null` slices land here via `?noApp=1`).
   * A plain boolean beside the id list, so ticking it together with a real
   * value means OR on the server, never an empty AND.
   */
  const toggleFlag = (key: "noApp" | "noCategory" | "noTaskType") => {
    onFiltersChange({ ...filters, [key]: !filters[key] });
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
  /**
   * The NULL bucket sits at the end of the list. Skipped in the `company` view:
   * its rows are contract pairs (แอป×บริษัท) and every one of them has an app,
   * so "ไม่มีแอป" would only ever show an empty table there.
   */
  if (view !== "company") {
    appOptions.push({
      id: "no-app",
      label: t("filters.noApp"),
      checked: filters.noApp,
      onToggle: () => toggleFlag("noApp"),
      start: <AppsIcon sx={{ fontSize: 16, flexShrink: 0, color: "info.main", opacity: 0.55 }} />,
    });
  }

  const companyOptions: FilterOption[] = options.companies.map((company) => ({
    id: company.id,
    label: company.name,
    checked: filters.companyIds.includes(company.id),
    onToggle: () => toggleIn("companyIds", company.id),
    start: <BusinessIcon sx={{ fontSize: 16, flexShrink: 0, color: "warning.main" }} />,
  }));

  /**
   * **ประเภทสัญญา** (เฉพาะมุมมองตามบริษัท) — 2 ค่าคงที่ของ `app_companies.kind`
   * ไม่มี bucket ว่าง: แถวที่ไม่มี kind คือแอปยังไม่ผูกบริษัท ซึ่ง
   * `buildCompanyRows` ตัดออกอยู่แล้วเมื่อเปิด filter นี้ (กฎเดียวกับ
   * filter บริษัท — สองฝั่งต้องตรงกัน)
   */
  const kindOptions: FilterOption[] = [
    {
      id: "renew",
      label: st("renew"),
      checked: filters.kinds.includes("renew"),
      onToggle: () => toggleKind("renew"),
      start: <AutorenewIcon sx={{ fontSize: 16, flexShrink: 0, color: "info.main" }} />,
    },
    {
      id: "buy",
      label: st("kindBuy"),
      checked: filters.kinds.includes("buy"),
      onToggle: () => toggleKind("buy"),
      start: <ScheduleIcon sx={{ fontSize: 16, flexShrink: 0, color: "primary.main" }} />,
    },
  ];

  const priorityOptions: FilterOption[] = options.priorities.map((priority) => ({
    id: priority.id,
    label: priority.name,
    checked: filters.priorityIds.includes(priority.id),
    onToggle: () => toggleIn("priorityIds", priority.id),
    start: (
      <FlagIcon sx={{ fontSize: 16, flexShrink: 0, color: getPriorityColor(theme, priority.name) }} />
    ),
  }));

  /**
   * **ประเภทงาน** — 3 ค่าคงที่ (ไม่มี endpoint list type จึงไม่ยิง API) +
   * bucket "ไม่ระบุ" ของ `task_type IS NULL` ต่อท้าย · ป้ายอ่านจาก
   * `Boards.taskType.*` / `Boards.detail.taskTypeUnset` — คำเดียวกับที่ popup
   * บอร์ดและคอลัมน์ "รายการที่ตัด" ใช้อยู่แล้ว
   */
  const taskTypeIcons: Record<IssueTaskType, ReactNode> = {
    bug: <BugReportIcon sx={{ fontSize: 16, flexShrink: 0, color: "error.main" }} />,
    ma: <ScheduleIcon sx={{ fontSize: 16, flexShrink: 0, color: "info.main" }} />,
    requirement: (
      <DescriptionIcon sx={{ fontSize: 16, flexShrink: 0, color: "secondary.main" }} />
    ),
  };

  const taskTypeOptions: FilterOption[] = TASK_TYPE_VALUES.map((value) => ({
    id: value,
    label: bt(`taskType.${value}`),
    checked: filters.taskTypes.includes(value),
    onToggle: () => toggleTaskType(value),
    start: taskTypeIcons[value],
  }));
  taskTypeOptions.push({
    id: "no-task-type",
    label: bt("detail.taskTypeUnset"),
    checked: filters.noTaskType,
    onToggle: () => toggleFlag("noTaskType"),
    start: <HelpOutlineIcon sx={{ fontSize: 16, flexShrink: 0, color: "text.disabled" }} />,
  });

  const categoryOptions: FilterOption[] = options.categories.map((category) => ({
    id: category.id,
    label: category.name,
    checked: filters.categoryIds.includes(category.id),
    onToggle: () => toggleIn("categoryIds", category.id),
    start: <CategoryIcon sx={{ fontSize: 16, flexShrink: 0, color: "secondary.main" }} />,
  }));
  // NULL bucket, same deal as the app section (the company view never shows
  // this section — its rows are contracts, not issues)
  categoryOptions.push({
    id: "no-category",
    label: t("filters.noCategory"),
    checked: filters.noCategory,
    onToggle: () => toggleFlag("noCategory"),
    start: <CategoryIcon sx={{ fontSize: 16, flexShrink: 0, color: "secondary.main", opacity: 0.55 }} />,
  });

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
    taskType: {
      // หัวข้ออ่านจาก `Boards.detail.taskType` ("ประเภทงาน") — มีครบทั้ง th/en
      title: bt("detail.taskType"),
      icon: <TaskIcon sx={{ fontSize: 18 }} />,
      count: filters.taskTypes.length + (filters.noTaskType ? 1 : 0),
      options: taskTypeOptions,
    },
    category: {
      title: t("filters.category"),
      icon: <CategoryIcon sx={{ fontSize: 18 }} />,
      count: filters.categoryIds.length + (filters.noCategory ? 1 : 0),
      options: categoryOptions,
    },
    app: {
      title: t("filters.app"),
      icon: <AppsIcon sx={{ fontSize: 18 }} />,
      count: filters.appIds.length + (filters.noApp ? 1 : 0),
      options: appOptions,
    },
    kind: {
      // หัวข้อ "ประเภท" — ใช้ key `columns.type` เดียวกับคอลัมน์บนตาราง
      title: t("columns.type"),
      icon: <SwapHorizIcon sx={{ fontSize: 18 }} />,
      count: filters.kinds.length,
      options: kindOptions,
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
