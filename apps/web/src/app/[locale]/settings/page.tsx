"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  TextField,
  Typography,
  Tab,
  Tabs,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  Card,
  CardContent,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { Pagination } from "@/components/pagination";
import { PaginatedResponse } from "@kanban/shared";
import DragHandleIcon from "@mui/icons-material/DragHandle";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DataTable, { DataTableHead, DataTableBody, DataTableRow, DataTableCell } from "@/components/data-table";
import RequirePermission from "@/components/require-permission";
import { useAuthStore } from "@/lib/auth-store";
import BoltIcon from "@mui/icons-material/Bolt";
import { usePermissions } from "@/lib/permissions";
import { apiFetch, ApiError } from "@/lib/api";
import { useNotification } from "@/components/notification";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  fetchLabels,
  createLabel,
  updateLabel,
  toggleLabelActive,
  checkLabel,
  deleteLabel,
  type Label,
} from "@/lib/labels-api";
import ColorPicker from "@/components/color-picker";

interface App {
  id: number;
  name: string;
  isVisible: boolean;
  issueCount: number;
}

interface Category {
  id: number;
  name: string;
  isVisible: boolean;
  position: string | null;
  issueCount: number;
}

interface Position {
  id: number;
  name: string;
  isActive: boolean;
}

interface IssueStatus {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  issueCount: number;
  timerEnabled: boolean;
  timeEntryEnabled: boolean;

}

interface IssuePriority {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  issueCount: number;
}

function getStatusColor(statusName: string, theme: any): string {
  const key = statusName.toLowerCase();
  return theme.custom.columnColors[key] ?? theme.custom.columnColors.default;
}

function SortableStatusRow({
  status,
  index,
  canUpdate,
  canDelete,
  onToggle,

  onEdit,
  onDelete,
}: {
  status: IssueStatus;
  index: number;
  canUpdate: boolean;
  canDelete: boolean;
  onToggle: (s: IssueStatus) => void;

  onEdit: (s: IssueStatus) => void;
  onDelete: (id: number) => void;
}) {
  const theme = useTheme();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id });

  const statusColor = getStatusColor(status.name, theme);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1000 : "auto",
    position: "relative" as const,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...attributes}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        p: 2,
        mb: 1,
        bgcolor: isDragging ? theme.palette.sky.dark : theme.palette.common.white,
        border: "1px solid",
        borderColor: isDragging ? statusColor : theme.custom.tableBorder,
        borderRadius: 2,
        boxShadow: isDragging ? theme.custom.cardShadow : "none",
        cursor: "grab",
        transition: "all 0.2s ease",
        "&:hover": {
          borderColor: statusColor,
          boxShadow: `0 2px 8px ${statusColor}30`,
        },
      }}
    >
      <Box
        {...listeners}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 1.5,
          cursor: "grab",
          color: theme.palette.text.secondary,
          flexShrink: 0,
          transition: "all 0.2s ease",
          "&:hover": {
            bgcolor: statusColor,
            color: theme.palette.common.white,
          },
          "&:active": {
            cursor: "grabbing",
          },
        }}
      >
        <DragHandleIcon fontSize="small" />
      </Box>

      <Box
        sx={{
          minWidth: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: statusColor,
          color: theme.palette.common.white,
          borderRadius: 2,
          fontWeight: 700,
          fontSize: 14,
          flexShrink: 0,
          boxShadow: `0 2px 8px ${statusColor}50`,
        }}
      >
        {index + 1}
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              bgcolor: statusColor,
              flexShrink: 0,
            }}
          />
          <Typography variant="body2" fontWeight={600} noWrap sx={{ color: theme.palette.navy.main }}>
            {status.name}
          </Typography>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ display: "block", lineHeight: 1.4, mt: 0.5, pl: 2 }}
        >
          {status.description ?? "—"}
        </Typography>
      </Box>

      <Chip
        label={status.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
        color={status.isActive ? "success" : "error"}
        size="small"
        variant="outlined"
        sx={{
          height: 26,
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
        }}
      />

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
        {canUpdate && (
          <FormControlLabel
            control={
              <Switch
                checked={status.isActive}
                onChange={() => onToggle(status)}
                size="small"
              />
            }
            label=""
            sx={{ mr: 0.5 }}
          />
        )}
        {canUpdate && (
          <IconButton
            size="small"
            onClick={() => onEdit(status)}
            sx={{
              color: theme.palette.text.secondary,
              "&:hover": {
                bgcolor: `${statusColor}20`,
                color: statusColor,
              },
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        )}
        {canDelete && (
          <IconButton
            size="small"
            onClick={() => onDelete(status.id)}
            sx={{
              color: theme.palette.text.secondary,
              "&:hover": {
                bgcolor: "#ffebee",
                color: "#d32f2f",
              },
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </Box>
  );
}

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const router = useRouter();
  const { can } = usePermissions();
  const token = useAuthStore((s) => s.token);
  const { notify } = useNotification();
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const [apps, setApps] = useState<App[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [priorities, setPriorities] = useState<IssuePriority[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [page, setPage] = useState(1);

  const [appDialogOpen, setAppDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<App | null>(null);
  const [appForm, setAppForm] = useState({ name: "" });

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", position: "" });

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<IssueStatus | null>(null);
  const [statusForm, setStatusForm] = useState({
    name: "",
    description: "",
    timerEnabled: false,
    timeEntryEnabled: false,

  });

  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [editingPriority, setEditingPriority] = useState<IssuePriority | null>(null);
  const [priorityForm, setPriorityForm] = useState({
    name: "",
    description: "",
  });

  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [labelForm, setLabelForm] = useState({ name: "", color: "default" });

  const [deleteTarget, setDeleteTarget] = useState<{ type: "app" | "category" | "status" | "priority" | "label"; id: number; name: string } | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<{ canDelete: boolean; issueCount: number; columnCount: number } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canViewApps = can("app.view");
  const canViewCategories = can("category.view");
  const canViewStatuses = can("status.view");
  const canViewPriorities = can("priority.view");
  const canViewPositions = can("position.view");
  const canViewLabels = can("label.view");

  const statusSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleStatusDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = Number(active.id);
    const overId = Number(over.id);
    const oldIndex = statuses.findIndex((s) => s.id === activeId);
    const newIndex = statuses.findIndex((s) => s.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(statuses, oldIndex, newIndex);
    setStatuses(reordered);

    try {
      await apiFetch(
        "/issue-statuses/reorder",
        {
          method: "PATCH",
          body: JSON.stringify({
            items: reordered.map((s, idx) => ({ id: s.id, sortOrder: idx + 1 })),
          }),
        },
        token,
      );
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
      const updated = await apiFetch<PaginatedResponse<IssueStatus>>("/issue-statuses", {}, token);
      setStatuses(updated.data);
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const requests: Promise<any>[] = [];
    if (canViewApps) {
      requests.push(apiFetch<PaginatedResponse<App>>("/apps?page=1&limit=100", {}, token).then(r => r.data));
    }
    if (canViewCategories) {
      requests.push(apiFetch<PaginatedResponse<Category>>("/categories?page=1&limit=100", {}, token).then(r => r.data));
    }
    if (canViewPositions) {
      requests.push(apiFetch<PaginatedResponse<Position>>("/positions?page=1&limit=100", {}, token).then(r => r.data));
    }
    if (canViewStatuses) requests.push(apiFetch<PaginatedResponse<IssueStatus>>("/issue-statuses?page=1&limit=100", {}, token).then(r => r.data));
    if (canViewPriorities) requests.push(apiFetch<PaginatedResponse<IssuePriority>>("/issue-priorities?page=1&limit=100", {}, token).then(r => r.data));
    if (canViewLabels) requests.push(fetchLabels().then(r => r.data));

    Promise.all(requests)
      .then((results) => {
        let idx = 0;
        if (canViewApps) {
          setApps(results[idx++]);
        }
        if (canViewCategories) {
          setCategories(results[idx++]);
        }
        if (canViewPositions) {
          setPositions(results[idx++]);
        }
        if (canViewStatuses) setStatuses(results[idx++]);
        if (canViewPriorities) setPriorities(results[idx++]);
        if (canViewLabels) setLabels(results[idx++]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canViewApps, canViewCategories, canViewStatuses, canViewPriorities, canViewPositions, canViewLabels, token]);

  // Support deep links such as /settings?tab=statuses — used by the back link on /automation.
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (!tabParam) return;
    const contents = [
      ...(canViewApps ? ["apps"] : []),
      ...(canViewCategories ? ["categories"] : []),
      ...(canViewStatuses ? ["statuses"] : []),
      ...(canViewPriorities ? ["priorities"] : []),
      ...(canViewLabels ? ["labels"] : []),
    ];
    const idx = contents.indexOf(tabParam);
    if (idx >= 0) setTab(idx);
  }, [canViewApps, canViewCategories, canViewStatuses, canViewPriorities, canViewLabels]);

  function openAddApp() {
    setEditingApp(null);
    setAppForm({ name: "" });
    setAppDialogOpen(true);
  }

  function openEditApp(app: App) {
    setEditingApp(app);
    setAppForm({ name: app.name });
    setAppDialogOpen(true);
  }

  async function handleSaveApp() {
    try {
      const payload = { name: appForm.name };
      if (editingApp) {
        await apiFetch(`/apps/${editingApp.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }, token);
        notify(t("appUpdated"));
      } else {
        await apiFetch("/apps", {
          method: "POST",
          body: JSON.stringify(payload),
        }, token);
        notify(t("appCreated"));
      }
      const updated = await apiFetch<PaginatedResponse<App>>("/apps?page=1&limit=100", {}, token);
      setApps(updated.data);
      setAppDialogOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleToggleAppActive(app: App) {
    try {
      await apiFetch(`/apps/${app.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !app.isVisible }),
      }, token);
      setApps((prev) =>
        prev.map((a) => (a.id === app.id ? { ...a, isVisible: !a.isVisible } : a)),
      );
      notify(t("appToggled"));
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleDeleteApp(id: number) {
    const app = apps.find((a) => a.id === id);
    if (!app) return;
    setDeleteTarget({ type: "app", id, name: app.name });
    setDeleteLoading(true);
    try {
      const result = await apiFetch<{ canDelete: boolean; issueCount: number }>(
        `/apps/${id}/check`,
        {},
        token,
      );
      setDeleteCheck({ ...result, columnCount: 0 });
    } catch (err) {
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  function openAddCategory() {
    setEditingCategory(null);
    setCategoryForm({ name: "", position: "" });
    setCategoryDialogOpen(true);
  }

  function openEditCategory(category: Category) {
    setEditingCategory(category);
    setCategoryForm({ name: category.name, position: category.position ?? "" });
    setCategoryDialogOpen(true);
  }

  async function handleSaveCategory() {
    try {
      const payload = {
        name: categoryForm.name,
        position: categoryForm.position || undefined,
      };
      if (editingCategory) {
        await apiFetch(`/categories/${editingCategory.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }, token);
        notify(t("categoryUpdated"));
      } else {
        await apiFetch("/categories", {
          method: "POST",
          body: JSON.stringify(payload),
        }, token);
        notify(t("categoryCreated"));
      }
      const updated = await apiFetch<PaginatedResponse<Category>>("/categories?page=1&limit=100", {}, token);
      setCategories(updated.data);
      setCategoryDialogOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleToggleCategoryActive(category: Category) {
    try {
      await apiFetch(`/categories/${category.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !category.isVisible }),
      }, token);
      setCategories((prev) =>
        prev.map((c) => (c.id === category.id ? { ...c, isVisible: !c.isVisible } : c)),
      );
      notify(t("categoryToggled"));
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleDeleteCategory(id: number) {
    const category = categories.find((c) => c.id === id);
    if (!category) return;
    setDeleteTarget({ type: "category", id, name: category.name });
    setDeleteLoading(true);
    try {
      const result = await apiFetch<{ canDelete: boolean; issueCount: number }>(
        `/categories/${id}/check`,
        {},
        token,
      );
      setDeleteCheck({ ...result, columnCount: 0 });
    } catch (err) {
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  function openAddStatus() {
    setEditingStatus(null);

    setStatusDialogOpen(true);
  }

  function openEditStatus(status: IssueStatus) {
    setEditingStatus(status);
    setStatusForm({
      name: status.name,
      description: status.description ?? "",
      timerEnabled: status.timerEnabled,
      timeEntryEnabled: status.timeEntryEnabled,

    });
    setStatusDialogOpen(true);
  }

  async function handleSaveStatus() {
    try {
      const payload = {
        name: statusForm.name,
        description: statusForm.description || undefined,
        timerEnabled: statusForm.timerEnabled,
        timeEntryEnabled: statusForm.timeEntryEnabled,

      };
      if (editingStatus) {
        await apiFetch(`/issue-statuses/${editingStatus.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }, token);
        notify(t("statusUpdated"));
      } else {
        await apiFetch("/issue-statuses", {
          method: "POST",
          body: JSON.stringify(payload),
        }, token);
        notify(t("statusCreated"));
      }
      const updated = await apiFetch<PaginatedResponse<IssueStatus>>("/issue-statuses", {}, token);
      setStatuses(updated.data);
      setStatusDialogOpen(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleToggleStatusActive(status: IssueStatus) {
    try {
      await apiFetch(`/issue-statuses/${status.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !status.isActive }),
      }, token);
      setStatuses((prev) =>
        prev.map((s) => (s.id === status.id ? { ...s, isActive: !s.isActive } : s)),
      );
      notify(t("statusToggled"));
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }



















  async function handleDeleteStatus(id: number) {
    const status = statuses.find((s) => s.id === id);
    if (!status) return;
    setDeleteTarget({ type: "status", id, name: status.name });
    setDeleteLoading(true);
    try {
const result = await apiFetch<{ canDelete: boolean; issueCount: number; columnCount: number }>(
      `/issue-statuses/${id}/check`,
      {},
      token,
    );
    setDeleteCheck(result);
  } catch (err) {
    setDeleteTarget(null);
  } finally {
    setDeleteLoading(false);
  }
}

  function openAddPriority() {
    setEditingPriority(null);
    setPriorityForm({ name: "", description: "" });
    setPriorityDialogOpen(true);
  }

  function openEditPriority(priority: IssuePriority) {
    setEditingPriority(priority);
    setPriorityForm({
      name: priority.name,
      description: priority.description ?? "",
    });
    setPriorityDialogOpen(true);
  }

  async function handleSavePriority() {
    try {
      const payload = {
        name: priorityForm.name,
        description: priorityForm.description || undefined,
      };
      if (editingPriority) {
        await apiFetch(`/issue-priorities/${editingPriority.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }, token);
        notify(t("priorityUpdated"));
      } else {
        await apiFetch("/issue-priorities", {
          method: "POST",
          body: JSON.stringify(payload),
        }, token);
        notify(t("priorityCreated"));
      }
      const updated = await apiFetch<PaginatedResponse<IssuePriority>>("/issue-priorities?page=1&limit=100", {}, token);
      setPriorities(updated.data);
      setPriorityDialogOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleTogglePriorityActive(priority: IssuePriority) {
    try {
      await apiFetch(`/issue-priorities/${priority.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !priority.isActive }),
      }, token);
      setPriorities((prev) =>
        prev.map((p) => (p.id === priority.id ? { ...p, isActive: !p.isActive } : p)),
      );
      notify(t("priorityToggled"));
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleDeletePriority(id: number) {
    const priority = priorities.find((p) => p.id === id);
    if (!priority) return;
    setDeleteTarget({ type: "priority", id, name: priority.name });
    setDeleteLoading(true);
    try {
      const result = await apiFetch<{ canDelete: boolean; issueCount: number }>(
        `/issue-priorities/${id}/check`,
        {},
        token,
      );
      setDeleteCheck({ ...result, columnCount: 0 });
    } catch (err) {
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  function openAddLabel() {
    setEditingLabel(null);
    setLabelForm({ name: "", color: "default" });
    setLabelDialogOpen(true);
  }

  function openEditLabel(label: Label) {
    setEditingLabel(label);
    setLabelForm({ name: label.name, color: label.color });
    setLabelDialogOpen(true);
  }

  async function handleSaveLabel() {
    try {
      const payload = {
        name: labelForm.name,
        color: labelForm.color,
      };
      if (editingLabel) {
        await updateLabel(editingLabel.id, payload);
        notify(t("labelUpdated"));
      } else {
        await createLabel(payload);
        notify(t("labelCreated"));
      }
      const updated = await fetchLabels();
      setLabels(updated.data);
      setLabelDialogOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleToggleLabelActive(label: Label) {
    try {
      await toggleLabelActive(label.id, !label.isActive);
      setLabels((prev) =>
        prev.map((l) => (l.id === label.id ? { ...l, isActive: !l.isActive } : l)),
      );
      notify(t("labelToggled"));
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleDeleteLabel(id: number) {
    const label = labels.find((l) => l.id === id);
    if (!label) return;
    setDeleteTarget({ type: "label", id, name: label.name });
    setDeleteLoading(true);
    try {
      const result = await checkLabel(id);
      setDeleteCheck({ ...result, columnCount: 0 });
    } catch (err) {
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "app") {
        await apiFetch(`/apps/${deleteTarget.id}`, { method: "DELETE" }, token);
        setApps((prev) => prev.filter((a) => a.id !== deleteTarget.id));
        notify(t("appDeleted"));
      } else if (deleteTarget.type === "category") {
        await apiFetch(`/categories/${deleteTarget.id}`, { method: "DELETE" }, token);
        setCategories((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        notify(t("categoryDeleted"));
      } else if (deleteTarget.type === "status") {
        await apiFetch(`/issue-statuses/${deleteTarget.id}`, { method: "DELETE" }, token);
        setStatuses((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        notify(t("statusDeleted"));
      } else if (deleteTarget.type === "priority") {
        await apiFetch(`/issue-priorities/${deleteTarget.id}`, { method: "DELETE" }, token);
        setPriorities((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        notify(t("priorityDeleted"));
      } else if (deleteTarget.type === "label") {
        await deleteLabel(deleteTarget.id);
        setLabels((prev) => prev.filter((l) => l.id !== deleteTarget.id));
        notify(t("labelDeleted"));
      }
      setDeleteTarget(null);
      setDeleteCheck(null);
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  if (!mounted) return null;

  if (loading) {
    return (
      <DashboardLayout>
        <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
          <CircularProgress />
        </Box>
      </DashboardLayout>
    );
  }

  const tabs = [
    ...(canViewApps ? [{ label: t("tabApps"), content: "apps" }] : []),
    ...(canViewCategories ? [{ label: t("tabCategories"), content: "categories" }] : []),
    ...(canViewStatuses ? [{ label: t("tabStatuses"), content: "statuses" }] : []),
    ...(canViewPriorities ? [{ label: t("tabPriorities"), content: "priorities" }] : []),
    ...(canViewLabels ? [{ label: t("tabLabels"), content: "labels" }] : []),
  ];

  return (
    <RequirePermission permission="permission.update">
      <DashboardLayout>
        <Box>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}
          >
            {tabs.map((t2) => (
              <Tab key={t2.label} label={t2.label} />
            ))}
          </Tabs>

          {tabs[tab]?.content === "apps" && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                {can("app.create") && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openAddApp}>
                    {t("addApp")}
                  </Button>
                )}
              </Box>
              <DataTable>
                <DataTableHead>
                  <DataTableRow>
                    <DataTableCell>{t("columnName")}</DataTableCell>
                    <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                    <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {apps.map((app) => (
                    <DataTableRow key={app.id}>
                      <DataTableCell>{app.name}</DataTableCell>
                      <DataTableCell align="center">
                        <Chip
                          label={app.isVisible ? t("active") : t("inactive")}
                          color={app.isVisible ? "success" : "error"}
                          size="small"
                          variant="outlined"
                        />
                      </DataTableCell>
                      <DataTableCell align="right">
                        {can("app.update") && (
                          <FormControlLabel
                            control={
                              <Switch
                                checked={app.isVisible}
                                onChange={() => handleToggleAppActive(app)}
                                size="small"
                              />
                            }
                            label=""
                            sx={{ mr: 1 }}
                          />
                        )}
                        {can("app.update") && (
                          <IconButton size="small" onClick={() => openEditApp(app)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                        {can("app.delete") && (
                          <IconButton size="small" onClick={() => handleDeleteApp(app.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
              <Pagination
                page={page}
                totalPages={Math.max(1, Math.ceil(apps.length / 10))}
                total={apps.length}
                limit={10}
                onPageChange={setPage}
              />
            </Box>
          )}

          {tabs[tab]?.content === "categories" && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                {can("category.create") && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openAddCategory}>
                    {t("addCategory")}
                  </Button>
                )}
              </Box>
              <DataTable>
                <DataTableHead>
                  <DataTableRow>
                    <DataTableCell>{t("columnName")}</DataTableCell>
                    <DataTableCell>{t("columnPosition")}</DataTableCell>
                    <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                    <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {categories.map((category) => (
                    <DataTableRow key={category.id}>
                      <DataTableCell>{category.name}</DataTableCell>
                      <DataTableCell>{category.position ?? "—"}</DataTableCell>
                      <DataTableCell align="center">
                        <Chip
                          label={category.isVisible ? t("active") : t("inactive")}
                          color={category.isVisible ? "success" : "error"}
                          size="small"
                          variant="outlined"
                        />
                      </DataTableCell>
                      <DataTableCell align="right">
                        {can("category.update") && (
                          <FormControlLabel
                            control={
                              <Switch
                                checked={category.isVisible}
                                onChange={() => handleToggleCategoryActive(category)}
                                size="small"
                              />
                            }
                            label=""
                            sx={{ mr: 1 }}
                          />
                        )}
                        {can("category.update") && (
                          <IconButton size="small" onClick={() => openEditCategory(category)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                        {can("category.delete") && (
                          <IconButton size="small" onClick={() => handleDeleteCategory(category.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
              <Pagination
                page={page}
                totalPages={Math.max(1, Math.ceil(categories.length / 10))}
                total={categories.length}
                limit={10}
                onPageChange={setPage}
              />
            </Box>
          )}

          {tabs[tab]?.content === "statuses" && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
                <Box>
                  <Typography variant="h6" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
                    {t("tabStatuses")}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    ลากเพื่อเรียงลำดับสถานะ
                  </Typography>
                </Box>
                
<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
  <Tooltip title="กฎ Automation">
    <IconButton
      color="primary"
      aria-label="กฎ Automation"
      onClick={() => router.push("/automation")}
      sx={{
        border: 1,
        borderColor: "primary.main",
        borderRadius: 1,
        width: 40,
        height: 40,
        p: 0,
      }}
    >
      <BoltIcon fontSize="small" />
    </IconButton>
  </Tooltip>

  {can("status.create") && (
    <Button
      variant="contained"
      startIcon={<AddIcon />}
      onClick={openAddStatus}
      sx={{ height: 40 }}
    >
      {t("addStatus")}
    </Button>
  )}
</Box>

              </Box>
              <DndContext
                sensors={statusSensors}
                collisionDetection={closestCorners}
                onDragEnd={handleStatusDragEnd}
              >
                <SortableContext
                  items={statuses.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <Box>
                    {statuses.map((status, index) => (
                      <SortableStatusRow
                        key={status.id}
                        status={status}
                        index={index}
                        canUpdate={can("status.update")}
                        canDelete={can("status.delete")}
                        onToggle={handleToggleStatusActive}

                        onEdit={openEditStatus}
                        onDelete={handleDeleteStatus}
                      />
                    ))}
                  </Box>
                </SortableContext>
              </DndContext>
            </Box>
          )}

          {tabs[tab]?.content === "priorities" && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                {can("priority.create") && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openAddPriority}>
                    {t("addPriority")}
                  </Button>
                )}
              </Box>
              <DataTable>
                <DataTableHead>
                  <DataTableRow>
                    <DataTableCell>{t("columnName")}</DataTableCell>
                    <DataTableCell>{t("columnDescription")}</DataTableCell>
                    <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                    <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {priorities.map((priority) => (
                    <DataTableRow key={priority.id}>
                      <DataTableCell>{priority.name}</DataTableCell>
                      <DataTableCell>{priority.description ?? "—"}</DataTableCell>
                      <DataTableCell align="center">
                        <Chip
                          label={priority.isActive ? t("active") : t("inactive")}
                          color={priority.isActive ? "success" : "error"}
                          size="small"
                          variant="outlined"
                        />
                      </DataTableCell>
                      <DataTableCell align="right">
                        {can("priority.update") && (
                          <FormControlLabel
                            control={
                              <Switch
                                checked={priority.isActive}
                                onChange={() => handleTogglePriorityActive(priority)}
                                size="small"
                              />
                            }
                            label=""
                            sx={{ mr: 1 }}
                          />
                        )}
                        {can("priority.update") && (
                          <IconButton size="small" onClick={() => openEditPriority(priority)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                        {can("priority.delete") && (
                          <IconButton size="small" onClick={() => handleDeletePriority(priority.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
              <Pagination
                page={page}
                totalPages={Math.max(1, Math.ceil(priorities.length / 10))}
                total={priorities.length}
                limit={10}
                onPageChange={setPage}
              />
            </Box>
          )}

          {tabs[tab]?.content === "labels" && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                {can("label.create") && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openAddLabel}>
                    {t("addLabel")}
                  </Button>
                )}
              </Box>
              <DataTable>
                <DataTableHead>
                  <DataTableRow>
                    <DataTableCell>{t("columnName")}</DataTableCell>
                    <DataTableCell>{t("columnColor")}</DataTableCell>
                    <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                    <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {labels.map((label) => (
                    <DataTableRow key={label.id}>
                      <DataTableCell>{label.name}</DataTableCell>
                      <DataTableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Box
                            sx={{
                              width: 20,
                              height: 20,
                              borderRadius: 1,
                              bgcolor: label.color,
                              border: "1px solid",
                              borderColor: "divider",
                            }}
                          />
                          <Typography variant="body2" color="text.secondary">
                            {label.color}
                          </Typography>
                        </Box>
                      </DataTableCell>
                      <DataTableCell align="center">
                        <Chip
                          label={label.isActive ? t("active") : t("inactive")}
                          color={label.isActive ? "success" : "error"}
                          size="small"
                          variant="outlined"
                        />
                      </DataTableCell>
                      <DataTableCell align="right">
                        {can("label.update") && (
                          <FormControlLabel
                            control={
                              <Switch
                                checked={label.isActive}
                                onChange={() => handleToggleLabelActive(label)}
                                size="small"
                              />
                            }
                            label=""
                            sx={{ mr: 1 }}
                          />
                        )}
                        {can("label.update") && (
                          <IconButton size="small" onClick={() => openEditLabel(label)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                        {can("label.delete") && (
                          <IconButton size="small" onClick={() => handleDeleteLabel(label.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
              <Pagination
                page={page}
                totalPages={Math.max(1, Math.ceil(labels.length / 10))}
                total={labels.length}
                limit={10}
                onPageChange={setPage}
              />
            </Box>
          )}

          <Dialog open={appDialogOpen} onClose={() => setAppDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>{editingApp ? t("editApp") : t("addApp")}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                <TextField
                  label={t("columnName")}
                  value={appForm.name}
                  onChange={(e) => setAppForm({ ...appForm, name: e.target.value })}
                  fullWidth
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setAppDialogOpen(false)}>{t("cancel")}</Button>
              <Button variant="contained" onClick={handleSaveApp}>
                {t("save")}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={categoryDialogOpen} onClose={() => setCategoryDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>{editingCategory ? t("editCategory") : t("addCategory")}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                <TextField
                  label={t("columnName")}
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  fullWidth
                />
                <FormControl fullWidth>
                  <InputLabel>{t("columnPosition")}</InputLabel>
                  <Select
                    value={categoryForm.position}
                    label={t("columnPosition")}
                    onChange={(e) => setCategoryForm({ ...categoryForm, position: e.target.value })}
                  >
                    <MenuItem value="">—</MenuItem>
                    {positions.filter(p => p.isActive).map((position) => (
                      <MenuItem key={position.id} value={position.name}>
                        {position.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCategoryDialogOpen(false)}>{t("cancel")}</Button>
              <Button variant="contained" onClick={handleSaveCategory}>
                {t("save")}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>{editingStatus ? t("editStatus") : t("addStatus")}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                <TextField
                  label={t("columnName")}
                  value={statusForm.name}
                  onChange={(e) => setStatusForm({ ...statusForm, name: e.target.value })}
                  fullWidth
                />
                <TextField
                  label={t("columnDescription")}
                  value={statusForm.description}
                  onChange={(e) => setStatusForm({ ...statusForm, description: e.target.value })}
                  fullWidth
                  multiline
                  rows={2}
                />



              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setStatusDialogOpen(false)}>{t("cancel")}</Button>
              <Button variant="contained" onClick={handleSaveStatus}>
                {t("save")}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={priorityDialogOpen} onClose={() => setPriorityDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>{editingPriority ? t("editPriority") : t("addPriority")}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                <TextField
                  label={t("columnName")}
                  value={priorityForm.name}
                  onChange={(e) => setPriorityForm({ ...priorityForm, name: e.target.value })}
                  fullWidth
                />
                <TextField
                  label={t("columnDescription")}
                  value={priorityForm.description}
                  onChange={(e) => setPriorityForm({ ...priorityForm, description: e.target.value })}
                  fullWidth
                  multiline
                  rows={2}
                />

              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPriorityDialogOpen(false)}>{t("cancel")}</Button>
              <Button variant="contained" onClick={handleSavePriority}>
                {t("save")}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={labelDialogOpen} onClose={() => setLabelDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>{editingLabel ? t("editLabel") : t("addLabel")}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                <TextField
                  label={t("columnName")}
                  value={labelForm.name}
                  onChange={(e) => setLabelForm({ ...labelForm, name: e.target.value })}
                  fullWidth
                />
                <ColorPicker
                  value={labelForm.color}
                  onChange={(color) => setLabelForm({ ...labelForm, color })}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setLabelDialogOpen(false)}>{t("cancel")}</Button>
              <Button variant="contained" onClick={handleSaveLabel}>
                {t("save")}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteCheck(null); }} maxWidth="xs">
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogContent>
              {deleteLoading ? (
                <CircularProgress size={24} />
              ) : deleteCheck && !deleteCheck.canDelete && deleteTarget ? (
                <Typography variant="body2">
                  {t("deleteInUse", { name: deleteTarget.name, issueCount: deleteCheck.issueCount, columnCount: deleteCheck.columnCount })}
                </Typography>
              ) : deleteTarget ? (
                <Typography variant="body2">
                  {t("deleteConfirmMessage", {
                    type: deleteTarget.type === "app" ? t("app") : deleteTarget.type === "category" ? t("category") : deleteTarget.type === "status" ? t("status") : deleteTarget.type === "priority" ? t("priority") : t("label"),
                    name: deleteTarget.name,
                  })}
                </Typography>
              ) : null}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => { setDeleteTarget(null); setDeleteCheck(null); }}>{t("cancel")}</Button>
              {deleteCheck?.canDelete && (
                <Button variant="contained" color="error" onClick={confirmDelete}>
                  {t("delete")}
                </Button>
              )}
            </DialogActions>
          </Dialog>
        </Box>
      </DashboardLayout>
    </RequirePermission>
  );
}
