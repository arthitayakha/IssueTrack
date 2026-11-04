"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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
  FormHelperText,
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
import { resolveStatusColor } from "@/lib/status-color";
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

/**
 * Mirror of the API's color rule (`issue-status.dto.ts`): a palette name the
 * theme resolves, or a raw hex value. Kept here so a typo in the picker's text
 * field is caught in Thai before the request is sent.
 */
const STATUS_COLOR_PATTERN =
  /^(green|red|yellow|blue|purple|orange|pink|gray|default|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}))$/;

/**
 * คอลัมน์ "บริษัท" ในตารางโชว์สูงสุดกี่ชิป — ที่เหลือยุบเป็น `+N`
 * (hover ดูรายชื่อผ่าน tooltip) กันแถวสูง/ยาวเมื่อผูกบริษัทหลายแห่ง
 */
const MAX_COMPANY_CHIPS = 3;

/** สถานะอายุทั้ง 5 สถานะ — ต้องตรงกับ `AppExpiryStatus` ฝั่งเซิร์ฟเวอร์ */
type ExpiryStatus = "none" | "normal" | "expiring_soon" | "critical" | "expired";

/**
 * 1 แถวของ `app_companies` — **คู่ แอป×บริษัท** พร้อมวันที่ของคู่นั้นเอง
 * (migration 1810 ย้ายวันที่ออกจาก `apps` ลงมาที่ตารางเชื่อม เพราะแต่ละ
 * บริษัทต่ออายุคนละช่วงเวลา)
 */
interface AppCompanyLink {
  id: number;
  name: string;
  /** `YYYY-MM-DD` from `app_companies.started_at`, null = ยังไม่กรอก */
  startedAt: string | null;
  /** `YYYY-MM-DD` from `app_companies.expires_at`, null = ไม่กำหนด */
  expiresAt: string | null;
  /** stored state **ของคู่นี้** — ปกติ / ใกล้หมดอายุ / วิกฤต / หมดอายุ / ไม่กำหนด */
  expiryStatus: ExpiryStatus;
}

interface App {
  id: number;
  name: string;
  isVisible: boolean;
  /** บริษัทที่ผูกอยู่ พร้อมวันที่ของแต่ละคู่ — many-to-many (`app_companies`) */
  companies: AppCompanyLink[];
  /** ISO datetime from `created_at` */
  createdAt: string;
  issueCount: number;
}

interface Company {
  id: number;
  name: string;
  isVisible: boolean;
  /** จำนวนแอปที่ผูกกับบริษัทนี้ (นับจาก `app_companies`) */
  appCount: number;
}

interface Category {
  id: number;
  name: string;
  isVisible: boolean;
  issueCount: number;
}

interface IssueStatus {
  id: number;
  name: string;
  description: string | null;
  /** Column color from `issue_statuses.color` ("#rrggbb" or a palette name). */
  color?: string | null;
  isActive: boolean;
  sortOrder: number;
  issueCount: number;
}

interface IssuePriority {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  issueCount: number;
}

function getStatusColor(status: IssueStatus, theme: any): string {
  return resolveStatusColor(theme, status.color, status.name);
}

/**
 * `2026-12-04` (a DATE column) or an ISO datetime → `4 ธ.ค. 2026`. A bare date
 * is parsed as *local* midnight so it never slides back a day in UTC+7, the
 * same rule the API uses when it formats `apps.expires_at`.
 */
function formatDay(value: string, locale: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * ต้องตรงกับ `EXPIRY_WARNING_DAYS` / `EXPIRY_CRITICAL_DAYS` ใน
 * `AppExpiryService` — ค่าสองตัวนี้ถูกจำลองฝั่ง client เพื่อให้ chip ใน
 * ฟอร์มอัปเดตทันทีที่ผู้ใช้เลือกวันที่ (ฝั่งเซิร์ฟเวอร์ยังเป็นคนตัวจริง)
 */
const EXPIRY_WARNING_DAYS = 30;
const EXPIRY_CRITICAL_DAYS = 7;

/** วันนี้แบบ local (Y/M/D) — กันไม่ให้เลื่อนวันผิดฝั่งเหมือนฝั่งเซิร์ฟเวอร์ */
function todayLocalIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * วันที่เหลือจากวันนี้ (local) ถึง `value` — `null` = ไม่ได้กรอกวันที่
 * ตัวเลขเดียวกับที่เซิร์ฟเวอร์ใช้ตัดสินสถานะและเขียนในข้อความแจ้งเตือน
 */
function daysLeftIso(value: string): number | null {
  if (!value) return null;
  return Math.round(
    (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${todayLocalIso()}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * สถานะอายุจากวันที่ในฟอร์ม — กฎเดียวกับเซิร์ฟเวอร์ (นับวันตามปฏิทิน):
 * ไม่มีวันที่ → ไม่กำหนด · ติดลบ → หมดอายุ · ≤7 → วิกฤต · ≤30 → ใกล้หมดอายุ
 */
function previewExpiryStatus(expiresAt: string): ExpiryStatus {
  const left = daysLeftIso(expiresAt);
  if (left === null) return "none";
  if (left < 0) return "expired";
  if (left <= EXPIRY_CRITICAL_DAYS) return "critical";
  if (left <= EXPIRY_WARNING_DAYS) return "expiring_soon";
  return "normal";
}

/**
 * คู่ที่ "ใกล้หมดอายุที่สุด" ของแอป — ตารางแท็บ `ข้อมูลระบบ` มี **1 แถวต่อแอป**
 * แต่วันที่เป็นรายบริษัทแล้ว จึงต้องเลือกมาชุดเดียว: เอาคู่ที่มีวันหมดอายุ
 * และวันเล็กที่สุด (เทียบ `YYYY-MM-DD` ซึ่งเรียงตรงกับลำดับเวลาอยู่แล้ว)
 * ถ้าไม่มีคู่ไหนกรอกวันหมดอายุเลย ก็ใช้คู่แรก (วันที่เริ่มใช้งานอาจยังมีค่า)
 */
function pickNearest(links: AppCompanyLink[]): AppCompanyLink | null {
  let nearest: AppCompanyLink | null = null;
  for (const link of links) {
    if (!link.expiresAt) continue;
    if (!nearest?.expiresAt || link.expiresAt < nearest.expiresAt) nearest = link;
  }
  return nearest ?? links[0] ?? null;
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

  const statusColor = getStatusColor(status, theme);

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
  const locale = useLocale();
  const router = useRouter();
  const { can } = usePermissions();
  const token = useAuthStore((s) => s.token);
  const { notify } = useNotification();
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const [apps, setApps] = useState<App[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [priorities, setPriorities] = useState<IssuePriority[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [page, setPage] = useState(1);

  const [appDialogOpen, setAppDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<App | null>(null);
  // ฟอร์มแอป = **บริษัทเดียว** (dropdown) + วันที่ 2 ช่องของคู่ แอป×บริษัท นั้น
  // (`""` = ยังไม่กรอก / ไม่กำหนด, `0` = ยังไม่ได้เลือกบริษัท)
  const [appForm, setAppForm] = useState({
    name: "",
    companyId: 0,
    startedAt: "",
    expiresAt: "",
  });
  /** inline error under the company picker (one is required) */
  const [appFormError, setAppFormError] = useState<string | null>(null);

  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [companyForm, setCompanyForm] = useState({ name: "" });

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "" });

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<IssueStatus | null>(null);
  const [statusForm, setStatusForm] = useState({
    name: "",
    description: "",
    color: "default",
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

  const [deleteTarget, setDeleteTarget] = useState<{ type: "app" | "company" | "category" | "status" | "priority" | "label"; id: number; name: string } | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<{ canDelete: boolean; issueCount: number; columnCount: number; appCount?: number } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canViewApps = can("app.view");
  const canViewCompanies = can("company.view");
  const canViewCategories = can("category.view");
  const canViewStatuses = can("status.view");
  const canViewPriorities = can("priority.view");
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
    // always loaded — the app form's company picker needs the list even for
    // someone without `company.view` (`GET /companies` is open on purpose)
    requests.push(apiFetch<PaginatedResponse<Company>>("/companies?page=1&limit=100", {}, token).then(r => r.data));
    if (canViewCategories) {
      requests.push(apiFetch<PaginatedResponse<Category>>("/categories?page=1&limit=100", {}, token).then(r => r.data));
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
        setCompanies(results[idx++]);
        if (canViewCategories) {
          setCategories(results[idx++]);
        }
        if (canViewStatuses) setStatuses(results[idx++]);
        if (canViewPriorities) setPriorities(results[idx++]);
        if (canViewLabels) setLabels(results[idx++]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canViewApps, canViewCategories, canViewStatuses, canViewPriorities, canViewLabels, token]);

  // Support deep links such as /master-data?tab=statuses — used by the back link on /automation.
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (!tabParam) return;
    const contents = [
      ...(canViewApps ? ["apps"] : []),
      ...(canViewApps ? ["system"] : []),
      ...(canViewCompanies ? ["companies"] : []),
      ...(canViewCategories ? ["categories"] : []),
      ...(canViewStatuses ? ["statuses"] : []),
      ...(canViewPriorities ? ["priorities"] : []),
      ...(canViewLabels ? ["labels"] : []),
    ];
    const idx = contents.indexOf(tabParam);
    if (idx >= 0) setTab(idx);
  }, [canViewApps, canViewCompanies, canViewCategories, canViewStatuses, canViewPriorities, canViewLabels]);

  function openAddApp() {
    setEditingApp(null);
    setAppForm({ name: "", companyId: 0, startedAt: "", expiresAt: "" });
    setAppFormError(null);
    setAppDialogOpen(true);
  }

  function openEditApp(app: App) {
    setEditingApp(app);
    // ฟอร์มถือได้แค่ 1 บริษัท → เอาคู่แรกของแอป (ตอนนี้ทุกแอปมีคู่เดียว)
    const link = app.companies[0];
    setAppForm({
      name: app.name,
      companyId: link?.id ?? 0,
      startedAt: link?.startedAt ?? "",
      expiresAt: link?.expiresAt ?? "",
    });
    setAppFormError(null);
    setAppDialogOpen(true);
  }

  async function handleSaveApp() {
    // 1 แอป = 1 บริษัท — the API checks this too, but the message belongs in
    // Thai and underneath the field
    if (!appForm.companyId) {
      setAppFormError(t("companyRequired"));
      return;
    }
    setAppFormError(null);
    try {
      const payload = {
        name: appForm.name,
        // ส่งเป็น array อันเดียว — API ยังรับรูปแบบ many-to-many อยู่
        // `""` (ช่องวันที่ว่าง) = ยังไม่กรอก / ไม่กำหนด
        companies: [
          {
            id: appForm.companyId,
            startedAt: appForm.startedAt || null,
            expiresAt: appForm.expiresAt || null,
          },
        ],
      };
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

  function openAddCompany() {
    setEditingCompany(null);
    setCompanyForm({ name: "" });
    setCompanyDialogOpen(true);
  }

  function openEditCompany(company: Company) {
    setEditingCompany(company);
    setCompanyForm({ name: company.name });
    setCompanyDialogOpen(true);
  }

  async function handleSaveCompany() {
    try {
      const payload = { name: companyForm.name };
      if (editingCompany) {
        await apiFetch(`/companies/${editingCompany.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }, token);
        notify(t("companyUpdated"));
      } else {
        await apiFetch("/companies", {
          method: "POST",
          body: JSON.stringify(payload),
        }, token);
        notify(t("companyCreated"));
      }
      const updated = await apiFetch<PaginatedResponse<Company>>("/companies?page=1&limit=100", {}, token);
      setCompanies(updated.data);
      setCompanyDialogOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleToggleCompanyActive(company: Company) {
    try {
      await apiFetch(`/companies/${company.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !company.isVisible }),
      }, token);
      setCompanies((prev) =>
        prev.map((c) => (c.id === company.id ? { ...c, isVisible: !company.isVisible } : c)),
      );
      notify(t("companyToggled"));
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleDeleteCompany(id: number) {
    const company = companies.find((c) => c.id === id);
    if (!company) return;
    // apps reference companies now (M:N), so the same pre-flight check the
    // apps tab runs decides whether the confirm button can appear
    setDeleteTarget({ type: "company", id, name: company.name });
    setDeleteLoading(true);
    try {
      const result = await apiFetch<{ canDelete: boolean; appCount: number }>(
        `/companies/${id}/check`,
        {},
        token,
      );
      setDeleteCheck({ ...result, issueCount: 0, columnCount: 0 });
    } catch (err) {
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  function openAddCategory() {
    setEditingCategory(null);
    setCategoryForm({ name: "" });
    setCategoryDialogOpen(true);
  }

  function openEditCategory(category: Category) {
    setEditingCategory(category);
    setCategoryForm({ name: category.name });
    setCategoryDialogOpen(true);
  }

  async function handleSaveCategory() {
    try {
      const payload = {
        name: categoryForm.name,
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
    setStatusForm({ name: "", description: "", color: "default" });
    setStatusDialogOpen(true);
  }

  function openEditStatus(status: IssueStatus) {
    setEditingStatus(status);
    setStatusForm({
      name: status.name,
      description: status.description ?? "",
      color: status.color ?? "default",
    });
    setStatusDialogOpen(true);
  }

  async function handleSaveStatus() {
    const name = statusForm.name.trim();
    if (!name) {
      notify(t("statusNameRequired"), "error");
      return;
    }
    if (name.length > 100) {
      notify(t("statusNameTooLong"), "error");
      return;
    }
    // Same check the API does — surface it in Thai before spending a request.
    const duplicate = statuses.some(
      (s) => s.id !== editingStatus?.id && s.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      notify(t("statusNameExists"), "error");
      return;
    }
    // The color picker's text field accepts anything; mirror the API's rule
    // (palette name or hex) so a typo never turns into a raw server 400.
    const color = statusForm.color.trim() || "default";
    if (!STATUS_COLOR_PATTERN.test(color)) {
      notify(t("statusInvalidColor"), "error");
      return;
    }
    try {
      const payload = {
        name,
        description: statusForm.description.trim() || undefined,
        color,
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
        // Validation/ conflict answers are English server text — show Thai.
        if (err.status === 409) notify(t("statusNameExists"), "error");
        else if (err.status === 400)
          notify(
            err.message.toLowerCase().includes("color")
              ? t("statusInvalidColor")
              : t("statusInvalidName"),
            "error",
          );
        else notify(err.message, "error");
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
      } else if (deleteTarget.type === "company") {
        await apiFetch(`/companies/${deleteTarget.id}`, { method: "DELETE" }, token);
        setCompanies((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        notify(t("companyDeleted"));
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

  /** สถานะอายุของแอป/คู่ — chip ที่ 2 ในคอลัมน์ "สถานะอายุ" (เขียว→น้ำเงิน→ส้ม→แดง) */
  function expiryLabel(status: ExpiryStatus) {
    switch (status) {
      case "expiring_soon":
        return t("expiryExpiringSoon");
      case "critical":
        return t("expiryCritical");
      case "expired":
        return t("expiryExpired");
      case "normal":
        return t("expiryNormal");
      default:
        return t("expiryNone");
    }
  }

  function expiryColor(
    status: ExpiryStatus,
  ): "default" | "info" | "success" | "warning" | "error" {
    switch (status) {
      case "expiring_soon":
        return "info";
      case "critical":
        return "warning";
      case "expired":
        return "error";
      case "normal":
        return "success";
      default:
        return "default";
    }
  }

  /**
   * คอลัมน์ "บริษัท" — ชิปสูงสุด `MAX_COMPANY_CHIPS` แล้วยุบเป็น `+N`
   * (hover ดูรายชื่อที่เหลือผ่าน tooltip) ให้แถวไม่สูง/ไม่ยาว
   */
  function companyChips(app: App) {
    if (app.companies.length === 0) {
      return (
        <Typography variant="caption" color="text.disabled">
          {t("noCompany")}
        </Typography>
      );
    }
    return (
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
        {app.companies.slice(0, MAX_COMPANY_CHIPS).map((company) => (
          <Chip
            key={company.id}
            label={company.name}
            size="small"
            variant="outlined"
            // ชื่อยาวถูกตัดด้วย ellipsis — hover ดูชื่อเต็มผ่าน tooltip
            sx={{ maxWidth: 180 }}
          />
        ))}
        {app.companies.length > MAX_COMPANY_CHIPS && (
          <Tooltip
            title={app.companies
              .slice(MAX_COMPANY_CHIPS)
              .map((company) => company.name)
              .join(", ")}
          >
            <Chip
              label={`+${app.companies.length - MAX_COMPANY_CHIPS}`}
              size="small"
              variant="outlined"
            />
          </Tooltip>
        )}
      </Box>
    );
  }

  /**
   * ใต้ chip "สถานะอายุ" — 1 แถว = 1 แอป แต่สถานะเป็น **รายบริษัท** แล้ว
   * จึงไล่ทุกคู่ว่าเหลือกี่วัน (ขึ้นบรรทัดใหม่ระหว่างบริษัท)
   */
  function expiryBreakdown(app: App) {
    if (app.companies.length === 0) {
      return <Typography variant="caption">{t("noCompany")}</Typography>;
    }
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
        {app.companies.map((link) => {
          const left = daysLeftIso(link.expiresAt ?? "");
          const days = left !== null && left >= 0 ? ` · ${t("daysLeft", { n: left })}` : "";
          return (
            <Typography key={link.id} variant="caption" component="span">
              {`${link.name}: ${expiryLabel(link.expiryStatus)}${days}`}
            </Typography>
          );
        })}
      </Box>
    );
  }

  /**
   * label ของ chip "สถานะอายุ" ในตาราง `ข้อมูลระบบ` — แสดง "จำนวนวัน" เฉพาะตอน
   * ที่มีความหมาย (≤30 วัน / หมดอายุแล้ว) ส่วน `ปกติ` / `ไม่กำหนด` คงคำเดิมไว้
   * เพราะ "เหลือ 400 วัน" ไม่ได้บอกอะไรใคร — **สีชิปยังเป็นตัวบอกความรุนแรง**
   * (เขียว→น้ำเงิน→ส้ม→แดง) ตัวเลขเป็นแค่ความแม่นเพิ่มเติม
   */
  function expiryChipLabel(status: ExpiryStatus, expiresAt: string | null): string {
    const left = daysLeftIso(expiresAt ?? "");
    if (status === "expiring_soon" || status === "critical") {
      return left === null ? expiryLabel(status) : t("daysLeft", { n: left });
    }
    if (status === "expired") {
      return left === null ? expiryLabel(status) : t("daysExpired", { n: -left });
    }
    return expiryLabel(status);
  }

  /** คอลัมน์ "การจัดการ" ของแอป — ใช้ร่วมกันทั้งแท็บ `แอป` และ `ข้อมูลระบบ` */
  function renderAppActions(app: App) {
    return (
      <>
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
      </>
    );
  }

  /** สถานะอายุที่ฟอร์มจะโชว์ — คำนวณใหม่ทุกครั้งที่ผู้ใช้แก้วันที่ */
  const formExpiryStatus = previewExpiryStatus(appForm.expiresAt);

  const tabs = [
    ...(canViewApps ? [{ label: t("tabApps"), content: "apps" }] : []),
    ...(canViewApps ? [{ label: t("tabSystemInfo"), content: "system" }] : []),
    ...(canViewCompanies ? [{ label: t("tabCompanies"), content: "companies" }] : []),
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
              {/* แท็บนี้สั้นเหมือนแท็บอื่น — รายละเอียดแอป+บริษัทอยู่ที่แท็บ "ข้อมูลระบบ" */}
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
                      {/* การใช้งาน = is_visible ตั้งปิดเอง สลับด้วย switch ที่คอลัมน์การจัดการ */}
                      <DataTableCell align="center">
                        <Chip
                          label={app.isVisible ? t("active") : t("inactive")}
                          color={app.isVisible ? "success" : "error"}
                          size="small"
                          variant="outlined"
                        />
                      </DataTableCell>
                      <DataTableCell align="right">{renderAppActions(app)}</DataTableCell>
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

          {/* ตารางละเอียด: 1 แถวต่อแอป · วันที่/สถานะอายุ = คู่ที่ใกล้หมดอายุที่สุด */}
          {tabs[tab]?.content === "system" && (
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
                    <DataTableCell>{t("columnCompany")}</DataTableCell>
                    <DataTableCell>{t("columnStartedAt")}</DataTableCell>
                    <DataTableCell>{t("columnExpiresAt")}</DataTableCell>
                    <DataTableCell align="center">{t("columnExpiryStatus")}</DataTableCell>
                    <DataTableCell align="center">{t("columnUsage")}</DataTableCell>
                    <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {apps.map((app) => {
                    const nearest = pickNearest(app.companies);
                    const status = nearest?.expiryStatus ?? "none";
                    return (
                      <DataTableRow key={app.id}>
                        <DataTableCell>{app.name}</DataTableCell>
                        <DataTableCell>{companyChips(app)}</DataTableCell>
                        <DataTableCell>
                          {nearest?.startedAt ? (
                            formatDay(nearest.startedAt, locale)
                          ) : (
                            <Typography variant="caption" color="text.disabled">
                              {t("notSetYet")}
                            </Typography>
                          )}
                        </DataTableCell>
                        <DataTableCell>
                          {nearest?.expiresAt ? (
                            formatDay(nearest.expiresAt, locale)
                          ) : (
                            <Typography variant="caption" color="text.disabled">
                              {t("expiryNone")}
                            </Typography>
                          )}
                        </DataTableCell>
                        {/* สถานะอายุของคู่ที่ใกล้หมดที่สุด — hover ดูครบทุกบริษัท */}
                        <DataTableCell align="center">
                          <Tooltip title={expiryBreakdown(app)}>
                            <Chip
                              label={expiryChipLabel(status, nearest?.expiresAt ?? null)}
                              color={expiryColor(status)}
                              size="small"
                              variant="outlined"
                            />
                          </Tooltip>
                        </DataTableCell>
                        {/* การใช้งาน = is_visible ตั้งปิดเอง สลับด้วย switch ที่คอลัมน์การจัดการ */}
                        <DataTableCell align="center">
                          <Chip
                            label={app.isVisible ? t("active") : t("inactive")}
                            color={app.isVisible ? "success" : "error"}
                            size="small"
                            variant="outlined"
                          />
                        </DataTableCell>
                        <DataTableCell align="right">{renderAppActions(app)}</DataTableCell>
                      </DataTableRow>
                    );
                  })}
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

          {tabs[tab]?.content === "companies" && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                {can("company.create") && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openAddCompany}>
                    {t("addCompany")}
                  </Button>
                )}
              </Box>
              <DataTable>
                <DataTableHead>
                  <DataTableRow>
                    <DataTableCell>{t("columnName")}</DataTableCell>
                    <DataTableCell align="center">{t("columnAppCount")}</DataTableCell>
                    <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                    <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {companies.map((company) => (
                    <DataTableRow key={company.id}>
                      <DataTableCell>{company.name}</DataTableCell>
                      <DataTableCell align="center">{company.appCount}</DataTableCell>
                      <DataTableCell align="center">
                        <Chip
                          label={company.isVisible ? t("active") : t("inactive")}
                          color={company.isVisible ? "success" : "error"}
                          size="small"
                          variant="outlined"
                        />
                      </DataTableCell>
                      <DataTableCell align="right">
                        {can("company.update") && (
                          <FormControlLabel
                            control={
                              <Switch
                                checked={company.isVisible}
                                onChange={() => handleToggleCompanyActive(company)}
                                size="small"
                              />
                            }
                            label=""
                            sx={{ mr: 1 }}
                          />
                        )}
                        {can("company.update") && (
                          <IconButton size="small" onClick={() => openEditCompany(company)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                        {can("company.delete") && (
                          <IconButton size="small" onClick={() => handleDeleteCompany(company.id)}>
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
                totalPages={Math.max(1, Math.ceil(companies.length / 10))}
                total={companies.length}
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
                    <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                    <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {categories.map((category) => (
                    <DataTableRow key={category.id}>
                      <DataTableCell>{category.name}</DataTableCell>
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
            {/* เลื่อนเนื้อหาได้เมื่อฟอร์มยาว (ชิปบริษัทหลายอัน) กันปุ่มล่างหาย */}
            <DialogContent sx={{ overflowY: "auto" }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                <TextField
                  label={t("columnName")}
                  value={appForm.name}
                  onChange={(e) => setAppForm({ ...appForm, name: e.target.value })}
                  fullWidth
                />
                {/* บริษัทเดียว — dropdown เลือก 1 รายการ (ไม่ใช่ Autocomplete เลือกหลาย) */}
                <FormControl fullWidth error={!!appFormError}>
                  <InputLabel id="app-company-label">{t("columnCompany")}</InputLabel>
                  <Select
                    labelId="app-company-label"
                    value={appForm.companyId}
                    label={t("columnCompany")}
                    onChange={(e) => {
                      setAppForm({ ...appForm, companyId: Number(e.target.value) });
                      setAppFormError(null);
                    }}
                    disabled={companies.length === 0}
                  >
                    {companies.map((company) => (
                      <MenuItem key={company.id} value={company.id}>
                        {company.name}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    {appFormError ??
                      (companies.length === 0 ? t("noCompaniesHint") : t("companyOneHint"))}
                  </FormHelperText>
                </FormControl>
                <TextField
                  label={t("columnStartedAt")}
                  type="date"
                  value={appForm.startedAt}
                  onChange={(e) => setAppForm({ ...appForm, startedAt: e.target.value })}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText={t("startedAtHint")}
                />
                <TextField
                  label={t("columnExpiresAt")}
                  type="date"
                  value={appForm.expiresAt}
                  onChange={(e) => setAppForm({ ...appForm, expiresAt: e.target.value })}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  helperText={t("expiresAtHint")}
                />
                {/* สถานะอายุที่คำนวณสดจากวันที่ด้านบน — เซิร์ฟเวอร์ยังเป็นคนตัวจริงตอนบันทึก */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {t("columnExpiryStatus")}
                  </Typography>
                  <Chip
                    label={expiryLabel(formExpiryStatus)}
                    color={expiryColor(formExpiryStatus)}
                    size="small"
                    variant="outlined"
                  />
                </Box>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setAppDialogOpen(false)}>{t("cancel")}</Button>
              <Button variant="contained" onClick={handleSaveApp}>
                {t("save")}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={companyDialogOpen} onClose={() => setCompanyDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>{editingCompany ? t("editCompany") : t("addCompany")}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                <TextField
                  label={t("columnName")}
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  fullWidth
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCompanyDialogOpen(false)}>{t("cancel")}</Button>
              <Button variant="contained" onClick={handleSaveCompany}>
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
                  required
                  inputProps={{ maxLength: 100 }}
                />
                <TextField
                  label={t("columnDescription")}
                  value={statusForm.description}
                  onChange={(e) => setStatusForm({ ...statusForm, description: e.target.value })}
                  fullWidth
                  multiline
                  rows={2}
                />
                <ColorPicker
                  value={statusForm.color}
                  onChange={(color) => setStatusForm({ ...statusForm, color })}
                />

              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setStatusDialogOpen(false)}>{t("cancel")}</Button>
              <Button
                variant="contained"
                onClick={handleSaveStatus}
                disabled={!statusForm.name.trim()}
              >
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
                  {deleteTarget.type === "company"
                    ? t("deleteCompanyInUse", {
                        name: deleteTarget.name,
                        appCount: deleteCheck.appCount ?? 0,
                      })
                    : t("deleteInUse", {
                        name: deleteTarget.name,
                        issueCount: deleteCheck.issueCount,
                        columnCount: deleteCheck.columnCount,
                      })}
                </Typography>
              ) : deleteTarget ? (
                <Typography variant="body2">
                  {t("deleteConfirmMessage", {
                    type: deleteTarget.type === "app" ? t("app") : deleteTarget.type === "company" ? t("company") : deleteTarget.type === "category" ? t("category") : deleteTarget.type === "status" ? t("status") : deleteTarget.type === "priority" ? t("priority") : t("label"),
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
