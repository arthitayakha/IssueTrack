"use client";

import { useState, type ReactNode } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Popover,
  TextField,
  Typography,
} from "@mui/material";
import { useTheme, type Theme } from "@mui/material/styles";
import FilterListIcon from "@mui/icons-material/FilterList";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ViewKanbanIcon from "@mui/icons-material/ViewKanban";
import AppsIcon from "@mui/icons-material/Apps";
import FlagIcon from "@mui/icons-material/Flag";
import CategoryIcon from "@mui/icons-material/Category";
import PersonIcon from "@mui/icons-material/Person";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { useTranslations } from "next-intl";
import { activeFilterCount, EMPTY_FILTERS } from "@/lib/reports-api";
import type { FilterOptions, ReportFilters, ReportView } from "@/lib/reports-api";

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

type PanelOption = {
  id: number;
  label: string;
  checked: boolean;
  onToggle: () => void;
  start?: ReactNode;
};

const FILTER_VISIBLE_ITEMS = 6;

/* ---------------- per-view section order ---------------- */

type SectionKey = "assignee" | "status" | "priority" | "category" | "app" | "reporter";

/**
 * Which filter sections each report view shows, top to bottom — every view
 * used to open the identical six sections, which is why the panel felt the
 * same on every dropdown. `assignee` is labelled โปรแกรมเมอร์ (same wording
 * as the by-assignee table header) and leads the issues view; the summary
 * views end on it and skip the reporter section entirely.
 */
const VIEW_SECTIONS: Record<ReportView, SectionKey[]> = {
  issues: ["assignee", "status", "priority", "category", "app", "reporter"],
  assignee: ["status", "priority", "category", "app", "assignee"],
  app: ["status", "priority", "category", "app", "assignee"],
};

/** Collapsible section with its own search + "show all" — mirrors the board's FilterSection. */
function FilterSection({
  title,
  icon,
  count,
  options,
  initialOpen,
}: {
  title: string;
  icon: ReactNode;
  count: number;
  options: PanelOption[];
  initialOpen: boolean;
}) {
  const t = useTranslations("Reports");
  const [open, setOpen] = useState(initialOpen);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed
    ? options.filter((option) => option.label.toLowerCase().includes(trimmed))
    : options;
  const canExpand = options.length > FILTER_VISIBLE_ITEMS;
  const expanded = showAll || Boolean(trimmed);
  const visible = canExpand && !expanded ? filtered.slice(0, FILTER_VISIBLE_ITEMS) : filtered;
  const isEmpty = options.length === 0;

  return (
    <Box sx={{ borderBottom: "1px solid", borderColor: "divider", "&:last-of-type": { borderBottom: 0 } }}>
      <Box sx={{ display: "flex", alignItems: "center", pr: 1.25 }}>
        <Box
          component="button"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 1.25,
            border: 0,
            bgcolor: "transparent",
            color: "text.primary",
            textAlign: "left",
            fontFamily: "inherit",
            cursor: "pointer",
            "&:hover": { bgcolor: "action.hover" },
          }}
        >
          <ExpandMoreIcon
            sx={{
              fontSize: 20,
              color: "text.secondary",
              transition: "transform 0.15s ease",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            }}
          />
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              flexShrink: 0,
              borderRadius: "8px",
              bgcolor: "action.selected",
              color: "primary.main",
            }}
          >
            {icon}
          </Box>
          <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ flex: 1 }}>
            {title}
          </Typography>
          {count > 0 && (
            <Chip
              size="small"
              color="primary"
              label={count}
              sx={{ height: 20, minWidth: 20, fontSize: 11, fontWeight: 700 }}
            />
          )}
        </Box>
      </Box>

      {open && (
        <Box sx={{ px: 2, pb: 1.75 }}>
          {canExpand && (
            <TextField
              fullWidth
              size="small"
              placeholder={t("filters.searchPlaceholder")}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setShowAll(false);
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                  </InputAdornment>
                ),
                endAdornment: query ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQuery("")} aria-label="clear">
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
              sx={{ mb: 1.25, "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
            />
          )}

          {isEmpty || filtered.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
              {t("filters.noResults")}
            </Typography>
          ) : (
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
              {visible.map((option) => (
                <li key={option.id}>
                  <FormControlLabel
                    sx={{
                      m: 0,
                      width: "100%",
                      px: 0.5,
                      py: 0.25,
                      borderRadius: 1,
                      alignItems: "center",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                    control={
                      <Checkbox
                        size="small"
                        color="primary"
                        checked={option.checked}
                        onChange={option.onToggle}
                      />
                    }
                    label={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                        {option.start}
                        <Typography variant="body2" noWrap>
                          {option.label}
                        </Typography>
                      </Box>
                    }
                  />
                </li>
              ))}
            </Box>
          )}

          {canExpand && !trimmed && (
            <Button
              size="small"
              onClick={() => setShowAll((value) => !value)}
              sx={{ mt: 0.5, px: 1, textTransform: "none", fontWeight: 600 }}
            >
              {showAll ? t("filters.showLess") : t("filters.showMore")}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

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
  const totalSelected = activeFilterCount(filters);

  const startsOpen = (count: number, fallback: boolean) =>
    totalSelected > 0 ? count > 0 : fallback;

  const toggleIn = (
    key: "statusIds" | "priorityIds" | "categoryIds" | "appIds" | "assigneeIds" | "reporterIds",
    id: number,
  ) => {
    const current = filters[key];
    onFiltersChange({
      ...filters,
      [key]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    });
  };

  const statusOptions: PanelOption[] = options.statuses.map((status) => ({
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

  const appOptions: PanelOption[] = options.apps.map((app) => ({
    id: app.id,
    label: app.name,
    checked: filters.appIds.includes(app.id),
    onToggle: () => toggleIn("appIds", app.id),
    start: <AppsIcon sx={{ fontSize: 16, flexShrink: 0, color: "info.main" }} />,
  }));

  const priorityOptions: PanelOption[] = options.priorities.map((priority) => ({
    id: priority.id,
    label: priority.name,
    checked: filters.priorityIds.includes(priority.id),
    onToggle: () => toggleIn("priorityIds", priority.id),
    start: (
      <FlagIcon sx={{ fontSize: 16, flexShrink: 0, color: getPriorityColor(theme, priority.name) }} />
    ),
  }));

  const categoryOptions: PanelOption[] = options.categories.map((category) => ({
    id: category.id,
    label: category.name,
    checked: filters.categoryIds.includes(category.id),
    onToggle: () => toggleIn("categoryIds", category.id),
    start: <CategoryIcon sx={{ fontSize: 16, flexShrink: 0, color: "secondary.main" }} />,
  }));

  const assigneeOptions: PanelOption[] = options.people.map((person) => ({
    id: person.id,
    label: person.name,
    checked: filters.assigneeIds.includes(person.id),
    onToggle: () => toggleIn("assigneeIds", person.id),
    start: <PersonIcon sx={{ fontSize: 16, flexShrink: 0, color: "primary.main" }} />,
  }));

  const reporterOptions: PanelOption[] = options.reporters.map((person) => ({
    id: person.id,
    label: person.name,
    checked: filters.reporterIds.includes(person.id),
    onToggle: () => toggleIn("reporterIds", person.id),
    start: <ChatBubbleOutlineIcon sx={{ fontSize: 16, flexShrink: 0, color: "success.main" }} />,
  }));

  /** Everything a section needs, keyed once — the view decides the order. */
  const sections: Record<
    SectionKey,
    { title: string; icon: ReactNode; count: number; options: PanelOption[] }
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
    reporter: {
      title: t("filters.sectionReporter"),
      icon: <ChatBubbleOutlineIcon sx={{ fontSize: 18 }} />,
      count: filters.reporterIds.length,
      options: reporterOptions,
    },
  };

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      slotProps={{
        paper: {
          sx: {
            width: 360,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "72vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            boxShadow: theme.custom.cardShadow,
          },
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            borderRadius: "8px",
            bgcolor: "primary.main",
            color: "primary.contrastText",
          }}
        >
          <FilterListIcon fontSize="small" />
        </Box>
        <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }}>
          {t("filters.heading")}
        </Typography>
        {totalSelected > 0 && (
          <Chip
            size="small"
            color="primary"
            label={t("filters.selectedCount", { count: totalSelected })}
            sx={{ height: 22, fontSize: 11, fontWeight: 700 }}
          />
        )}
      </Box>

      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {VIEW_SECTIONS[view].map((key, index) => {
          const section = sections[key];
          return (
            <FilterSection
              // keyed by view too — switching view re-mounts the sections so
              // each one returns to its per-view default open state
              key={`${view}-${key}`}
              title={section.title}
              icon={section.icon}
              count={section.count}
              options={section.options}
              initialOpen={startsOpen(section.count, index === 0)}
            />
          );
        })}
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          px: 2,
          py: 1.25,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Button
          size="small"
          onClick={() => onFiltersChange({ ...EMPTY_FILTERS })}
          disabled={totalSelected === 0}
          startIcon={<DeleteOutlineIcon fontSize="small" />}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          {t("filters.clear")}
        </Button>
      </Box>
    </Popover>
  );
}
