"use client";

import {
  Suspense,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  Box,
  Badge,
  Typography,
  Button,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  Chip,
  CircularProgress,
  Alert,
  Paper,
  Avatar,
  Tooltip,
  Divider,
  Tabs,
  Tab,
  Grid,
  useMediaQuery,
  useTheme,
  type Theme,
  Checkbox,
  Popover,
  ListItemButton,
  List,
  ListItem,
  keyframes,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  defaultDropAnimationSideEffects,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ViewKanbanIcon from "@mui/icons-material/ViewKanban";
import TableChartIcon from "@mui/icons-material/TableChart";
import FolderIcon from "@mui/icons-material/Folder";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import HistoryIcon from "@mui/icons-material/History";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import SearchIcon from "@mui/icons-material/Search";
import CategoryIcon from "@mui/icons-material/Category";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import CancelIcon from "@mui/icons-material/Cancel";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import PersonIcon from "@mui/icons-material/Person";
import FilterListIcon from "@mui/icons-material/FilterList";
import AppsIcon from "@mui/icons-material/Apps";
import BusinessIcon from "@mui/icons-material/Business";
import DeleteIcon from "@mui/icons-material/Delete";
import RestoreFromTrashIcon from "@mui/icons-material/RestoreFromTrash";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SendIcon from "@mui/icons-material/Send";

import LinkIcon from "@mui/icons-material/Link";
import FlagIcon from "@mui/icons-material/Flag";
import LabelIcon from "@mui/icons-material/Label";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import SwapVertIcon from "@mui/icons-material/SwapVert";
import UndoIcon from "@mui/icons-material/Undo";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { usePermissions } from "@/lib/permissions";
import { useAuthStore } from "@/lib/auth-store";
import { isApiError, errorMessage } from "@/lib/api";
import type { IssueTaskType } from "@kanban/shared";
import { REJECT_STATUS_NAME } from "@kanban/shared";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import DataTable, { DataTableHead, DataTableBody, DataTableRow, DataTableCell } from "@/components/data-table";
import {
  fetchIssues,
  fetchIssue,
  createIssue,
  moveIssue,
  assignIssue,
  deleteIssue,
  unlockIssue,
  updateIssue,
  fetchIssueActivity,
  fetchIssueComments,
  fetchStatuses,
  fetchMovePolicy,
  createStatus,
  updateStatus,
  reorderStatuses,
  fetchPriorities,
  fetchMembers,
  fetchCategories,
  fetchApps,
  createComment,
  updateComment,
  deleteComment,
  uploadAttachment,
  fetchAttachments,
  deleteAttachment,
  type BoardIssue,
  type StaleRule,
  type ActivityLog,
  type Comment,
  type IssueStatus,
  type IssuePriority,
  type BoardMember,
  type TrashedIssue,
  type Attachment,
  type Category,
  type App,
  fetchTrashedIssues,
  restoreIssue,
  fetchOpenTimers,
  getOpenTimer,
  setActualFixDuration,
  getToken,
} from "@/lib/board-api";
import { fetchLabels, createLabel, updateLabel, type Label } from "@/lib/labels-api";
import { fetchCompanies, type Company } from "@/lib/apps-api";
import { resolveStatusColor } from "@/lib/status-color";
import { Pagination } from "@/components/pagination";
import AttachmentPreviewDialog from "@/components/attachment-preview-dialog";
import { FilterPanel, type FilterOption, type FilterSectionData } from "@/components/filter-panel";
import { useNotification } from "@/components/notification";

function getErrorMessage(e: unknown, fallback: string): string | null {
  if (isApiError(e, 403)) return null;
  // `errorMessage` never leaks the browser's raw `Failed to fetch` — after
  // apiFetch's silent retries are exhausted the caller's own fallback is used
  return errorMessage(e, fallback);
}

/*
 * Every board failure (load/save/delete, and the automation rules' move
 * refusals) is reported through the shared toast — `notify()` from
 * `components/notification.tsx` (bottom-right, auto-hides) — instead of the
 * old persistent red `Alert` banner that pushed the page down. Each component
 * below binds its own `fail = useCallback(msg => …)` around `notify`; rule
 * refusals (422/409/400) call `notify(msg, "warning")` directly.
 * `getErrorMessage` returns `null` on 403 (deliberately silent) — `fail(null)`
 * keeps that behaviour: nothing is shown.
 */

const PRIORITY_COLORS: Record<string, "error" | "warning" | "success" | "default"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "success",
};

/** localStorage key for the board's card order toggle (see `cardOrder`). */
const BOARD_CARD_ORDER_KEY = "kanban-board-card-order";

/**
 * Priority wording lives in `messages/{th,en}.json` under `Boards.priorityLabel.*`
 * — English in both on purpose, so moving it out of this file does not change
 * what anyone sees; it only stops the words from being baked into the code.
 * (`Boards.priority` is taken — that one is the column/section label.)
 * A priority an admin renamed (or created) has no key and stays as stored.
 */
const PRIORITY_I18N_KEYS = ["critical", "high", "medium", "low"] as const;

/**
 * สไตล์ pill ของดรอปดาวน์บนบอร์ด (ตัวเรียงโฟลเดอร์ + ตัวเลือกในป๊อปอัพการ์ด)
 * — mirrors `PILL_*` ใน `components/rules/rule-list.tsx`,
 * `rules/run-history-dialog.tsx` + `reports/components/reports-toolbar.tsx`
 * (แก้ที่ไหนต้องแก้ทั้งชุด): **พื้นขาว** + ขอบ `divider` เห็นตลอด (พื้นขาวบน
 * พื้นขาวต้องมีขอบกันกลืน) → hover `grey.50` + ขอบเข้มขึ้น → focus น้ำเงิน,
 * เมนูมุมมน + ✓ หน้ารายการที่เลือก
 *
 * ⚠️ **2 ช่องบนแดชบอร์ด** (`[locale]/page.tsx` + `workload-card.tsx`) ขาว
 * เหมือนกันแล้ว — ต่าง**แค่ไซส์**: เล็ก (13 / py 0.75) ตามคำสั่ง
 *
 * **เวอร์ชันใหญ่** (fontSize 14 / py 1) ตามคำสั่ง — ทุกหน้ายกเว้นแดชบอร์ด
 * ใช้ไซส์นี้
 */
const PILL_SELECT_SX = {
  fontSize: 14,
  bgcolor: "common.white",
  borderRadius: "10px",
  transition: "background-color 150ms ease",
  "&:hover": { bgcolor: "grey.50" },
  // divider line at rest (white-on-white would otherwise vanish) →
  // grey.400 on hover → primary on focus (keyboard ring stays visible)
  "& .MuiOutlinedInput-notchedOutline": { border: "1px solid", borderColor: "divider" },
  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "grey.400" },
  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "primary.main" },
  "& .MuiSelect-select": { py: 1, pr: "30px !important" },
} as const;

/** แถวในเมนู — 13px เหมือน pill ฝั่งอื่น (เมนูไม่ใช่ส่วนที่ต้องใหญ่). */
const PILL_ITEM_SX = {
  borderRadius: "8px",
  fontSize: 13,
  py: 0.75,
  px: 1.25,
  gap: 1,
  "&.Mui-selected": { bgcolor: "action.selected", fontWeight: 600 },
  "&.Mui-selected:hover": { bgcolor: "action.selected" },
} as const;

/** ข้อความในกล่องปิด — ตัวหนา + ตัดด้วย … (ไซส์ใหญ่ 14 เหมือนฝั่งอื่น). */
const PILL_VALUE_SX = {
  fontSize: 14,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

/** กระดาษเมนูของ pill — มุมมน 14 + ขอบ divider + เงาการ์ด (MenuProps / Popover). */
function pillPaperSx(theme: Theme) {
  return {
    borderRadius: "14px",
    mt: 1,
    p: 0.75,
    border: "1px solid",
    borderColor: "divider",
    boxShadow: theme.custom.cardShadow,
    maxWidth: 320,
  } as const;
}

function priorityLabel(t: (key: string) => string, name: string): string {
  const key = name.trim().toLowerCase();
  return (PRIORITY_I18N_KEYS as readonly string[]).includes(key)
    ? t(`priorityLabel.${key}`)
    : name;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })} ${date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Clock format used by every time display: "01:23:45". */
function formatClock(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Seconds elapsed since a session started (never negative). */
function elapsedSince(startedAtIso: string | null | undefined, nowMs: number): number {
  if (!startedAtIso) return 0;
  const started = new Date(startedAtIso).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((nowMs - started) / 1000));
}

/** Total time on a card: everything already banked + the running session. */
function totalTimeSeconds(issue: BoardIssue, runningSince: string | null | undefined, nowMs: number): number {
  const banked = issue.trackedDuration ?? 0;
  return banked + (runningSince ? elapsedSince(runningSince, nowMs) : 0);
}

const timerPulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
`;

/**
 * Running timers shared by every view: `running` maps issueId → ISO start,
 * `now` is one shared clock (ticks once a second while anything runs) and
 * `refresh` reloads the map (a drag can start/stop/reset timers via rules).
 */
interface BoardTimers {
  running: Record<number, string>;
  now: number;
  refresh: () => void;
}

/** "เวลาที่จับได้" cell — live clock while running, banked total otherwise. */
function TrackedTimeCell({ issue, timers }: { issue: BoardIssue; timers: BoardTimers }) {
  const runningSince = timers.running[issue.id] ?? null;
  const total = totalTimeSeconds(issue, runningSince, timers.now);
  if (!runningSince && total <= 0) return <>—</>;
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
      {runningSince && (
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            bgcolor: "success.main",
            animation: `${timerPulse} 1.5s ease-in-out infinite`,
          }}
        />
      )}
      <Typography
        component="span"
        variant="caption"
        sx={{
          fontFamily: "monospace",
          fontWeight: 600,
          color: runningSince ? "success.main" : "text.primary",
        }}
      >
        {formatClock(total)}
      </Typography>
    </Box>
  );
}

/** "เวลาแก้ไขจริง" cell — the manually recorded value. */
function ActualTimeCell({ issue }: { issue: BoardIssue }) {
  if (issue.actualFixDuration == null || issue.actualFixDuration <= 0) return <>—</>;
  return (
    <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
      {formatClock(issue.actualFixDuration)}
    </Box>
  );
}

const FIELD_LABELS: Record<string, string> = {
  title: "หัวข้อ",
  description: "คำอธิบาย",
  priority: "ความสำคัญ",
  priorityId: "ความสำคัญ",
  category: "หมวดหมู่",
  label: "ป้าย",
  labels: "ป้าย",
  taskType: "ประเภทงาน",
};

function formatActivityAction(log: ActivityLog): string {
  try {
    const detail = log.detail ? JSON.parse(log.detail) : {};
    switch (log.action) {
      case "card.created":
        return `${log.actorName ?? "ระบบ"} สร้างงานนี้`;
      case "card.moved":
        return `${log.actorName ?? "ระบบ"} ลาก: ${detail.from ?? "—"} → ${detail.to ?? "—"}`;
      case "card.assigned":
        return `${log.actorName ?? "ระบบ"} มอบหมายให้ ${detail.to ?? "—"}`;
      case "card.edited":
        return `${log.actorName ?? "ระบบ"} แก้ไข: ${(detail.fields ?? []).map((f: string) => FIELD_LABELS[f] ?? f).join(", ")}`;
      case "card.deleted":
        return `${log.actorName ?? "ระบบ"} ลบงานนี้`;
      case "comment.created":
        return `${log.actorName ?? "ระบบ"} แสดงความคิดเห็น`;
      case "comment.updated":
        return `${log.actorName ?? "ระบบ"} แก้ไขความคิดเห็น`;
      case "comment.deleted":
        return `${log.actorName ?? "ระบบ"} ลบความคิดเห็น`;
      default:
        return log.action;
    }
  } catch {
    return log.action;
  }
}

function labelColorValue(color: string | null | undefined, theme: Theme): string {
  const map = theme.custom.labelColors as Record<string, string>;
  return map[color ?? "default"] ?? color ?? theme.palette.grey[400];
}

function labelColorKeys(theme: Theme): string[] {
  const map = theme.custom.labelColors as Record<string, string>;
  return Object.keys(map).filter((k) => k !== "default");
}

function labelContrast(color: string, theme: Theme): string {
  return theme.palette.getContrastText(labelColorValue(color, theme));
}

function labelChipSx(color: string | null | undefined, theme: Theme) {
  const base = labelColorValue(color, theme);
  return {
    bgcolor: `${base}26`,
    color: theme.palette.common.black,
    border: `1px solid ${base}66`,
    borderRadius: 6,
  };
}

/**
 * SOFT status pill — a pale tint of the status colour under text of that SAME
 * colour at full strength, no border, fully rounded. This is the "smooth"
 * chip look from the design reference: the hue still names the status, but
 * nothing shouts, so the pill no longer out-weighs the priority chip (which
 * is `variant="outlined"`).
 *
 * Every status chip on the board renders through here, so a restyle stays a
 * single edit. The recipe is two values only:
 *
 *   bgcolor = alpha(color, 0.15)  — 15% of the colour over the page white
 *   color   = color               — the raw status colour, NOT darkened
 *
 * **Deliberate trade-off (user's call): the text is the vivid colour, which
 * gives up WCAG AA.** Measured on a white plate: `#9c27b0` 4.97:1 and
 * `#2e7d32` 4.21:1 clear or nearly clear AA, but `#2196f3` lands at 2.66:1
 * and `#ed6c02` at 2.64:1 — both under the 4.5:1 the 0.6–0.7rem chip text
 * would need. This was chosen over the earlier `darken(color, 0.30)` recipe,
 * which passed AA for all six but muddied the hue (the orange came out
 * brown). A `darken()` factor is still the one-line fix if a colour
 * ever reads as unreadable in the browser: `0.15` → ~3.57:1 (still vivid),
 * `0.20` → ~3.96:1, `0.30` → AA for all six. Do not silently re-add it —
 * the vividness is the point.
 *
 * No shadow: a tinted pill sits flat on the row and the coloured halo we
 * tried earlier read as noise.
 *
 * Hover deliberately lives at the call site: only the clickable chip (folder
 * card) wants it, and MUI's `.MuiChip-clickable:hover` would otherwise swap
 * this tint for its grey overlay — re-asserting `bgcolor` beats that rule.
 */
function statusChipSx(color: string) {
  return {
    bgcolor: alpha(color, 0.15),
    color,
    border: "none",
    borderRadius: "999px",
  };
}

const dropAnimation: DropAnimation = {
  duration: 250,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: "0.4",
      },
    },
  }),
};

function getCategoryLabel(issue: BoardIssue): string {
  const { categoryName, customCategory } = issue;
  if (categoryName && customCategory) return `${categoryName}: ${customCategory}`;
  if (categoryName) return categoryName;
  if (customCategory) return customCategory;
  return "—";
}

/**
 * Days this card has sat in its current status when a stale rule covers its
 * status and the count has reached that rule's days — the number the red
 * border's tooltip shows. Null = no border: no rule, no stamp or an
 * unreadable date all fail open (the card just looks normal).
 */
function staleDaysFor(
  issue: BoardIssue,
  staleRules: StaleRule[],
  nowMs = Date.now(),
): number | null {
  if (staleRules.length === 0 || issue.statusId == null || !issue.statusChangedAt) return null;
  const since = new Date(issue.statusChangedAt).getTime();
  if (!Number.isFinite(since)) return null;
  const days = Math.floor((nowMs - since) / 86_400_000);
  // several rules may cover one status (3 days, 7 days…) — the first to
  // fire paints the card, and the tooltip always shows the real age
  const covered = staleRules.some((rule) => rule.statusId === issue.statusId && days >= rule.days);
  return covered ? days : null;
}

/**
 * Does the hide policy (an active `issue.hide_from_board` rule) take this
 * card off the folder? Same shape and same fail-open rules as the red
 * border above: no rule, no stamp or an unreadable date → visible. The
 * board doesn't use this — it asks the API with `hideStaleDone=1` so its
 * column counts and search drop the card server-side too.
 */
function isHiddenFromFolder(
  issue: BoardIssue,
  hideStaleRules: StaleRule[],
  nowMs = Date.now(),
): boolean {
  if (hideStaleRules.length === 0 || issue.statusId == null || !issue.statusChangedAt) {
    return false;
  }
  const since = new Date(issue.statusChangedAt).getTime();
  if (!Number.isFinite(since)) return false;
  const days = Math.floor((nowMs - since) / 86_400_000);
  return hideStaleRules.some((rule) => rule.statusId === issue.statusId && days >= rule.days);
}

/**
 * "Entered this column when" — the card order shared by **all three views**
 * (Kanban columns, table rows, folder grid): `status_changed_at <dir>` with
 * `NULLS LAST`, then the server's FIXED tie-breaks (`created_at DESC`,
 * `id DESC`). Only the primary direction flips — the tie-breaks and NULLS
 * LAST never do, exactly like the API's `addOrderBy`, so the screen can never
 * disagree with `?sortBy=statusChangedAt&sortOrder=<dir>` and "load more"
 * appends pages consistently either way. A missing stamp (a rare backfill
 * gap) sorts last, matching the server's NULLS LAST.
 */
function sortByEnteredAt(items: BoardIssue[], order: "desc" | "asc"): BoardIssue[] {
  const enteredAt = (issue: BoardIssue) =>
    issue.statusChangedAt ? new Date(issue.statusChangedAt).getTime() : null;
  return [...items].sort((a, b) => {
    const ea = enteredAt(a);
    const eb = enteredAt(b);
    if (ea !== eb) {
      // null (never entered) loses to every real timestamp → bottom of the list
      if (ea === null) return 1;
      if (eb === null) return -1;
      return order === "asc" ? ea - eb : eb - ea;
    }
    // tie-breaks mirror the server's fixed addOrderBy: always newest-first
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return diff !== 0 ? diff : b.id - a.id;
  });
}

function TrelloCardContent({
  issue,
  actions,
  runningSince,
  nowMs,
  showTime = true,
  canUnlockIssue = false,
  staleDays = null,
  onUnlock,
}: {
  issue: BoardIssue;
  actions?: ReactNode;
  /** ISO start of this card's running session, when there is one. */
  runningSince?: string | null;
  /** Shared clock so every chip ticks from the same second. */
  nowMs?: number;
  /** Gate for the timer (`time.system.view`). */
  showTime?: boolean;
  /** May the viewer unlock a rule-locked card from the bottom bar? */
  canUnlockIssue?: boolean;
  /**
   * Days past a stale rule's limit — renders the always-visible
   * "ค้าง N วัน" chip (the red border's owner passes it down; the
   * drag overlay can omit it). Null = no chip, same fail-open as the border.
   */
  staleDays?: number | null;
  onUnlock?: (issue: BoardIssue) => void;
}) {
  const t = useTranslations("Boards");
  const theme = useTheme();
  const priorityColor = issue.priorityName
    ? PRIORITY_COLORS[issue.priorityName.toLowerCase()] ?? "default"
    : "default";
  const avatarChar = issue.programmerName
    ? issue.programmerName.charAt(0).toUpperCase()
    : null;

  const isRunning = Boolean(runningSince);
  const totalSeconds = totalTimeSeconds(issue, runningSince, nowMs ?? Date.now());
  // bottom bar: lock + tracked time — hidden when the card has neither
  const timeVisible = showTime && (isRunning || totalSeconds > 0);
  const showBottomBar = Boolean(issue.isLocked || timeVisible);
  // Trello-style label strips on top of the card (they replaced the chips).
  // Only the first 4 render; a 5th+ becomes ONE "+N" stub so the card still
  // says there is more (hover lists every hidden name) instead of dropping
  // them silently. The detail popup shows all labels uncapped.
  const allLabels = issue.labels ?? [];
  const labelBars = allLabels.slice(0, 4);
  const hiddenLabels = allLabels.slice(4);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
      {/* label colour strips — Trello style, they replace the old label chips.
          The row also carries the stale notice: plain red text, NO background
          (a filled band read as a second card edge), pushed to the RIGHT of
          the stubs with `ml: "auto"` so the labels keep the left edge. It
          renders when EITHER half exists — a stale card with no labels still
          says "ค้าง N วัน" (alone, on the right), a labelled card that is not
          stale shows only its stubs, exactly as before. */}
      {(staleDays != null || labelBars.length > 0) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.75 }}>
          {labelBars.map((lbl) => (
            <Box
              key={lbl.id}
              title={lbl.name}
              sx={{
                // small fixed stub — not a full-width bar
                width: 28,
                flex: "0 0 auto",
                height: 8,
                borderRadius: "4px",
                bgcolor: labelColorValue(lbl.color, theme),
              }}
            />
          ))}
          {hiddenLabels.length > 0 && (
            <Box
              title={hiddenLabels.map((l) => l.name).join(", ")}
              sx={{
                flex: "0 0 auto",
                minWidth: 28,
                height: 14,
                px: 0.4,
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "action.selected",
                color: "text.secondary",
                fontSize: "0.575rem",
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              +{hiddenLabels.length}
            </Box>
          )}
          {staleDays != null && (
            <Typography
              sx={{
                ml: "auto",
                color: "error.main",
                fontSize: "0.7rem",
                fontWeight: 700,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              {t("staleBadge", { days: staleDays })}
            </Typography>
          )}
        </Box>
      )}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.25 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.4, flex: 1, minWidth: 0, mr: 0.5 }}>
          {issue.title}
        </Typography>
        {issue.appName && (
          <Chip
            label={issue.appName}
            size="small"
            sx={{
              height: 18,
              fontSize: "0.65rem",
              fontWeight: 600,
              flexShrink: 0,
              ml: 0.5,
              bgcolor: "action.selected",
              color: "text.secondary",
            }}
          />
        )}
        {actions}
      </Box>
      {issue.priorityName && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25, flexWrap: "wrap" }}>
          <Chip
            label={priorityLabel(t, issue.priorityName)}
            size="small"
            variant="outlined"
            color={priorityColor}
            sx={{ height: 18, fontSize: "0.65rem", fontWeight: 600 }}
          />
        </Box>
      )}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.75, gap: 0.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.35 }}>
          <CalendarTodayIcon sx={{ fontSize: 14, color: "text.secondary" }} />
          <Typography variant="caption" color="text.secondary">
            {formatDate(issue.createdAt)}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          {issue.commentCount > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.2 }}>
              <ChatBubbleOutlineIcon sx={{ fontSize: 13, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">{issue.commentCount}</Typography>
            </Box>
          )}
          {issue.attachmentCount > 0 && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.2 }}>
              <AttachFileIcon sx={{ fontSize: 13, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">{issue.attachmentCount}</Typography>
            </Box>
          )}
          {avatarChar ? (
            <Avatar
              sx={{
                width: 22,
                height: 22,
                fontSize: "0.7rem",
                fontWeight: 700,
                bgcolor: "primary.main",
                color: "primary.contrastText",
              }}
            >
              {avatarChar}
            </Avatar>
          ) : (
            <Avatar
              sx={{
                width: 22,
                height: 22,
                fontSize: "0.7rem",
                bgcolor: theme.palette.grey[300],
                color: theme.palette.grey[600],
              }}
            >
              <PersonIcon sx={{ fontSize: 14 }} />
            </Avatar>
          )}
        </Box>
      </Box>
      {/* bottom bar — lock + tracked time on the left, deadline on the right.
          Hidden entirely when the card has none of the three. */}
      {showBottomBar && (
        <>
          <Divider sx={{ borderStyle: "dashed", mt: 0.75, mb: 0.5 }} />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 0.5,
              minHeight: 22,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
              {issue.isLocked &&
                (canUnlockIssue ? (
                  <Tooltip title={t("unlock")}>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnlock?.(issue);
                      }}
                      sx={{ p: 0.25, cursor: "pointer" }}
                    >
                      <LockIcon sx={{ fontSize: 15, color: "warning.main" }} />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <LockIcon sx={{ fontSize: 15, color: "text.disabled" }} />
                ))}
              {timeVisible && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                  <AccessTimeIcon
                    sx={{
                      fontSize: 14,
                      color: "warning.main",
                      animation: isRunning ? `${timerPulse} 1.5s ease-in-out infinite` : "none",
                    }}
                  />
                  <Typography
                    variant="caption"
                    sx={{ fontFamily: "monospace", fontWeight: 700, fontSize: "0.7rem" }}
                  >
                    {formatClock(totalSeconds)}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
}

function TrelloCard({
  issue,
  canManage = false,
  canEdit = false,
  canDelete = false,
  canUnlockIssue = false,
  runningSince,
  nowMs,
  showTime = true,
  staleDays = null,
  onOpen,
  onEdit,
  onDelete,
  onViewActivity,
  onUnlock,
  onCancelIssue,
  cancelStatusId = null,
  onRecoverIssue,
  flash = false,
}: {
  issue: BoardIssue;
  canManage?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canUnlockIssue?: boolean;
  runningSince?: string | null;
  nowMs?: number;
  showTime?: boolean;
  /** Days past a stale rule's limit — paints the card's own border red. */
  staleDays?: number | null;
  /**
   * **Cancel-reveal highlight** — `true` for ~1.8s after "ยกเลิกงาน" succeeds
   * so the eye follows the card into the "ยกเลิก" column (outline, not a
   * border: the stale rule owns the border and must not be clobbered).
   */
  flash?: boolean;
  onOpen?: (issue: BoardIssue) => void;
  onEdit?: (issue: BoardIssue) => void;
  onDelete?: (issue: BoardIssue) => void;
  onViewActivity?: (issue: BoardIssue) => void;
  onUnlock?: (issue: BoardIssue) => void;
  /**
   * **"ยกเลิกงาน"** — ย้ายการ์ดไปสถานะ "ยกเลิก" (คนละเรื่องกับ "ลบ" ที่ส่ง
   * ไปถังขยะ และคนละปุ่มกับ "ตีกลับงาน" ในป๊อปอัพซึ่งเป็นนโยบาย MA) ·
   * ตั้งค่าโดย host (KanbanView) — ไม่ส่ง = ไม่ขึ้นเมนูนี้
   */
  onCancelIssue?: (issue: BoardIssue) => void;
  /**
   * id ของสถานะ "ยกเลิก" (`null` = ไม่มีสถานะนี้ในระบบ) — การ์ดที่**อยู่ใน
   * สถานะนี้แล้ว**จะไม่เห็นเมนูนี้ (ไม่ต้อง "ยกเลิก" ซ้ำ)
   */
  cancelStatusId?: number | null;
  /**
   * **"ย้ายกลับ"** — ปุ่มบนหน้าการ์ด**ก็ต่อเมื่อการ์ดอยู่ในสถานะ "ยกเลิก"**
   * (กลับด้านกับเมนู "ยกเลิกงาน" ด้านล่าง) · กดครั้งเดียว = host ย้ายไป
   * **สถานะแรก** (`statuses[0]`) ทันที ไม่มีเมนูเลือก — ตั้งค่าโดย `KanbanView`
   * · ไม่ส่ง `onRecoverIssue` = ไม่ขึ้นปุ่ม (host ใช้กัน config ที่สถานะแรก
   * เป็น "ยกเลิก" เอง)
   */
  onRecoverIssue?: (issue: BoardIssue) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `issue-${issue.id}`, data: { type: "issue" }, disabled: issue.isLocked });

  const t = useTranslations("Boards");
  const theme = useTheme();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [hovered, setHovered] = useState(false);

  /**
   * การ์ดอยู่ในสถานะ "ยกเลิก" → ปุ่ม **"กู้คืน" เห็นตรง ๆ บนหน้าการ์ด**
   * (กลับด้านกับเมนู "ยกเลิกงาน" ที่ซ่อนเมื่ออยู่ในนั้นแล้ว) · เงื่อนไขเดียว
   * กับที่ host เปิดเมนูสถานะให้ — ไม่มีสิทธิ์แก้ / ไม่มีสถานะนี้ = ไม่ขึ้น
   */
  const showRecover = canEdit && cancelStatusId != null && issue.statusId === cancelStatusId;

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(!issue.isLocked ? listeners : {})}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => {
        if (!issue.isLocked) onOpen?.(issue);
      }}
      elevation={1}
      sx={{
        p: 1.5,
        mb: 1,
        cursor: issue.isLocked ? "not-allowed" : "grab",
        "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.12)" },
        bgcolor: "background.paper",
        borderRadius: 1.5,
        // the card's own border turns red while it sits past a stale rule —
        // no overlay, no extra box; back to "none" the moment it moves
        border: staleDays != null ? "2px solid" : "none",
        borderColor: "error.main",
        // cancel-reveal highlight (see `flash`) — an OUTLINE so the stale
        // rule's red border above keeps owning the border slot
        ...(flash
          ? { outline: "2px solid", outlineOffset: 2, outlineColor: "primary.main" }
          : {}),
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
      }}
    >
    <TrelloCardContent
      issue={issue}
      runningSince={runningSince}
      nowMs={nowMs}
      showTime={showTime}
      canUnlockIssue={canUnlockIssue}
      staleDays={staleDays}
      onUnlock={onUnlock}
      actions={
        (canEdit || canDelete || canUnlockIssue) ? (
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }}
            sx={{
              p: 0.3,
              opacity: hovered ? 1 : 0,
              pointerEvents: hovered ? "auto" : "none",
              transition: "opacity 0.15s ease",
            }}
          >
            <MoreHorizIcon sx={{ fontSize: 16, color: "text.secondary" }} />
          </IconButton>
        ) : undefined
      }
    />
    {/* **"ย้ายกลับ"** — pill ใต้การ์ดเฉพาะใบที่อยู่ในสถานะ "ยกเลิก" · label =
        `Boards.recover` ("ย้ายกลับ"/"Move back" — เดิมยืม `Boards.restore`
        "กู้คืน" ซึ่งยังเป็นของถังขยะ) · **สีแบรนด์ sky/navy** (พื้น sky.light +
        ตัว navy.main): เขียว success เหมาะกับ "กู้คืน" แต่ไม่เหมาะกับ "ย้ายกลับ"
        ที่เป็นแค่การย้ายสถานะ · ไม่มีไอคอน ชิดขวา · กดครั้งเดียว = ย้ายไป
        **สถานะแรก** ทันที (ไม่มีเมนูเลือก) — หยุด propagation ก่อนไม่งั้นฟองขึ้น
        `onClick` ของ `<Paper>` แล้วเปิดป๊อปอัพทับ */}
    {showRecover && onRecoverIssue && (
      <Box
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        sx={{ mt: 0.75, display: "flex", justifyContent: "flex-end" }}
      >
        <Button
          size="small"
          variant="contained"
          disableElevation
          onClick={() => onRecoverIssue(issue)}
          sx={{
            borderRadius: 999,
            px: 1.75,
            py: 0.2,
            minHeight: 0,
            bgcolor: theme.palette.sky.light,
            color: theme.palette.navy.main,
            fontWeight: 700,
            fontSize: "0.75rem",
            textTransform: "none",
            boxShadow: "none",
            "&:hover": { bgcolor: theme.palette.sky.main, boxShadow: "none" },
          }}
        >
          {t("recover")}
        </Button>
      </Box>
    )}
    <Menu
      anchorEl={menuAnchor}
      open={Boolean(menuAnchor)}
      onClose={() => setMenuAnchor(null)}
      // `<Menu>` ถูก portal ออกนอกการ์ด แต่ React ยัง propagate event ตาม
      // **React tree** → คลิกเมนูจะฟองขึ้นไปเรียก `onClick` ของ `<Paper>` ข้างล่าง
      // และมัน `setDetailIssue(issue)` ทับค่า `null` ที่ handler ของ "ยกเลิกงาน" /
      // "ลบ" เพิ่งสั่ง → ป๊อปอัพรายละเอียดถูกเปิดกลับมาค้างหลังกล่องยืนยัน
      // (แถมแท็บ "ดูประวัติ" ยังโดนทับเป็น "ความคิดเห็น") — หยุดที่ root ของเมนู
      // เหมือนเมนูสถานะในมุมมองโฟลเดอร์ด้านล่าง
      onClick={(e) => e.stopPropagation()}
      elevation={0}
      PaperProps={{
        sx: {
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1.5,
          overflow: "hidden",
        },
      }}
    >
      {canEdit && (
        <MenuItem onClick={() => { setMenuAnchor(null); onEdit?.(issue); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("edit")}</ListItemText>
        </MenuItem>
      )}
      {canEdit && (
        <MenuItem onClick={() => { setMenuAnchor(null); onViewActivity?.(issue); }}>
          <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t("history")}</ListItemText>
        </MenuItem>
      )}
      {issue.isLocked && canUnlockIssue && (
        <MenuItem onClick={() => { setMenuAnchor(null); onUnlock?.(issue); }}>
          <ListItemIcon><LockOpenIcon fontSize="small" color="warning" /></ListItemIcon>
          <ListItemText sx={{ color: "warning.main" }}>{t("unlock")}</ListItemText>
        </MenuItem>
      )}
      {/* "ยกเลิกงาน" — ย้ายการ์ดไปสถานะ "ยกเลิก" (คนละความหมายกับ "ลบ" ที่ส่ง
          ไปถังขยะ, และคนละปุ่มกับ "ตีกลับงาน" ในป๊อปอัพซึ่งเป็นนโยบาย MA) ·
          ซ่อนเมื่อไม่มีสิทธิ์แก้ / ไม่มีสถานะปลายทาง / การ์ดอยู่ในนั้นแล้ว */}
      {canEdit && onCancelIssue && cancelStatusId != null && issue.statusId !== cancelStatusId && (
        <MenuItem onClick={() => { setMenuAnchor(null); onCancelIssue(issue); }}>
          <ListItemIcon><CancelIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: "error.main" }}>{t("cancelIssue")}</ListItemText>
        </MenuItem>
      )}
      {canDelete && (
        <MenuItem onClick={() => { setMenuAnchor(null); onDelete?.(issue); }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: "error.main" }}>{t("delete")}</ListItemText>
        </MenuItem>
      )}
    </Menu>
    </Paper>
  );
}

function KanbanColumn({
  status,
  items,
  total,
  hasMore,
  loading,
  onLoadMore,
  canManage,
  canEdit,
  canDelete,
  canUnlockIssue,
  isDropTarget,
  isFirstColumn,
  roleName,
  timers,
  showTime,
  staleRules,
  order,
  onOpenIssue,
  onEditIssue,
  onDeleteIssue,
  onViewActivity,
  onUnlockIssue,
  onCancelIssue,
  cancelStatusId,
  onRecoverIssue,
  flashIssueId = null,
}: {
  status: IssueStatus;
  items: BoardIssue[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  onLoadMore: (statusId: number) => void;
  canManage: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUnlockIssue: boolean;
  isDropTarget: boolean;
  /** This column is the board's entry column — where customers may delete. */
  isFirstColumn: boolean;
  roleName: string;
  timers: BoardTimers;
  showTime: boolean;
  /** Active stale rules — each card paints its red border from these. */
  staleRules: StaleRule[];
  /**
   * The column order direction, mirroring `?sortOrder=` exactly: `desc` =
   * newest entry on top, `asc` = longest-sitting on top. Tie-breaks and
   * NULLS LAST never flip — the server keeps them fixed too.
   */
  order: "desc" | "asc";
  onOpenIssue: (issue: BoardIssue) => void;
  onEditIssue: (issue: BoardIssue) => void;
  onDeleteIssue: (issue: BoardIssue) => void;
  onViewActivity: (issue: BoardIssue) => void;
  onUnlockIssue: (issueId: number) => void;
  /** "ยกเลิกงาน" → ย้ายไปสถานะ "ยกเลิก" (ดู TrelloCard.onCancelIssue) */
  onCancelIssue?: (issue: BoardIssue) => void;
  /** id ของสถานะ "ยกเลิก" (`null` = ไม่มี) — การ์ดในสถานะนั้นซ่อนเมนู */
  cancelStatusId?: number | null;
  /** ปุ่ม "ย้ายกลับ" บนหน้าการ์ด (ดู TrelloCard.onRecoverIssue) */
  onRecoverIssue?: (issue: BoardIssue) => void;
  /** Card id to outline for the cancel-reveal flash (see TrelloCard.flash). */
  flashIssueId?: number | null;
}) {
  const { setNodeRef: setDroppableNodeRef, isOver: isColumnOver } = useDroppable({
    id: `status-drop-${status.id}`,
    data: { type: "status-drop", statusId: status.id },
  });

  const theme = useTheme();

  const color = resolveStatusColor(theme, status.color, status.name);
  // Shared comparator — see `sortByEnteredAt`: mirror the API ordering exactly
  // (`?sortBy=statusChangedAt&sortOrder=<order>`). `desc` (default) puts a card
  // that was just dragged in on TOP of its new column, `asc` puts the
  // longest-sitting card on top (the stale rules' targets).
  const visibleIssues = sortByEnteredAt(items, order);
  // A transient duplicate (a preview racing a reload) must never render twice:
  // two components sharing one `issue-<id>` sortable id confuse the drag layer.
  const seenIds = new Set<number>();
  const uniqueIssues = visibleIssues.filter((issue) => {
    if (seenIds.has(issue.id)) return false;
    seenIds.add(issue.id);
    return true;
  });

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (hasMore && !loading && el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      onLoadMore(status.id);
    }
  };

  return (
    <Box
      // anchor for `revealTarget` — the board scrolls THIS column into
      // view after a successful "ยกเลิกงาน" so the card visibly lands here
      id={`status-col-${status.id}`}
      sx={{
        flex: "0 0 272px",
        width: 272,
        minWidth: 272,
        maxWidth: 272,
        bgcolor: isDropTarget ? "primary.50" : "grey.50",
        borderRadius: 2,
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        maxHeight: "calc(100vh - 200px)",
        border: isDropTarget ? "2px solid" : "1px solid",
        borderColor: isDropTarget ? "primary.main" : theme.palette.divider,
        transition: "background-color 0.15s ease, border-color 0.15s ease",
        position: "relative",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1, flexWrap: "nowrap" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }} />
          <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            {status.customName ?? status.name}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            {total}
          </Typography>
        </Box>
      </Box>
      <SortableContext items={uniqueIssues.map((i) => `issue-${i.id}`)} strategy={verticalListSortingStrategy}>
        <Box
          ref={setDroppableNodeRef}
          data-status-drop-id={status.id}
          onScroll={handleScroll}
          sx={{
            flexGrow: 1,
            overflowY: "auto",
            minHeight: 200,
            transition: "min-height 0.2s ease",
            pointerEvents: "auto",
            position: "relative",
            scrollbarWidth: "none",
            "&::-webkit-scrollbar": { display: "none" },
          }}
        >
          {uniqueIssues.map((issue) => (
            <TrelloCard
              key={issue.id}
              issue={issue}
              canManage={canManage}
              canEdit={canEdit}
              canDelete={canDelete && (roleName !== "customer" || isFirstColumn)}
              canUnlockIssue={canUnlockIssue}
              runningSince={timers.running[issue.id] ?? null}
              nowMs={timers.now}
              showTime={showTime}
              staleDays={staleDaysFor(issue, staleRules, timers.now || Date.now())}
              onOpen={onOpenIssue}
              onEdit={onEditIssue}
              onDelete={onDeleteIssue}
              onViewActivity={onViewActivity}
              onUnlock={(iss) => onUnlockIssue(iss.id)}
              onCancelIssue={onCancelIssue}
              cancelStatusId={cancelStatusId}
              onRecoverIssue={onRecoverIssue}
              flash={flashIssueId === issue.id}
            />
          ))}
          {items.length === 0 && !loading && (
            <Box
              sx={{
                py: 3,
                textAlign: "center",
                border: isDropTarget ? "2px dashed" : "1px dashed",
                borderColor: isDropTarget ? "primary.main" : "divider",
                borderRadius: 1.5,
                transition: "border-color 0.15s ease",
                pointerEvents: "none",
              }}
            >
              <Typography
                variant="caption"
                color={isDropTarget ? "primary.main" : "text.disabled"}
                fontWeight={isDropTarget ? 600 : 400}
              >
                {isDropTarget ? "วางที่นี่" : "ไม่มีการ์ด"}
              </Typography>
            </Box>
          )}
          {loading && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
              <CircularProgress size={18} />
            </Box>
          )}
        </Box>
      </SortableContext>

    </Box>
  );
}

function AddColumnInline({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, description: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleAdd = () => {
    if (!name.trim()) return;
    onAdd(name.trim(), description.trim());
  };

  return (
    <Box
      sx={{
        width: 200,
        minWidth: 200,
        p: 1.5,
        bgcolor: "grey.50",
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <TextField
        fullWidth
        size="small"
        label="ชื่อ"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        sx={{ mb: 1.5 }}
      />
      <TextField
        fullWidth
        size="small"
        label="คำอธิบาย"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        multiline
        rows={2}
        sx={{ mb: 1.5 }}
      />
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button size="small" variant="contained" onClick={handleAdd} disabled={!name.trim()}>
          เพิ่มคอลัมน์
        </Button>
        <Button size="small" onClick={onCancel}>
          ยกเลิก
        </Button>
      </Box>
    </Box>
  );
}

function RecycleBinDialog({
  open,
  onClose,
  onRestored,
  onViewDetail,
}: {
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
  onViewDetail: (issue: TrashedIssue) => void;
}) {
  const t = useTranslations("Boards");
  const { notify } = useNotification();
  const fail = useCallback(
    (msg: string | null) => {
      if (msg) notify(msg, "error");
    },
    [notify],
  );
  const [items, setItems] = useState<TrashedIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchTrashedIssues()
      .then(setItems)
      .catch((e) => fail(getErrorMessage(e, "โหลดข้อมูลไม่สำเร็จ")))
      .finally(() => setLoading(false));
  }, [open, fail]);

  const handleRestore = async (id: number) => {
    setRestoringId(id);
    try {
      await restoreIssue(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      onRestored();
    } catch (e) {
      fail(getErrorMessage(e, "กู้คืนไม่สำเร็จ"));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <RestoreFromTrashIcon color="error" />
        {t("recycleBin")}
      </DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <RestoreFromTrashIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography color="text.secondary">{t("noTrashItems")}</Typography>
          </Box>
        ) : (
          <List>
            {items.map((item, idx) => (
              <Box key={item.id}>
                <ListItem
                  alignItems="flex-start"
                  secondaryAction={
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<RestoreFromTrashIcon />}
                      onClick={() => handleRestore(item.id)}
                      disabled={restoringId === item.id}
                    >
                      {t("restore")}
                    </Button>
                  }
                >
                  <Box
                    onClick={() => onViewDetail(item)}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      cursor: "pointer",
                      borderRadius: 1,
                      p: 0.5,
                      transition: "background-color 0.15s",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography variant="caption" color="common.black" fontWeight={700}>
                            {item.issueNumber}
                          </Typography>
                          <Typography variant="subtitle2" fontWeight={700} noWrap>
                            {item.title}
                          </Typography>
                        </Box>
                      }
                    />
                  </Box>
                </ListItem>
                {idx < items.length - 1 && <Divider />}
              </Box>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

function IssueDialog({
  issue,
  statusId,
  open,
  onClose,
  onSave,
  labels,
  priorities,
}: {
  issue: BoardIssue | null;
  statusId: number | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description: string; statusId: number; labelId?: number | null; priorityId?: number | null }) => void;
  labels: Label[];
  priorities: IssuePriority[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sId, setSId] = useState<number | null>(null);
  const [labelId, setLabelId] = useState<number | "">("");
  const [priorityId, setPriorityId] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(issue?.title ?? "");
      setDescription(issue?.description ?? "");
      setSId(issue?.statusId ?? statusId);
      setLabelId(issue?.labelId ?? "");
      setPriorityId(issue?.priorityId ?? null);
    }
  }, [open, issue, statusId]);

  const handleSave = () => {
    if (!title.trim() || !sId) return;
    onSave({ title: title.trim(), description: description.trim(), statusId: sId, labelId: labelId === "" ? null : labelId, priorityId });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{issue ? "แก้ไขงาน" : "สร้างงานใหม่"}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="หัวข้อ"
          fullWidth
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextField
          margin="dense"
          label="คำอธิบาย"
          fullWidth
          multiline
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <FormControl fullWidth margin="dense">
          <InputLabel>ป้ายกำกับ</InputLabel>
          <Select
            value={labelId}
            label="ป้ายกำกับ"
            onChange={(e) => setLabelId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <MenuItem value="">—</MenuItem>
            {labels.filter(l => l.isActive).map((l) => (
              <MenuItem key={l.id} value={l.id}>{l.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth margin="dense">
          <InputLabel>ความสำคัญ</InputLabel>
          <Select
            value={priorityId ?? ""}
            label="ความสำคัญ"
            onChange={(e) => setPriorityId(e.target.value === "" ? null : Number(e.target.value))}
          >
            <MenuItem value="">—</MenuItem>
            {priorities.filter(p => p.isActive).map((p) => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ยกเลิก</Button>
        <Button onClick={handleSave} variant="contained" disabled={!title.trim()}>
          บันทึก
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * A click-to-edit text block (same pattern as the description editor):
 * read-only text until clicked, then a multiline field with cancel/save.
 * Used for the analysis/cause and resolution fields on the issue card.
 */
function EditableTextField({
  label,
  value,
  placeholder,
  canEdit,
  saving,
  onSave,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  canEdit: boolean;
  saving: boolean;
  onSave: (next: string) => Promise<void>;
}) {
  const t = useTranslations("Boards");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [savingField, setSavingField] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const busy = saving || savingField;

  const handleSave = async () => {
    if (busy) return;
    setSavingField(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSavingField(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        {canEdit && !editing && (
          <IconButton
            size="small"
            onClick={() => {
              setDraft(value ?? "");
              setEditing(true);
            }}
            sx={{ p: 0.25 }}
          >
            <EditIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>
      {editing ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <TextField
            fullWidth
            multiline
            rows={3}
            size="small"
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
            <Button size="small" onClick={() => setEditing(false)} disabled={busy}>
              {t("cancel")}
            </Button>
            <Button
              size="small"
              variant="contained"
              disabled={busy}
              startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
              onClick={handleSave}
            >
              {t("save")}
            </Button>
          </Box>
        </Box>
      ) : (
        <Box
          onClick={canEdit ? () => { setDraft(value ?? ""); setEditing(true); } : undefined}
          sx={{
            p: 1.5,
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            minHeight: 56,
            cursor: canEdit ? "pointer" : "default",
            "&:hover": canEdit ? { borderColor: "primary.main", bgcolor: "action.hover" } : {},
          }}
        >
          <Typography
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", color: value ? "text.primary" : "text.secondary" }}
          >
            {value || placeholder}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/**
 * **เหตุผลที่บันทึกตอนตีกลับงาน** (ข้อมูล ไม่ใช่ข้อความ UI — ค่าคงที่ภาษาไทย
 * เหมือนชื่อสถานะ/หมวดหมู่อื่นในระบบ) · ส่วน**ชื่อสถานะปลายทาง**มาจาก
 * `@kanban/shared` → `REJECT_STATUS_NAME` (จุดเดียวทั้ง web/API — API ยกเว้น
 * move guards ทั้ง 3 เมื่อปลายทางคือสถานะนี้ด้วยค่าเดียวกันนี้)
 *
 * กฎที่มาของปุ่ม: "ถ้า MA หมด ยังแจ้งได้อยู่ แต่ถ้าเป็น MA/Requirement เราจะ
 * ตีกลับ" — การ์ดถูกย้ายไปสถานะ "ยกเลิก" พร้อมเหตุผลในความคิดเห็น (และ
 * `resolution` แบบ best-effort เพราะฟิลด์นี้ถูก rule ล็อกได้)
 */
const REJECT_REASON =
  "ตีกลับ: สัญญา MA หมดอายุ — ไม่สามารถรับงานประเภท MA/Requirement ได้";

function IssueDetailDialog({
  issue,
  open,
  onClose,
  statuses,
  labels,
  onRefresh,
  readOnly = false,
  onRestore,
  initialTab = "comments",
}: {
  issue: BoardIssue | null;
  open: boolean;
  onClose: () => void;
  statuses: IssueStatus[];
  labels: Label[];
  onRefresh: () => void;
  readOnly?: boolean;
  onRestore?: (id: number) => void;
  initialTab?: "comments" | "history";
}) {
  const { can } = usePermissions();
  const { notify } = useNotification();
  const fail = useCallback(
    (msg: string | null) => {
      if (msg) notify(msg, "error");
    },
    [notify],
  );
  const [tab, setTab] = useState<"comments" | "history">(initialTab);
  const [comments, setComments] = useState<Comment[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [localIssue, setLocalIssue] = useState<BoardIssue | null>(null);
  const [draftPriorityId, setDraftPriorityId] = useState<number | null>(null);
  const [draftProgrammerId, setDraftProgrammerId] = useState<number | null>(null);
  const [draftLabelIds, setDraftLabelIds] = useState<number[]>([]);
  /** ประเภทงาน draft (null = ยังไม่ระบุ) — บันทึกพร้อมกันตอนกด "บันทึก" */
  const [draftTaskType, setDraftTaskType] = useState<IssueTaskType | null>(null);
  const [priorities, setPriorities] = useState<IssuePriority[]>([]);
  const [users, setUsers] = useState<BoardMember[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [priorityAnchor, setPriorityAnchor] = useState<HTMLElement | null>(null);
  const [taskTypeAnchor, setTaskTypeAnchor] = useState<HTMLElement | null>(null);
  const [labelAnchor, setLabelAnchor] = useState<HTMLElement | null>(null);
  const [memberAnchor, setMemberAnchor] = useState<HTMLElement | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [labelSearch, setLabelSearch] = useState("");
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("default");
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [saving, setSaving] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [deletingComment, setDeletingComment] = useState<Comment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  /** ตีกลับงาน — dialog ยืนยัน + สถานะระหว่างย้าย (ปุ่มอยู่ที่ footer ของ popup) */
  const [confirmReject, setConfirmReject] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  /**
   * **"ย้ายกลับ"** — ปุ่มแทน "ตีกลับงาน" ใน footer เมื่อการ์ดอยู่ในสถานะ "ยกเลิก"
   * · กดครั้งเดียว = ย้ายไป**สถานะแรก** (`statuses[0]`) ทันที ไม่มีเมนูเลือก ·
   * `recovering` กันกดซ้ำระหว่างย้าย
   */
  const [recovering, setRecovering] = useState(false);
  const currentUser = useAuthStore((s) => s.user) ?? null;
  const currentUserId = currentUser?.id ?? null;
  const t = useTranslations("Boards");

  // ── time section: running session + manual entry ──
  const canSeeTime = can("time.system.view");
  const canSeeActual = can("time.actual.view");
  const canEditActual = can("time.actual.edit");
  const [openSession, setOpenSession] = useState<{ startedAt: string } | null>(null);
  const [tickNow, setTickNow] = useState(() => Date.now());
  const [actualHours, setActualHours] = useState("0");
  const [actualMinutes, setActualMinutes] = useState("0");
  const [savingActual, setSavingActual] = useState(false);
  // the card as the dialog currently shows it (fresher than the `issue` prop
  // after any in-dialog save) — declared early so every helper can read it
  const current = localIssue;
  /**
   * สถานะปลายทาง "ยกเลิก" + การ์ดอยู่ในนั้นหรือไม่ — ปุ่ม footer สลับระหว่าง
   * "ตีกลับงาน" (การ์ดปกติ) กับ **"กู้คืน"** (การ์ดใน "ยกเลิก" แล้ว) · ปุ่ม
   * ตีกลับที่กดซ้ำบนการ์ดที่ยกเลิกไปแล้วเคยเขียน comment/resolution ทับ
   * เปล่า ๆ → ตอนนี้ถูกแทนด้วยปุ่มกู้คืนตั้งแต่แรก
   */
  const rejectStatusId = statuses.find((s) => s.name === REJECT_STATUS_NAME)?.id ?? null;
  const isCancelled = rejectStatusId != null && current?.statusId === rejectStatusId;

  const canViewComments = can("comment.view");
  const canPostComment = can("comment.create");
  const canEditComment = can("comment.own.update");
  const canDeleteOwnComment = can("comment.own.delete");
  const canDeleteAnyComment = can("comment.all.delete");
  const canViewHistory = can("issue.detail.view");
  const canEditIssue = !readOnly && can("issue.all.update");
  const canSetPriority = can("priority.view") && canEditIssue;
  const canSetLabels = can("label.view") && canEditIssue;
  const canCreateLabel = can("label.create");
  const canEditLabel = can("label.update");
  const canAssign = can("issue.assign");
  const canViewAttachments = can("board.view");
  const canUploadAttachment = can("issue.create") && !readOnly;
  const canDeleteAttachment = can("issue.all.update") && !readOnly;

  useEffect(() => {
    setLocalIssue(issue);
    setDraftPriorityId(issue?.priorityId ?? null);
    setDraftProgrammerId(issue?.programmerId ?? null);
    setDraftLabelIds(issue?.labelIds ?? []);
    setDraftTaskType(issue?.taskType ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id]);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  // is there a timer running on this card right now? (+ tick every second)
  useEffect(() => {
    if (!open || !issue?.id) {
      setOpenSession(null);
      return;
    }
    let cancelled = false;
    getOpenTimer(issue.id)
      .then((session) => {
        if (!cancelled) setOpenSession(session ? { startedAt: session.startedAt } : null);
      })
      .catch(() => {
        if (!cancelled) setOpenSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, issue?.id]);

  useEffect(() => {
    if (!openSession) return;
    const interval = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [openSession]);

  // keep the manual-entry inputs in sync with the stored value
  useEffect(() => {
    if (!open) return;
    const total = current?.actualFixDuration ?? 0;
    setActualHours(String(Math.floor(total / 3600)));
    setActualMinutes(String(Math.floor((total % 3600) / 60)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current?.actualFixDuration]);

  const saveActualTime = async () => {
    if (!current) return;
    const hours = Math.max(0, Math.floor(Number(actualHours) || 0));
    const minutes = Math.min(59, Math.max(0, Math.floor(Number(actualMinutes) || 0)));
    setSavingActual(true);
    try {
      const updated = await setActualFixDuration(current.id, hours * 3600 + minutes * 60);
      setLocalIssue(updated);
      onRefresh();
    } finally {
      setSavingActual(false);
    }
  };

  // derived values for the time section
  const runningSince = openSession?.startedAt ?? null;
  const liveSeconds = runningSince ? elapsedSince(runningSince, tickNow) : 0;
  const trackedTotal = (current?.trackedDuration ?? 0) + liveSeconds;
  const neverTimed = !runningSince && trackedTotal <= 0;
  const actualRowVisible =
    canSeeActual && Boolean(current?.timeEntryUnlocked || current?.timeEntryEverGranted);
  const actualEditable =
    actualRowVisible && Boolean(current?.timeEntryUnlocked) && canEditActual && !readOnly;
  // ⏱ box: only for cards an active start-timer rule actually covers, or cards
  // that were/are being timed — a card the rules never time hides it entirely
  const timeBoxVisible = canSeeTime && (Boolean(current?.timerRuleApplies) || !neverTimed);
  const sectionVisible = timeBoxVisible || actualRowVisible;
  // manual-entry inputs: narrow fields with the browser's ↑↓ spinners hidden
  const actualInputSx = {
    width: 44,
    "& input[type=number]": { MozAppearance: "textfield" },
    "& input[type=number]::-webkit-inner-spin-button, & input[type=number]::-webkit-outer-spin-button": {
      WebkitAppearance: "none",
      margin: 0,
    },
  };

  useEffect(() => {
    if (!issue || !open) return;
    setLoading(true);
    // allSettled: one failing request must not blank out the whole popup
    Promise.allSettled([
      canViewComments ? fetchIssueComments(issue.id).then((r) => r.data) : Promise.resolve([] as Comment[]),
      canViewHistory ? fetchIssueActivity(issue.id) : Promise.resolve([] as ActivityLog[]),
      canViewAttachments ? fetchAttachments(issue.id) : Promise.resolve([] as Attachment[]),
      canSetPriority
        ? fetchPriorities().then((r) => r.data)
        : Promise.resolve([] as IssuePriority[]),
      canAssign
        ? fetchMembers()
        : Promise.resolve([] as BoardMember[]),
    ])
      .then((results) => {
        const [c, l, a, p, u] = results;
        setComments(c.status === "fulfilled" ? c.value : []);
        setLogs(l.status === "fulfilled" ? l.value : []);
        setAttachments(a.status === "fulfilled" ? a.value : []);
        setPriorities(p.status === "fulfilled" ? p.value : []);
        setUsers(u.status === "fulfilled" ? u.value : []);
        const failed = results.find((r) => r.status === "rejected");
        if (failed && failed.status === "rejected") {
          fail(getErrorMessage(failed.reason, "โหลดข้อมูลไม่สำเร็จ"));
        }
      })
      .finally(() => setLoading(false));
  }, [issue, open, canViewComments, canViewHistory, canViewAttachments, canSetPriority, canAssign, fail]);

  const handlePost = async () => {
    if (readOnly) return;
    const content = draft.trim();
    if (!content || !localIssue) return;
    setPosting(true);
    try {
      const comment = await createComment(localIssue.id, content);
      setComments((prev) => [...prev, comment]);
      setDraft("");
      onRefresh();
    } catch (e) {
      fail(getErrorMessage(e, "ส่งความคิดเห็นไม่สำเร็จ"));
    } finally {
      setPosting(false);
    }
  };

  const openEditComment = (comment: Comment) => {
    setEditingComment(comment);
    setEditDraft(comment.content);
  };

  const handleUpdateComment = async () => {
    if (!editingComment || savingComment) return;
    const content = editDraft.trim();
    if (!content) return;
    setSavingComment(true);
    try {
      const updated = await updateComment(editingComment.id, content);
      setComments((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditingComment(null);
    } catch (e) {
      fail(getErrorMessage(e, "แก้ไขความคิดเห็นไม่สำเร็จ"));
    } finally {
      setSavingComment(false);
    }
  };

  const handleDeleteComment = async () => {
    if (!deletingComment || deleteLoading) return;
    setDeleteLoading(true);
    try {
      await deleteComment(deletingComment.id);
      setComments((prev) => prev.filter((c) => c.id !== deletingComment.id));
      setDeletingComment(null);
      onRefresh();
    } catch (e) {
      fail(getErrorMessage(e, "ลบความคิดเห็นไม่สำเร็จ"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSetPriority = (priorityId: number | null) => {
    setPriorityAnchor(null);
    setDraftPriorityId(priorityId);
  };

  /** เลือก/ล้างประเภทงาน — null = กลับเป็น "ยังไม่ระบุ" (ไม่หัก MA) */
  const handleSetTaskType = (taskType: IssueTaskType | null) => {
    setTaskTypeAnchor(null);
    setDraftTaskType(taskType);
  };

  const handleAssign = (programmerId: number | null) => {
    setMemberAnchor(null);
    setMemberSearch("");
    setDraftProgrammerId(programmerId);
  };

  const selectedLabelIds = draftLabelIds;

  const selectedLabels = labels.filter((l) => selectedLabelIds.includes(l.id));

  const handleToggleLabel = (labelId: number) => {
    setDraftLabelIds((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId],
    );
  };

  const handleCreateLabel = async () => {
    const name = newLabelName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const label = await createLabel({ name, color: newLabelColor });
      setNewLabelName("");
      setNewLabelColor("default");
      setCreatingLabel(false);
      setDraftLabelIds((prev) => [...prev, label.id]);
    } catch (e) {
      fail(getErrorMessage(e, "สร้ายป้ายไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  const sortedEqual = (a: number[], b: number[]) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

  const hasDraftChanges =
    (localIssue?.priorityId ?? null) !== draftPriorityId ||
    (localIssue?.programmerId ?? null) !== draftProgrammerId ||
    (localIssue?.taskType ?? null) !== draftTaskType ||
    !sortedEqual(localIssue?.labelIds ?? [], draftLabelIds);

  const resetDrafts = () => {
    setDraftPriorityId(localIssue?.priorityId ?? null);
    setDraftProgrammerId(localIssue?.programmerId ?? null);
    setDraftLabelIds(localIssue?.labelIds ?? []);
    setDraftTaskType(localIssue?.taskType ?? null);
  };

  const handleCancel = () => {
    resetDrafts();
    onClose();
  };

  const handleSave = async () => {
    if (!localIssue || saving) return;
    setSaving(true);
    try {
      const data: { priorityId?: number | null; labelIds?: number[]; taskType?: IssueTaskType | null } = {};
      if ((localIssue.priorityId ?? null) !== draftPriorityId) {
        data.priorityId = draftPriorityId;
      }
      if (!sortedEqual(localIssue.labelIds ?? [], draftLabelIds)) {
        data.labelIds = draftLabelIds;
      }
      if ((localIssue.taskType ?? null) !== draftTaskType) {
        data.taskType = draftTaskType;
      }
      if (Object.keys(data).length > 0) {
        await updateIssue(localIssue.id, data);
      }
      if ((localIssue.programmerId ?? null) !== draftProgrammerId) {
        await assignIssue(localIssue.id, draftProgrammerId);
      }
      onRefresh();
      resetDrafts();
      onClose();
    } catch (e) {
      fail(getErrorMessage(e, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  /**
   * **ตีกลับงาน** — ย้ายไปสถานะ "ยกเลิก" พร้อมเหตุผล (ข้อสรุป: MA หมดอายุ →
   * รับงาน MA/Requirement ไม่ได้) · เหตุผล (comment + `resolution`) เป็น
   * **best-effort**: comment อาจติดสิทธิ์ และ `resolution` ถูก rule ล็อกในบาง
   * สถานะ (`assertFieldEditable` ฝั่งเซิร์ฟเวอร์) — ส่วนที่**บังคับคือย้ายสถานะ**
   * เพราะนั่นคือ "การตีกลับ" จริง (การย้ายส่ง notification ถึงผู้รับ + ผู้แจ้ง
   * จากกลไกเดิมเอง)
   */
  const handleReject = async () => {
    if (!current || rejecting) return;
    const target = statuses.find((s) => s.name === REJECT_STATUS_NAME);
    if (!target) {
      // ยังไม่มีสถานะปลายทาง → ยังไม่เขียนอะไรเลย (บอกให้ไปเพิ่มใน master-data)
      setConfirmReject(false);
      notify(t("detail.rejectNoStatus"), "error");
      return;
    }
    setRejecting(true);
    try {
      try {
        await createComment(current.id, REJECT_REASON);
      } catch {
        /* best-effort — เหตุผลหลักอยู่ที่การย้ายสถานะ */
      }
      try {
        await updateIssue(current.id, { resolution: REJECT_REASON });
      } catch {
        /* best-effort — resolution อาจถูก rule ล็อกในสถานะนี้ */
      }
      await moveIssue(current.id, target.id);
      resetDrafts();
      onRefresh();
      onClose();
      notify(t("detail.rejectSuccess"), "success");
    } catch (e) {
      const msg = getErrorMessage(e, t("detail.rejectFailed"));
      if (msg) notify(msg, "error");
    } finally {
      setRejecting(false);
      setConfirmReject(false);
    }
  };

  /**
   * **ย้ายกลับ** — กดครั้งเดียว = ย้ายออกจาก "ยกเลิก" ไป**สถานะแรก**
   * (`statuses[0]` ตามลำดับ position = รอรับเรื่อง) ทันที · comment /
   * `resolution` ที่ "ตีกลับงาน" ฝังไว้ **เก็บเป็นประวัติ** (ไม่ลบ) ·
   * activity + notification มาจาก `move()` เดิม · ไม่มี dialog ยืนยัน —
   * ย้ายกลับย้อนได้เสมอ · 400 = ตาข่าย "ลากทีละคอลัมน์" ถูกเปิดทีหลัง →
   * ข้อความไทยเดียวกับตอนลากถูกกัน, ไม่ใช่ข้อความอังกฤษดิบ
   */
  const handleRecover = async () => {
    const target = statuses[0];
    if (!current || recovering || !target || target.id === rejectStatusId) return;
    setRecovering(true);
    try {
      await moveIssue(current.id, target.id);
      resetDrafts();
      onRefresh();
      onClose();
      notify(t("detail.recoverSuccess", { status: target.name }), "success");
    } catch (e) {
      const refusal = isApiError(e, 400) ? t("invalidTransition") : null;
      if (refusal) notify(refusal, "warning");
      else {
        // `getErrorMessage` คืน `null` เมื่อไม่มีข้อความ — เงียบแทนที่จะ notify null
        const msg = getErrorMessage(e, t("detail.recoverFailed"));
        if (msg) notify(msg, "error");
      }
    } finally {
      setRecovering(false);
    }
  };

  const handleSaveLabel = async (id: number, data: { name: string; color: string }) => {
    setEditingLabel(null);
    try {
      await updateLabel(id, data);
      onRefresh();
    } catch (e) {
      fail(getErrorMessage(e, "แก้ไขป้ายไม่สำเร็จ"));
    }
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !localIssue) return;
    setAttachmentUploading(true);
    try {
      const uploaded = await uploadAttachment(localIssue.id, file);
      setAttachments((prev) => [...prev, uploaded]);
      onRefresh();
    } catch (err) {
      fail(getErrorMessage(err, "อัปโหลดไฟล์ไม่สำเร็จ"));
    } finally {
      setAttachmentUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAttachment = async (id: number) => {
    if (!localIssue) return;
    try {
      await deleteAttachment(id);
      setAttachments((prev) => prev.filter((a) => a.id !== id));
      onRefresh();
    } catch (err) {
      fail(getErrorMessage(err, "ลบไฟล์ไม่สำเร็จ"));
    }
  };

  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("md"));
  const status = current?.statusId ? statuses.find((s) => s.id === current.statusId) : null;
  const statusName = status ? (status.customName ?? status.name) : null;
  const categoryName = current ? getCategoryLabel(current) : "—";
  /**
   * Empty value → "ยังไม่ระบุ" (key `detail.notSet`), never a bare "—": an
   * unfilled field should read as "not filled in yet", the same word the
   * task-type field already uses. `getCategoryLabel()` answers "—" for a card
   * with no category, so that placeholder is folded in here too — the helper
   * itself stays in this popup (the table keeps its "—" columns on purpose).
   */
  const emptyLabel = (v?: string | null) => (v && v !== "—" ? v : t("detail.notSet"));
  const draftPriority = priorities.find((p) => p.id === draftPriorityId) ?? null;
  const draftPriorityName = draftPriority?.name ?? null;
  // Viewers never load that list (the fetch above is gated by canSetPriority),
  // so the read-only branch must fall back to the name the API already sent —
  // otherwise every card a customer opens shows "—" while the table column
  // right next to it shows the real priority. Only the read-only branch uses
  // this: the editable one must keep the draft alone so "ล้าง" really clears it.
  const displayPriorityName = draftPriorityName ?? current?.priorityName ?? null;
  const programmers = users.filter((u) => u.isActive && u.roleName === "programmer");
  const member = draftProgrammerId
    ? programmers.find((u) => Number(u.id) === draftProgrammerId) ?? null
    : null;
  const visibleProgrammers = programmers.filter(
    (u) =>
      u.id !== member?.id &&
      u.name.toLowerCase().includes(memberSearch.trim().toLowerCase()),
  );
  const visibleLabels = labels.filter((l) =>
    l.name.toLowerCase().includes(labelSearch.trim().toLowerCase()),
  );

  const issueKey = current ? (current.issueNumber ?? "") : "";

  // the two rule-driven fill-ins: editable only inside exactly the status an
  // active rule opens them for (the API sends that answer as canEdit*)
  const canFillAnalysis = canEditIssue && Boolean(current?.canEditAnalysis);
  const canFillResolution = canEditIssue && Boolean(current?.canEditResolution);
  // the ประเภทงาน lock (issue.require_task_type) — false only when the SERVER
  // says so; an absent flag (older API) stays editable, fail open
  const canFillTaskType = canEditIssue && current?.canEditTaskType !== false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{ sx: { borderRadius: 4, width: { xs: "100%", md: 1100 }, maxWidth: "95vw", height: { xs: "100%", md: "90vh" }, display: "flex", flexDirection: "column", overflow: "hidden" } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.5, pt: 2, pb: 1.5 }}>
        {isEditingTitle ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
            <TextField
              fullWidth
              size="small"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              disabled={savingTitle}
              autoFocus
            />
            <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
              <Button size="small" onClick={() => setIsEditingTitle(false)} disabled={savingTitle}>
                {t("cancel")}
              </Button>
              <Button
                size="small"
                variant="contained"
                disabled={savingTitle}
                startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
                onClick={async () => {
                  if (!current) return;
                  setSavingTitle(true);
                  try {
                    const updated = await updateIssue(current.id, { title: titleDraft });
                    setLocalIssue(updated);
                    onRefresh();
                    setIsEditingTitle(false);
                  } finally {
                    setSavingTitle(false);
                  }
                }}
              >
                {t("save")}
              </Button>
            </Box>
          </Box>
        ) : (
          <Box
            onClick={() => {
              if (readOnly) return;
              setTitleDraft(current?.title ?? "");
              setIsEditingTitle(true);
            }}
            sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 0, cursor: readOnly ? "default" : "pointer" }}
          >
            <Typography
              variant="h5"
              fontWeight={700}
              sx={{
                lineHeight: 1.3,
                flex: 1,
                minWidth: 0,
                overflowWrap: "anywhere",
                "&:hover": readOnly ? {} : { color: "primary.main" },
              }}
            >
              {current?.title}
            </Typography>
            {!readOnly && <EditIcon sx={{ fontSize: 16, color: "text.secondary" }} />}
          </Box>
        )}
        <Typography variant="subtitle2" fontWeight={700} color="common.black">
          {issueKey}
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label={t("close")}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />
      {readOnly && (
        <Alert severity="warning" sx={{ mx: 2.5, mt: 1.5, mb: 0 }} icon={<RestoreFromTrashIcon />}>
          {t("trashDetailBanner")}
        </Alert>
      )}
      <Box
        sx={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          flexDirection: isNarrow ? "column" : "row",
        }}
      >
        <Box
          sx={{
            flex: 1.2,
            minWidth: 0,
            p: 3,
            overflowY: "auto",
            borderRight: isNarrow ? "none" : "1px solid",
            borderBottom: isNarrow ? "1px solid" : "none",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            gap: 2.5,
          }}
        >
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t("detail.app")}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: current?.appName ? "text.primary" : "text.secondary" }}>
                {emptyLabel(current?.appName)}
              </Typography>
            </Grid>
            {/* บริษัทของผู้แจ้ง — read-only; มาจาก `customerCompanyName` ใน
                issues.service.toResponse() (relation customer.company) */}
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t("detail.company")}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  mt: 0.5,
                  color: current?.customerCompanyName ? "text.primary" : "text.secondary",
                }}
              >
                {emptyLabel(current?.customerCompanyName)}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t("detail.status")}
              </Typography>
              <Typography
                variant="body2"
                sx={{ mt: 0.5, color: statusName ? "text.primary" : "text.secondary" }}
              >
                {emptyLabel(statusName)}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t("detail.category")}
              </Typography>
              <Typography
                variant="body2"
                sx={{ mt: 0.5, color: categoryName !== "—" ? "text.primary" : "text.secondary" }}
              >
                {emptyLabel(categoryName)}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t("detail.priority")}
              </Typography>
              {canSetPriority ? (
                <Box
                  onClick={saving ? undefined : (e) => setPriorityAnchor(e.currentTarget)}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    mt: 0.5,
                    px: 1.25,
                    py: 1,
                    // white pill — same recipe as every non-dashboard dropdown
                    // (PILL_SELECT_SX): white fill + always-on divider border,
                    // hover grey.50 + darker edge, rounded 10
                    bgcolor: "common.white",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "10px",
                    transition: "background-color 150ms ease",
                    cursor: saving ? "default" : "pointer",
                    "&:hover": { bgcolor: "grey.50", borderColor: "grey.400" },
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: draftPriorityName ? "text.primary" : "text.secondary" }}
                  >
                    {draftPriorityName
                      ? priorityLabel(t, draftPriorityName)
                      : t("detail.selectPriority")}
                  </Typography>
                  <ExpandMoreIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </Box>
              ) : displayPriorityName ? (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {priorityLabel(t, displayPriorityName)}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {t("detail.notSet")}
                </Typography>
              )}
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t("detail.taskType")}
              </Typography>
              {canFillTaskType ? (
                <Box
                  onClick={saving ? undefined : (e) => setTaskTypeAnchor(e.currentTarget)}
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 0.75,
                    mt: 0.5,
                    px: 1.25,
                    py: 1,
                    // white pill — same recipe as every non-dashboard dropdown
                    // (PILL_SELECT_SX): white fill + always-on divider border,
                    // hover grey.50 + darker edge, rounded 10
                    bgcolor: "common.white",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "10px",
                    transition: "background-color 150ms ease",
                    cursor: saving ? "default" : "pointer",
                    "&:hover": { bgcolor: "grey.50", borderColor: "grey.400" },
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontWeight: 600, color: draftTaskType ? "text.primary" : "text.secondary" }}
                  >
                    {draftTaskType ? t(`taskType.${draftTaskType}`) : t("detail.taskTypeUnset")}
                  </Typography>
                  <ExpandMoreIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                </Box>
              ) : current?.taskType ? (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  {t(`taskType.${current.taskType}`)}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {/* locked by the rule before anything was chosen — say
                      "ยังไม่ระบุ" so it reads as a locked empty field; the bare
                      "—" stays for users who simply may not edit the card */}
                  {canEditIssue ? t("detail.taskTypeUnset") : "—"}
                </Typography>
              )}
              {/* no caption here on purpose: the locked field just shows its
                  value (ยังไม่ระบุ / —) — the rule's explanation was dropped
                  from the popup; key `detail.taskTypeLockedHint` stays in the
                  messages (keep-unused-keys) should it ever come back */}
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t("detail.reporter")}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
                <Avatar
                  sx={{
                    width: 28,
                    height: 28,
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    bgcolor: "primary.main",
                    color: "primary.contrastText",
                  }}
                >
                  {current?.customerName ? current.customerName.charAt(0).toUpperCase() : <PersonIcon sx={{ fontSize: 15 }} />}
                </Avatar>
                <Typography
                  variant="body2"
                  color={current?.customerName ? "text.primary" : "text.secondary"}
                >
                  {emptyLabel(current?.customerName)}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t("detail.assignee")}
              </Typography>
              {canAssign ? (
                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
                  {member ? (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                      <Avatar
                        sx={{
                          width: 28,
                          height: 28,
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                        }}
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <Typography variant="body2" noWrap>
                        {member.name}
                      </Typography>
                      <IconButton
                        size="small"
                        disabled={saving}
                        onClick={() => handleAssign(null)}
                        sx={{ p: 0.25 }}
                      >
                        <CloseIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                      </IconButton>
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      {t("detail.unassigned")}
                    </Typography>
                  )}
                  <IconButton
                    size="small"
                    disabled={saving}
                    onClick={(e) => setMemberAnchor(e.currentTarget)}
                    sx={{ border: "1px dashed", borderColor: "divider", borderRadius: "50%", width: 28, height: 28 }}
                  >
                    <AddIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Box>
              ) : (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5 }}>
                  <Avatar
                    sx={{
                      width: 28,
                      height: 28,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      bgcolor: member ? "primary.main" : theme.palette.grey[300],
                      color: member ? "primary.contrastText" : theme.palette.grey[600],
                    }}
                  >
                    {member ? member.name.charAt(0).toUpperCase() : <PersonIcon sx={{ fontSize: 15 }} />}
                  </Avatar>
                  <Typography variant="body2">{member?.name ?? t("detail.unassigned")}</Typography>
                </Box>
              )}
            </Grid>
          </Grid>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
              {t("detail.labels")}
            </Typography>
            {canSetLabels ? (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, alignItems: "center" }}>
                {selectedLabels.map((l) => (
                  <Chip
                    key={l.id}
                    label={l.name}
                    size="small"
                    disabled={saving}
                    onClick={() => handleToggleLabel(l.id)}
                    onDelete={() => handleToggleLabel(l.id)}
                    deleteIcon={<CancelIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      ...labelChipSx(l.color, theme),
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  />
                ))}
                {selectedLabels.length === 0 && !current?.labelName && (
                  <Typography variant="caption" color="text.secondary">{t("detail.addLabel")}</Typography>
                )}
                <IconButton
                  size="small"
                  disabled={saving}
                  onClick={(e) => setLabelAnchor(e.currentTarget)}
                  sx={{ border: "1px dashed", borderColor: "divider", borderRadius: "50%", width: 28, height: 28 }}
                >
                  <AddIcon sx={{ fontSize: 15 }} />
                </IconButton>
              </Box>
            ) : current?.labelName ? (
              <Chip
                label={current.labelName}
                size="small"
                sx={{
                  ...labelChipSx(current.labelColor, theme),
                  fontSize: "0.75rem",
                  fontWeight: 600,
                }}
              />
            ) : (
              <Typography variant="body2">—</Typography>
            )}
          </Box>
          {/* ⏱ เวลา + 📅 วันกำหนดส่ง — the card itself has no buttons; timers run via rules */}
          {sectionVisible && (
            <Box>
              <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "flex-start" }}>
                {(timeBoxVisible || actualRowVisible) && (
                  <Box sx={{ flex: "1 1 260px", minWidth: 0 }}>
                    {timeBoxVisible && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                        {t("detail.time.title")}
                      </Typography>
                    )}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                      {timeBoxVisible &&
                        (neverTimed ? (
                          <Typography variant="body2" color="text.secondary">
                            {t("detail.time.never")}
                          </Typography>
                        ) : (
                          <>
                            <Chip
                              size="small"
                              variant="outlined"
                              color={runningSince ? "success" : "default"}
                              icon={
                                <TimerOutlinedIcon
                                  sx={{
                                    fontSize: 14,
                                    animation: runningSince ? `${timerPulse} 1.5s ease-in-out infinite` : "none",
                                  }}
                                />
                              }
                              label={
                                <Box component="span" sx={{ fontFamily: "monospace", fontWeight: 700 }}>
                                  {formatClock(trackedTotal)}
                                </Box>
                              }
                            />
                            <Typography variant="caption" color="text.secondary">
                              {runningSince ? t("detail.time.running") : t("detail.time.stopped")}
                            </Typography>
                          </>
                        ))}
                    </Box>
                    {actualRowVisible && (
                      <Box sx={{ mt: timeBoxVisible ? 1.5 : 0 }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                          {t("detail.time.actualLabel")}
                        </Typography>
                        {actualEditable ? (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                            <TextField
                              size="small"
                              type="number"
                              value={actualHours}
                              onChange={(e) => setActualHours(e.target.value)}
                              disabled={savingActual}
                              sx={actualInputSx}
                              inputProps={{ min: 0, style: { textAlign: "right" } }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {t("detail.time.hours")}
                            </Typography>
                            <TextField
                              size="small"
                              type="number"
                              value={actualMinutes}
                              onChange={(e) => setActualMinutes(e.target.value)}
                              disabled={savingActual}
                              sx={actualInputSx}
                              inputProps={{ min: 0, max: 59, style: { textAlign: "right" } }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {t("detail.time.minutes")}
                            </Typography>
                            <Button
                              size="small"
                              disabled={savingActual}
                              startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
                              onClick={saveActualTime}
                            >
                              {t("save")}
                            </Button>
                          </Box>
                        ) : (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                            <LockIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                            <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
                              {(current?.actualFixDuration ?? 0) > 0
                                ? formatClock(current?.actualFixDuration ?? 0)
                                : "—"}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {t("detail.time.actualReadonlyHint")}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          )}
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">{t("detail.description")}</Typography>
              {!isEditingDesc && !readOnly && (
                <IconButton
                  size="small"
                  onClick={() => {
                    setDescDraft(current?.description ?? "");
                    setIsEditingDesc(true);
                  }}
                  sx={{ p: 0.25 }}
                >
                  <EditIcon sx={{ fontSize: 14 }} />
                </IconButton>
              )}
            </Box>
            {isEditingDesc ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <TextField
                  fullWidth
                  multiline
                  rows={5}
                  size="small"
                  placeholder={t("detail.descriptionPlaceholder")}
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  disabled={savingDesc}
                  autoFocus
                />
                <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                  <Button size="small" onClick={() => setIsEditingDesc(false)} disabled={savingDesc}>
                    {t("cancel")}
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    disabled={savingDesc}
                    startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
                    onClick={async () => {
                      if (!current) return;
                      setSavingDesc(true);
                      try {
                        const updated = await updateIssue(current.id, { description: descDraft });
                        setLocalIssue(updated);
                        onRefresh();
                        setIsEditingDesc(false);
                      } finally {
                        setSavingDesc(false);
                      }
                    }}
                  >
                    {t("save")}
                  </Button>
                </Box>
              </Box>
            ) : (
              <Box
                onClick={() => {
                  if (readOnly) return;
                  setDescDraft(current?.description ?? "");
                  setIsEditingDesc(true);
                }}
                sx={{
                  p: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                  minHeight: 72,
                  cursor: readOnly ? "default" : "pointer",
                  "&:hover": readOnly ? {} : {
                    borderColor: "primary.main",
                    bgcolor: "action.hover",
                  },
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: "pre-wrap", color: current?.description ? "text.primary" : "text.secondary" }}
                >
                  {current?.description || t("detail.descriptionPlaceholder")}
                </Typography>
              </Box>
            )}
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* visible from the status the rule opens them for onward (board
                order), or wherever a value already sits; editing only inside
                exactly that status — canEditAnalysis/canEditResolution */}
            {(current?.isAnalysisOpen || current?.analysisCause) && (
              <EditableTextField
                label={t("detail.analysisCause")}
                value={current?.analysisCause ?? null}
                placeholder={
                  canFillAnalysis ? t("detail.analysisPlaceholder") : t("detail.lockedHint")
                }
                canEdit={canFillAnalysis}
                saving={saving}
                onSave={async (next) => {
                  if (!current) return;
                  try {
                    const updated = await updateIssue(current.id, { analysisCause: next });
                    setLocalIssue(updated);
                    onRefresh();
                  } catch (e) {
                    fail(getErrorMessage(e, "บันทึกวิเคราะห์/สาเหตุไม่สำเร็จ"));
                    throw e;
                  }
                }}
              />
            )}
            {(current?.isResolutionOpen || current?.resolution) && (
              <EditableTextField
                label={t("detail.resolution")}
                value={current?.resolution ?? null}
                placeholder={
                  canFillResolution
                    ? t("detail.resolutionPlaceholder")
                    : t("detail.lockedHint")
                }
                canEdit={canFillResolution}
                saving={saving}
                onSave={async (next) => {
                  if (!current) return;
                  try {
                    const updated = await updateIssue(current.id, { resolution: next });
                    setLocalIssue(updated);
                    onRefresh();
                  } catch (e) {
                    fail(getErrorMessage(e, "บันทึกการแก้ไขไม่สำเร็จ"));
                    throw e;
                  }
                }}
              />
            )}
          </Box>
          {canViewAttachments && attachments.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                {t("detail.attachments")}
              </Typography>
              {attachments.map((file) => (
                <Box
                  key={file.id}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    p: "8px 10px",
                    mb: 1,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                  }}
                >
                  <AttachFileIcon sx={{ fontSize: 20, color: "primary.main", flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {file.fileName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {file.fileSize ? `${(file.fileSize / 1024).toFixed(1)} KB` : ""}
                      {file.createdAt ? ` • ${formatDateTime(file.createdAt)}` : ""}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => setPreviewAttachment(file)}
                    sx={{ color: "text.secondary" }}
                  >
                    <OpenInNewIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                  {canDeleteAttachment && (
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteAttachment(file.id)}
                      sx={{ color: "text.secondary" }}
                    >
                      <DeleteIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                  )}
                </Box>
              ))}
            </Box>
          )}
          <Box
            sx={{
              display: "flex",
              flexWrap: "wrap",
              gap: 2,
              pt: 1,
              borderTop: "1px solid",
              borderColor: "divider",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
              <AccessTimeIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                {t("detail.createdAt")} {current ? formatDateTime(current.createdAt) : "—"}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
              <AccessTimeIcon sx={{ fontSize: 16, color: "text.secondary" }} />
              <Typography variant="caption" color="text.secondary">
                {t("detail.updatedAt")} {current ? formatDateTime(current.updatedAt) : "—"}
              </Typography>
            </Box>
          </Box>
          <Popover
            open={Boolean(priorityAnchor)}
            anchorEl={priorityAnchor}
            onClose={() => setPriorityAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            PaperProps={{ sx: { ...pillPaperSx(theme), minWidth: 160 } }}
          >
            {priorities
              .filter((p) => p.isActive)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((p) => {
                const selected = draftPriorityId === p.id;
                return (
                  <Box
                    key={p.id}
                    onClick={saving ? undefined : () => handleSetPriority(p.id)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      px: 1.25,
                      py: 0.75,
                      borderRadius: "8px",
                      fontSize: 13,
                      cursor: saving ? "default" : "pointer",
                      bgcolor: selected ? "action.selected" : "transparent",
                      "&:hover": { bgcolor: selected ? "action.selected" : "action.hover" },
                    }}
                  >
                    <Box sx={{ width: 16, display: "flex", alignItems: "center" }}>
                      {selected && <CheckIcon sx={{ fontSize: 16, color: "primary.main" }} />}
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{ fontSize: 13, fontWeight: selected ? 600 : 400 }}
                      color={selected ? "text.primary" : "text.secondary"}
                    >
                      {priorityLabel(t, p.name)}
                    </Typography>
                  </Box>
                );
              })}
            {draftPriorityId && (
              <Button size="small" disabled={saving} onClick={() => handleSetPriority(null)} sx={{ mt: 0.5 }}>
                {t("detail.clear")}
              </Button>
            )}
          </Popover>
          <Popover
            open={Boolean(taskTypeAnchor)}
            anchorEl={taskTypeAnchor}
            onClose={() => setTaskTypeAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            PaperProps={{ sx: { ...pillPaperSx(theme), minWidth: 180 } }}
          >
            {(["bug", "ma", "requirement"] as const).map((tt) => {
              const selected = draftTaskType === tt;
              return (
                <Box
                  key={tt}
                  onClick={saving ? undefined : () => handleSetTaskType(tt)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    px: 1.25,
                    py: 0.75,
                    borderRadius: "8px",
                    fontSize: 13,
                    cursor: saving ? "default" : "pointer",
                    bgcolor: selected ? "action.selected" : "transparent",
                    "&:hover": { bgcolor: selected ? "action.selected" : "action.hover" },
                  }}
                >
                  <Box sx={{ width: 16, display: "flex", alignItems: "center" }}>
                    {selected && <CheckIcon sx={{ fontSize: 16, color: "primary.main" }} />}
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: 13, fontWeight: selected ? 600 : 400 }}
                    color={selected ? "text.primary" : "text.secondary"}
                  >
                    {t(`taskType.${tt}`)}
                  </Typography>
                </Box>
              );
            })}
            {draftTaskType && (
              <Button size="small" disabled={saving} onClick={() => handleSetTaskType(null)} sx={{ mt: 0.5 }}>
                {t("detail.clear")}
              </Button>
            )}
          </Popover>
          <Popover
            open={Boolean(labelAnchor)}
            anchorEl={labelAnchor}
            onClose={() => setLabelAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            PaperProps={{ sx: { ...pillPaperSx(theme), width: 300, p: 1.5, display: "flex", flexDirection: "column", gap: 1 } }}
          >
            <TextField
              size="small"
              placeholder={t("detail.searchLabels")}
              value={labelSearch}
              onChange={(e) => setLabelSearch(e.target.value)}
              autoFocus
            />
            <Box sx={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0.25 }}>
              {visibleLabels.length === 0 ? (
                <Typography variant="caption" color="text.secondary">{t("detail.noLabelsFound")}</Typography>
              ) : (
                visibleLabels.map((l) => (
                  <Box
                    key={l.id}
                    onClick={() => handleToggleLabel(l.id)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      p: 0.5,
                      borderRadius: 1,
                      cursor: saving ? "default" : "pointer",
                      "&:hover": { bgcolor: "grey.100" },
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={selectedLabelIds.includes(l.id)}
                      disabled={saving}
                      onChange={() => handleToggleLabel(l.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Chip
                      label={l.name}
                      size="small"
                      sx={{
                        ...labelChipSx(l.color, theme),
                        flex: 1,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                      }}
                    />
                    {canEditLabel && (
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingLabel(l);
                        }}
                      >
                        <EditIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    )}
                  </Box>
                ))
              )}
            </Box>
            {canCreateLabel &&
              (creatingLabel ? (
                <Box sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                  <TextField
                    size="small"
                    placeholder={t("detail.newLabelName")}
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    fullWidth
                  />
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {labelColorKeys(theme).map((c) => (
                      <Box
                        key={c}
                        onClick={() => setNewLabelColor(c)}
                        title={c}
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          bgcolor: labelColorValue(c, theme),
                          cursor: "pointer",
                          border: newLabelColor === c ? "2px solid" : "1px solid",
                          borderColor: newLabelColor === c ? "primary.main" : "divider",
                        }}
                      />
                    ))}
                  </Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      disabled={!newLabelName.trim() || saving}
                      onClick={handleCreateLabel}
                    >
                      {t("detail.createAndApplyLabel")}
                    </Button>
                    <Button size="small" disabled={saving} onClick={() => setCreatingLabel(false)}>
                      {t("cancel")}
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setCreatingLabel(true)}
                  sx={{ borderTop: "1px solid", borderColor: "divider", borderRadius: 0, justifyContent: "flex-start" }}
                >
                  {t("detail.createLabel")}
                </Button>
              ))}
          </Popover>
          <Popover
            open={Boolean(memberAnchor)}
            anchorEl={memberAnchor}
            onClose={() => setMemberAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            PaperProps={{ sx: { ...pillPaperSx(theme), width: 280, p: 1.5, display: "flex", flexDirection: "column", gap: 1 } }}
          >
            <TextField
              size="small"
              placeholder={t("detail.searchMembers")}
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              autoFocus
            />
            {member && (
              <Box>
                <Typography variant="caption" color="text.secondary">{t("detail.membersInCard")}</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Avatar
                    sx={{
                      width: 28,
                      height: 28,
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                    }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography variant="body2" sx={{ flex: 1 }}>{member.name}</Typography>
                  <IconButton size="small" disabled={saving} onClick={() => handleAssign(null)}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              </Box>
            )}
            <Typography variant="caption" color="text.secondary">{t("detail.addMembers")}</Typography>
            <Box sx={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {visibleProgrammers.length === 0 ? (
                <Typography variant="caption" color="text.secondary">{t("detail.noMembers")}</Typography>
              ) : (
                visibleProgrammers.map((u) => (
                  <Box
                    key={u.id}
                    onClick={() => handleAssign(Number(u.id))}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.75,
                      p: 0.75,
                      borderRadius: 1,
                      cursor: saving ? "default" : "pointer",
                      "&:hover": { bgcolor: "grey.100" },
                    }}
                  >
                    <Avatar
                      sx={{
                        width: 28,
                        height: 28,
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        bgcolor: "primary.main",
                        color: "primary.contrastText",
                      }}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Typography variant="body2">{u.name}</Typography>
                  </Box>
                ))
              )}
            </Box>
          </Popover>
          <LabelEditDialog
            label={editingLabel}
            open={Boolean(editingLabel)}
            onClose={() => setEditingLabel(null)}
            onSave={handleSaveLabel}
          />
        </Box>
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Tabs value={tab} onChange={(_, v) => { setTab(v); setIsEditingDesc(false); setIsEditingTitle(false); }} variant="fullWidth" sx={{ px: 2, minHeight: 44, borderBottom: "1px solid", borderColor: "divider" }}>
            <Tab value="comments" label="ความคิดเห็น" sx={{ minHeight: 44, fontSize: "0.85rem", textTransform: "none", fontWeight: 600 }} />
            <Tab value="history" label="ประวัติ" sx={{ minHeight: 44, fontSize: "0.85rem", textTransform: "none", fontWeight: 600 }} />
          </Tabs>
          {tab === "comments" && canPostComment && !readOnly && (
            <Box sx={{ p: 2, display: "flex", gap: 1.5, alignItems: "flex-start", borderBottom: "1px solid", borderColor: "divider" }}>
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  bgcolor: "primary.main",
                  color: "primary.contrastText",
                  flexShrink: 0,
                  mt: 0.5,
                }}
              >
                {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : <PersonIcon sx={{ fontSize: 18 }} />}
              </Avatar>
              <Box sx={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="เขียนความคิดเห็น..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handlePost();
                    }
                  }}
                  multiline
                  maxRows={3}
                  sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                />
                <Tooltip title="ส่ง">
                  <span>
                    <IconButton
                      color="primary"
                      onClick={handlePost}
                      disabled={posting || !draft.trim()}
                      sx={{ mb: 0.5 }}
                    >
                      <SendIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          )}
          <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : tab === "comments" ? (
              !canViewComments ? (
                <Typography variant="body2" color="text.secondary">ไม่มีสิทธิ์ดูความคิดเห็น</Typography>
              ) : comments.length === 0 ? (
                <Typography variant="body2" color="text.secondary">ยังไม่มีความคิดเห็น</Typography>
              ) : (
                comments.map((c) => {
                  const isOwner = currentUserId !== null && c.authorId === Number(currentUserId);
                  const canEdit = !readOnly && canEditComment && isOwner;
                  const canDelete =
                    !readOnly && ((canDeleteOwnComment && isOwner) || canDeleteAnyComment);
                  return (
                    <Box key={c.id} sx={{ display: "flex", gap: 1.5 }}>
                      <Avatar
                        sx={{
                          width: 36,
                          height: 36,
                          fontSize: "0.9rem",
                          fontWeight: 700,
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                          flexShrink: 0,
                        }}
                      >
                        {c.authorName ? c.authorName.charAt(0).toUpperCase() : <PersonIcon sx={{ fontSize: 18 }} />}
                      </Avatar>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography variant="body2" fontWeight={700}>
                            {c.authorName ?? "ไม่ทราบชื่อ"}
                            {c.authorRole ? (
                              <Box component="span" sx={{ fontWeight: 400 }}>({c.authorRole})</Box>
                            ) : null}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(c.createdAt)}
                          </Typography>
                          <Box sx={{ flex: 1 }} />
                          {canEdit && (
                            <Tooltip title="แก้ไข">
                              <IconButton size="small" sx={{ color: "text.secondary" }} onClick={() => openEditComment(c)}>
                                <EditIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          {canDelete && (
                            <Tooltip title="ลบ">
                              <IconButton size="small" color="error" onClick={() => setDeletingComment(c)}>
                                <DeleteIcon sx={{ fontSize: 18 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>{c.content}</Typography>
                      </Box>
                    </Box>
                  );
                })
              )
            ) : tab === "history" ? (
              !canViewHistory ? (
                <Typography variant="body2" color="text.secondary">ไม่มีสิทธิ์ดูประวัติ</Typography>
              ) : logs.length === 0 ? (
                <Typography variant="body2" color="text.secondary">ยังไม่มีประวัติ</Typography>
              ) : (
                logs.map((log) => (
                  <Box key={log.id} sx={{ display: "flex", gap: 1.5 }}>
                    <Avatar
                      sx={{
                        width: 36,
                        height: 36,
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        bgcolor: "primary.main",
                        color: "primary.contrastText",
                        flexShrink: 0,
                      }}
                    >
                      {log.actorName ? log.actorName.charAt(0).toUpperCase() : <HistoryIcon sx={{ fontSize: 18 }} />}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2">{formatActivityAction(log)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(log.createdAt)}
                      </Typography>
                    </Box>
                  </Box>
                ))
              )
            ) : null}
          </Box>
          <Dialog
            open={!!editingComment}
            onClose={() => !savingComment && setEditingComment(null)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>แก้ไขความคิดเห็น</DialogTitle>
            <DialogContent>
              <TextField
                fullWidth
                size="small"
                multiline
                minRows={3}
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                sx={{ mt: 1 }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setEditingComment(null)} disabled={savingComment}>
                ยกเลิก
              </Button>
              <Button
                variant="contained"
                onClick={handleUpdateComment}
                disabled={savingComment || !editDraft.trim()}
              >
                บันทึก
              </Button>
            </DialogActions>
          </Dialog>
          <Dialog
            open={!!deletingComment}
            onClose={() => !deleteLoading && setDeletingComment(null)}
            maxWidth="xs"
          >
            <DialogTitle>ลบความคิดเห็น</DialogTitle>
            <DialogContent>
              {deleteLoading ? (
                <CircularProgress size={24} />
              ) : (
                <Typography variant="body2">ต้องการลบความคิดเห็นนี้ใช่หรือไม่?</Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeletingComment(null)} disabled={deleteLoading}>
                ยกเลิก
              </Button>
              <Button variant="contained" color="error" onClick={handleDeleteComment} disabled={deleteLoading}>
                ลบ
              </Button>
            </DialogActions>
          </Dialog>
          {/* ยืนยันตีกลับงาน — ย้ายไปสถานะ "ยกเลิก" + บันทึกเหตุผล (handleReject) */}
          <Dialog
            open={confirmReject}
            onClose={() => !rejecting && setConfirmReject(false)}
            maxWidth="xs"
          >
            <DialogTitle>{t("detail.rejectConfirmTitle")}</DialogTitle>
            <DialogContent>
              {rejecting ? (
                <CircularProgress size={24} />
              ) : (
                <Typography variant="body2">{t("detail.rejectConfirmMessage")}</Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmReject(false)} disabled={rejecting}>
                {t("cancel")}
              </Button>
              <Button
                variant="contained"
                color="error"
                onClick={handleReject}
                disabled={rejecting}
              >
                {t("detail.reject")}
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      </Box>
      <Divider />
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2.5, py: 1.5 }}>
        {readOnly && (
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={<RestoreFromTrashIcon />}
            disabled={!current || restoring}
            onClick={() => {
              if (!current || !onRestore) return;
              setRestoring(true);
              onRestore(current.id);
            }}
          >
            {t("restore")}
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        {/* การ์ดอยู่ใน "ยกเลิก" → ปุ่ม **ย้ายกลับ** แทน "ตีกลับงาน" (ไม่มี
            ประโยชน์บนการ์ดที่ยกเลิกไปแล้ว) · กดครั้งเดียว = ย้ายไป**สถานะแรก**
            ทันที ไม่มีเมนูเลือก · ซ่อนเมื่อไม่มีสถานะแรก หรือสถานะแรกเป็น
            "ยกเลิก" เอง (ไม่มีที่ให้ย้าย = กดแล้วไม่เกิดอะไร) */}
        {!readOnly && canEditIssue && isCancelled && statuses[0] != null && statuses[0].id !== rejectStatusId && (
          <Button
            size="small"
            variant="contained"
            disableElevation
            disabled={saving || recovering || !current}
            onClick={handleRecover}
            // สีเดียวกับ pill บนการ์ด (sky/navy) — ไอคอนถังขยะถูกถอดเพราะ
            // ไม่เหมาะกับคำว่า "ย้ายกลับ" (ผู้ใช้เคยทักไอคอนนี้แล้ว)
            sx={{
              bgcolor: theme.palette.sky.light,
              color: theme.palette.navy.main,
              fontWeight: 700,
              boxShadow: "none",
              "&:hover": { bgcolor: theme.palette.sky.main, boxShadow: "none" },
            }}
          >
            {t("recover")}
          </Button>
        )}
        {!readOnly && canEditIssue && !isCancelled && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            disabled={saving || rejecting || !current}
            onClick={() => setConfirmReject(true)}
          >
            {t("detail.reject")}
          </Button>
        )}
        {!readOnly && (
          <Button
            size="small"
            variant="outlined"
            onClick={handleCancel}
            // ตรงเกณฑ์กับปุ่ม "บันทึก" — ไม่มี draft ค้าง (ยังไม่แก้อะไร) → grey;
            // มีอะไรแก้ → ปุ่มขึ้นมากดได้ = ทิ้ง draft (`resetDrafts`) แล้วปิด
            disabled={saving || !hasDraftChanges}
          >
            {t("cancel")}
          </Button>
        )}
        <Button
          size="small"
          variant={readOnly ? "outlined" : "contained"}
          onClick={readOnly ? onClose : handleSave}
          disabled={!readOnly && (saving || !hasDraftChanges)}
          sx={{ px: 3 }}
        >
          {readOnly ? t("close") : t("save")}
        </Button>
      </Box>
      <AttachmentPreviewDialog
        attachment={previewAttachment}
        open={previewAttachment !== null}
        onClose={() => setPreviewAttachment(null)}
      />
    </Dialog>
  );
}

function LabelEditDialog({
  label,
  open,
  onClose,
  onSave,
}: {
  label: Label | null;
  open: boolean;
  onClose: () => void;
  onSave: (id: number, data: { name: string; color: string }) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("default");
  const theme = useTheme();

  useEffect(() => {
    if (label) {
      setName(label.name);
      setColor(label.color);
    }
  }, [label]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>แก้ไขป้าย</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 1 }}>
        <TextField fullWidth label="ชื่อป้าย" value={name} onChange={(e) => setName(e.target.value)} />
        <Box>
          <Typography variant="caption" color="text.secondary">สี</Typography>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.5 }}>
            {labelColorKeys(theme).map((c) => (
              <Tooltip key={c} title={c}>
                <Box
                  onClick={() => setColor(c)}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    bgcolor: labelColorValue(c, theme),
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: color === c ? "2px solid" : "1px solid",
                    borderColor: color === c ? "primary.main" : "divider",
                  }}
                >
                  {color === c && <CheckIcon sx={{ fontSize: 14, color: labelContrast(c, theme) }} />}
                </Box>
              </Tooltip>
            ))}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ยกเลิก</Button>
        <Button
          variant="contained"
          disabled={!name.trim()}
          onClick={() => label && onSave(label.id, { name: name.trim(), color })}
        >
          บันทึก
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function getPriorityColor(theme: Theme, name: string): string {
  const key = name.toLowerCase();
  if (key.includes("urgent")) return theme.palette.error.main;
  if (key.includes("high")) return theme.palette.warning.main;
  if (key.includes("medium")) return theme.palette.info.main;
  if (key.includes("low")) return theme.palette.success.main;
  return theme.palette.grey[500];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function BoardFilterPanel({
  anchorEl,
  open,
  onClose,
  statuses,
  priorities,
  categories,
  apps,
  companies,
  users,
  selectedStatusIds,
  selectedPriorityIds,
  selectedCategoryIds,
  selectedAppIds,
  selectedCompanyIds,
  selectedAssigneeIds,
  selectedReporterIds,
  isCustomer,
  onToggleStatus,
  onTogglePriority,
  onToggleCategory,
  onToggleApp,
  onToggleCompany,
  onToggleAssignee,
  onToggleReporter,
  onClearAll,
}: {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  statuses: IssueStatus[];
  priorities: IssuePriority[];
  categories: Category[];
  apps: App[];
  companies: Company[];
  users: BoardMember[];
  selectedStatusIds: number[];
  selectedPriorityIds: number[];
  selectedCategoryIds: number[];
  selectedAppIds: number[];
  selectedCompanyIds: number[];
  selectedAssigneeIds: string[];
  selectedReporterIds: string[];
  isCustomer: boolean;
  onToggleStatus: (statusId: number) => void;
  onTogglePriority: (priorityId: number) => void;
  onToggleCategory: (categoryId: number) => void;
  onToggleApp: (appId: number) => void;
  onToggleCompany: (companyId: number) => void;
  onToggleAssignee: (userId: string) => void;
  onToggleReporter: (userId: string) => void;
  onClearAll: () => void;
}) {
  const t = useTranslations("Boards");
  const theme = useTheme();
  const programmers = users.filter((u) => u.isActive && u.roleName === "programmer");
  const customers = users.filter((u) => u.isActive && u.roleName === "customer");
  const visibleApps = useMemo(() => apps.filter((a) => a.isVisible), [apps]);
  const visibleCompanies = useMemo(() => companies.filter((c) => c.isVisible), [companies]);
  const totalSelected =
    selectedStatusIds.length +
    selectedPriorityIds.length +
    selectedCategoryIds.length +
    selectedAppIds.length +
    selectedCompanyIds.length +
    selectedAssigneeIds.length +
    selectedReporterIds.length;
  const startsOpen = (count: number, fallback: boolean) =>
    totalSelected > 0 ? count > 0 : fallback;

  const statusOptions: FilterOption[] = statuses.map((status) => ({
    id: status.id,
    label: status.customName ?? status.name,
    checked: selectedStatusIds.includes(status.id),
    onToggle: () => onToggleStatus(status.id),
    start: (
      <Box
        component="span"
        sx={{
          width: 8,
          height: 8,
          flexShrink: 0,
          borderRadius: "50%",
          bgcolor: resolveStatusColor(theme, status.color, status.name),
        }}
      />
    ),
  }));

  const appOptions: FilterOption[] = visibleApps.map((app) => ({
    id: app.id,
    label: app.name,
    checked: selectedAppIds.includes(app.id),
    onToggle: () => onToggleApp(app.id),
    start: <AppsIcon sx={{ fontSize: 16, flexShrink: 0, color: "info.main" }} />,
  }));

  const companyOptions: FilterOption[] = visibleCompanies.map((company) => ({
    id: company.id,
    label: company.name,
    checked: selectedCompanyIds.includes(company.id),
    onToggle: () => onToggleCompany(company.id),
    start: <BusinessIcon sx={{ fontSize: 16, flexShrink: 0, color: "warning.main" }} />,
  }));

  const priorityOptions: FilterOption[] = priorities.map((priority) => ({
    id: priority.id,
    label: priority.name,
    checked: selectedPriorityIds.includes(priority.id),
    onToggle: () => onTogglePriority(priority.id),
    start: (
      <FlagIcon sx={{ fontSize: 16, flexShrink: 0, color: getPriorityColor(theme, priority.name) }} />
    ),
  }));

  const categoryOptions: FilterOption[] = categories.map((category) => ({
    id: category.id,
    label: category.name,
    checked: selectedCategoryIds.includes(category.id),
    onToggle: () => onToggleCategory(category.id),
    start: <CategoryIcon sx={{ fontSize: 16, flexShrink: 0, color: "secondary.main" }} />,
  }));

  const assigneeOptions: FilterOption[] = programmers.map((member) => ({
    id: member.id,
    label: member.name,
    checked: selectedAssigneeIds.includes(member.id),
    onToggle: () => onToggleAssignee(member.id),
    start: (
      <Avatar sx={{ width: 22, height: 22, fontSize: 11, flexShrink: 0 }}>
        {getInitials(member.name)}
      </Avatar>
    ),
  }));

  const reporterOptions: FilterOption[] = customers.map((member) => ({
    id: member.id,
    label: member.name,
    checked: selectedReporterIds.includes(member.id),
    onToggle: () => onToggleReporter(member.id),
    start: (
      <Avatar sx={{ width: 22, height: 22, fontSize: 11, flexShrink: 0 }}>
        {getInitials(member.name)}
      </Avatar>
    ),
  }));

  /**
   * หน้าที่ของหน้านี้เหลือแค่ **เรียงลำดับ section + คำนวณ `initialOpen`** —
   * ส่วน chrome (หัว panel / chip นับจำนวน / ปุ่ม "ล้างทั้งหมด") อยู่ที่
   * `components/filter-panel.tsx` แชร์กับทุกหน้า
   */
  const sections: FilterSectionData[] = [
    {
      key: "status",
      title: t("filter.sectionStatus"),
      icon: <ViewKanbanIcon sx={{ fontSize: 18 }} />,
      count: selectedStatusIds.length,
      options: statusOptions,
      initialOpen: startsOpen(selectedStatusIds.length, true),
    },
    {
      key: "app",
      title: t("filter.sectionApp"),
      icon: <AppsIcon sx={{ fontSize: 18 }} />,
      count: selectedAppIds.length,
      options: appOptions,
      initialOpen: startsOpen(selectedAppIds.length, false),
    },
    {
      key: "company",
      title: t("filter.sectionCompany"),
      icon: <BusinessIcon sx={{ fontSize: 18 }} />,
      count: selectedCompanyIds.length,
      options: companyOptions,
      initialOpen: startsOpen(selectedCompanyIds.length, false),
    },
    {
      key: "priority",
      title: t("filter.sectionPriority"),
      icon: <FlagIcon sx={{ fontSize: 18 }} />,
      count: selectedPriorityIds.length,
      options: priorityOptions,
      initialOpen: startsOpen(selectedPriorityIds.length, false),
    },
    {
      key: "category",
      title: t("filter.sectionCategory"),
      icon: <CategoryIcon sx={{ fontSize: 18 }} />,
      count: selectedCategoryIds.length,
      options: categoryOptions,
      initialOpen: startsOpen(selectedCategoryIds.length, false),
    },
    {
      key: "assignee",
      title: t("filter.sectionAssignee"),
      icon: <PersonIcon sx={{ fontSize: 18 }} />,
      count: selectedAssigneeIds.length,
      options: assigneeOptions,
      initialOpen: startsOpen(selectedAssigneeIds.length, false),
    },
  ];
  // section "ผู้แจ้ง" ซ่อนจากลูกค้า — เดิมก็เป็นเงื่อนไขเดียวกันนี้
  if (!isCustomer) {
    sections.push({
      key: "reporter",
      title: t("filter.sectionReporter"),
      icon: <ChatBubbleOutlineIcon sx={{ fontSize: 18 }} />,
      count: selectedReporterIds.length,
      options: reporterOptions,
      initialOpen: startsOpen(selectedReporterIds.length, false),
    });
  }

  return (
    <FilterPanel
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      sections={sections}
      onClearAll={onClearAll}
    />
  );
}

type KanbanColumnState = {
  items: BoardIssue[];
  page: number;
  total: number;
  loading: boolean;
};

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * กล่องยืนยัน **"ยกเลิกงาน"** — ย้ายการ์ดไปสถานะ "ยกเลิก" (`REJECT_STATUS_NAME`)
 *
 * - **ไม่เขียน comment / ไม่แตะ `resolution`** — เหตุผล hardcode "สัญญา MA หมดอายุ"
 *   เป็นของปุ่ม "ตีกลับงาน" ในป๊อปอัพรายละเอียด (นโยบาย MA) อยู่แล้ว การ
 *   ยกเลิกทั่วไปจึงเป็นแค่ "ย้ายสถานะ" — activity log + notification มาจาก
 *   `moveIssue()` เดิมเอง
 * - **เซิร์ฟเวอร์ไม่ต้องแก้อะไร**: `IssuesService.move()` ข้าม move guards ทั้ง 3
 *   (step-only / status lock / task-type) **อัตโนมัติ** เมื่อปลายทางชื่อ
 *   `REJECT_STATUS_NAME` — ใช้กติกาเดียวกับปุ่มตีกลับ จึงย้ายข้ามกี่คอลัมน์ก็ได้
 *   แม้กฎ "ลากทีละคอลัมน์" จะเปิดอยู่
 * - Host เป็นคนผูก `issue` (การ์ดที่กดเมนู "…") และ `onDone` หลังย้ายสำเร็จ
 *   (KanbanView → `reloadColumns()`, TableView → `onRefresh()`)
 */
function CancelIssueDialog({
  issue,
  statusId,
  onClose,
  onDone,
}: {
  issue: BoardIssue | null;
  /** id ของสถานะ "ยกเลิก" — `null` = ไม่มีสถานะนี้ในระบบ → ไม่เปิด dialog */
  statusId: number | null;
  onClose: () => void;
  /** หลังย้ายสำเร็จ — host ใช้รีเฟรชคอลัมน์/รายการ */
  onDone: () => void;
}) {
  const t = useTranslations("Boards");
  const { notify } = useNotification();
  const [saving, setSaving] = useState(false);

  // ไม่มีสถานะปลายทาง = ไม่มีอะไรให้ย้าย → ปิดทิ้ง (เมนูก็ถูก host ซ่อนไว้แล้ว)
  const open = Boolean(issue) && statusId != null;

  const handleConfirm = async () => {
    if (!issue || statusId == null || saving) return;
    setSaving(true);
    try {
      await moveIssue(issue.id, statusId);
      notify(t("cancelIssueSuccess"), "success");
      onClose();
      onDone();
    } catch (e) {
      notify(getErrorMessage(e, t("cancelIssueFailed")) ?? t("cancelIssueFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose}>
      <DialogTitle>{t("cancelIssueConfirmTitle")}</DialogTitle>
      <DialogContent>
        <Typography>{t("cancelIssueConfirmMessage")}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>{t("cancel")}</Button>
        <Button onClick={handleConfirm} color="error" disabled={saving}>
          {t("cancelIssue")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function KanbanView({
  statuses,
  labels,
  priorities,
  categories,
  users,
  selectedStatusIds,
  selectedPriorityIds,
  selectedCategoryIds,
  selectedAppIds,
  selectedCompanyIds,
  selectedAssigneeIds,
  selectedReporterIds,
  searchQuery,
  canManage,
  canEdit,
  canDelete,
  canUnlockIssue,
  timers,
  showTime,
  onRefresh,
  toolbar,
  roleName,
  stepOnlyMoves,
  taskTypeGateIds,
  staleRules,
  cardOrder,
}: {
  statuses: IssueStatus[];
  labels: Label[];
  priorities: IssuePriority[];
  categories: Category[];
  users: BoardMember[];
  selectedStatusIds: number[];
  selectedPriorityIds: number[];
  selectedCategoryIds: number[];
  selectedAppIds: number[];
  selectedCompanyIds: number[];
  selectedAssigneeIds: string[];
  selectedReporterIds: string[];
  searchQuery: string;
  canManage: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUnlockIssue: boolean;
  timers: BoardTimers;
  showTime: boolean;
  onRefresh: () => void;
  toolbar: React.ReactNode;
  roleName: string;
  /** The step-only drag rule is on — columns must refuse a jump-over drop. */
  stepOnlyMoves: boolean;
  /**
   * Statuses where an active `issue.require_task_type` rule demands a
   * ประเภทงาน before the card may leave — the drop preview refuses an
   * untyped card sitting in one of them ([] = no rule, fail open).
   */
  taskTypeGateIds: number[];
  /** Active stale rules ({statusId, days}) — the red card border. */
  staleRules: StaleRule[];
  /**
   * Column card order — `desc` = "entered this column when", newest on top
   * (the default); `asc` = longest-sitting on top. Drives both the request
   * (`sortOrder`) and `KanbanColumn`'s comparator, which must mirror it.
   */
  cardOrder: "desc" | "asc";
}) {
  const t = useTranslations("Boards");
  const theme = useTheme();
  const { notify } = useNotification();
  const fail = useCallback(
    (msg: string | null) => {
      if (msg) notify(msg, "error");
    },
    [notify],
  );
  const [activeIssue, setActiveIssue] = useState<BoardIssue | null>(null);
  const [activeStatus, setActiveStatus] = useState<IssueStatus | null>(null);
  const [detailIssue, setDetailIssue] = useState<BoardIssue | null>(null);
  const [editIssue, setEditIssue] = useState<BoardIssue | null>(null);
  const [detailTab, setDetailTab] = useState<"comments" | "history">("comments");
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [issueToDelete, setIssueToDelete] = useState<BoardIssue | null>(null);
  /** การ์ดที่กด "ยกเลิกงาน" ในเมนู "…" — รอ confirm ก่อนย้ายไปสถานะ "ยกเลิก" */
  const [issueToCancel, setIssueToCancel] = useState<BoardIssue | null>(null);
  /**
   * **ปุ่ม "ย้ายกลับ" บนหน้าการ์ด** — กดครั้งเดียว = ย้ายไป**สถานะแรก**
   * ทันที (ไม่มีเมนูเลือก) · `recoveringId` กันกดซ้ำระหว่างย้าย
   */
  const [recoveringId, setRecoveringId] = useState<number | null>(null);
  const [localStatuses, setLocalStatuses] = useState<IssueStatus[]>(statuses);
  const [columns, setColumns] = useState<Record<number, KanbanColumnState>>({});
  const [dragStartStatusId, setDragStartStatusId] = useState<number | null>(null);
  const [hoverStatusId, setHoverStatusId] = useState<number | null>(null);
  const dragTargetStatusId = useRef<number | null>(null);
  /** Last column the step-only rule refused during this drag (drop feedback). */
  const blockedTargetStatusId = useRef<number | null>(null);
  /** Which guard refused the last preview — step-only or the task-type gate. */
  const blockedReasonRef = useRef<"step" | "taskType" | null>(null);
  /**
   * The column the dragged card currently sits in *during the preview*.
   * `issueMap` is a render-time snapshot — a fast second `dragOver` reads the
   * original column out of it and would leave a copy of the card behind.
   */
  const previewSourceStatusId = useRef<number | null>(null);
  /** Drop writes run one at a time through this chain (see enqueueDrop). */
  const dropChainRef = useRef<Promise<void>>(Promise.resolve());
  const isDraggingRef = useRef(false);
  const requestSeqRef = useRef<Record<number, number>>({});

  const debouncedSearch = useDebouncedValue(searchQuery);

  /**
   * Columns the board renders — **"ยกเลิก" shows like any other column**
   * (always last — see the pin rule); a cancelled card lands there and the
   * board scrolls itself to it (`revealTarget`) so it never looks like
   * the card vanished. The status FILTER still narrows to the selected
   * statuses only — that is its meaning for every status alike.
   */
  const visibleStatuses = useMemo(
    () =>
      selectedStatusIds.length === 0
        ? localStatuses
        : localStatuses.filter((s) => selectedStatusIds.includes(s.id)),
    [localStatuses, selectedStatusIds],
  );

  /**
   * The board's entry column — `localStatuses` keeps the API's position order,
   * so index 0 is the first column. Customers may only delete cards there.
   */
  const firstStatusId = localStatuses[0]?.id ?? null;

  /**
   * สถานะปลายทางของ **"ยกเลิกงาน"** — หาด้วยชื่อ `REJECT_STATUS_NAME`
   * (จุดเดียวกับปุ่ม "ตีกลับงาน" ในป๊อปอัพ) · `null` = ยังไม่มีสถานะนี้ในระบบ
   * → เมนู "ยกเลิกงาน" ไม่ขึ้นเลย (ไม่มีทางกดแล้วเจอ error)
   */
  const cancelStatusId =
    localStatuses.find((s) => s.name === REJECT_STATUS_NAME)?.id ?? null;

  /**
   * **Reveal** — หลังย้ายสำเร็จ การ์ดกระโดดไปคอลัมน์ใหม่ (อาจอยู่นอกสายตา —
   * บอร์ดเลื่อนมาทางขวาตอนกด "ยกเลิก", หรือกลับไปคอลัมน์แรกตอนกด "ย้ายกลับ")
   * → เลื่อนคอลัมน์ปลายทางเข้าจอ + วาด outline การ์ด ~1.8 วิ — การ์ดต้องไม่
   * "หายจากบอร์ด" ทั้งสองทาง · ใช้ร่วมกัน: กดยกเลิก (`revealTarget(id,
   * cancelStatusId)`) และกดย้ายกลับ (`revealTarget(id, firstStatusId)`) ·
   * `onDone` ของ dialog รันหลัง `onClose()` แต่ก่อน re-render → issue ที่
   * capture ไว้ยังเป็นการ์ดที่เพิ่งย้ายอยู่
   */
  const [flashIssueId, setFlashIssueId] = useState<number | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTarget = useCallback(
    (issueId: number | null, statusId: number | null) => {
      requestAnimationFrame(() => {
        if (statusId == null) return;
        document
          .getElementById(`status-col-${statusId}`)
          ?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
      });
      if (issueId == null) return;
      setFlashIssueId(issueId);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashIssueId(null), 1800);
    },
    [],
  );
  useEffect(
    () => () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const loadColumn = useCallback(
    async (statusId: number, pageNum: number, append: boolean) => {
      const seq = (requestSeqRef.current[statusId] = (requestSeqRef.current[statusId] ?? 0) + 1);
      setColumns((prev) => ({
        ...prev,
        [statusId]: {
          ...(prev[statusId] ?? { items: [], page: 0, total: 0, loading: false }),
          loading: true,
        },
      }));
      try {
        const res = await fetchIssues(
          pageNum,
          20,
          [statusId],
          debouncedSearch,
          roleName === "programmer",
          {
            priorityIds: selectedPriorityIds,
            categoryIds: selectedCategoryIds,
            appIds: selectedAppIds,
            // the API resolves companies through the card's REPORTER
            // (issues.customer_id → users.company_id) — same rule the table
            // and folder apply in memory via `companyReporterIds`
            companyIds: selectedCompanyIds,
            assigneeIds: selectedAssigneeIds,
            reporterIds: selectedReporterIds,
            // the board hides stale cards AT THE API — column counts, pages
            // and search all drop them together (the table never sends this)
            hideStaleDone: true,
            // cards are ordered by "entered this column when" — newest first
            // (desc) or longest-sitting first (asc), per the toolbar toggle.
            // `cardOrder` is a dep below, so flipping it reloads every column
            // through the mount effect; KanbanColumn mirrors this direction.
            sort: { field: "statusChangedAt", dir: cardOrder },
          },
        );
        if (requestSeqRef.current[statusId] !== seq) return;
        setColumns((prev) => {
          const existing = prev[statusId] ?? { items: [], page: 0, total: 0, loading: false };
          const items = append ? [...existing.items, ...res.data] : res.data;
          return {
            ...prev,
            [statusId]: { items, page: res.page, total: res.total, loading: false },
          };
        });
      } catch (e) {
        if (requestSeqRef.current[statusId] !== seq) return;
        fail(getErrorMessage(e, "โหลดข้อมูลไม่สำเร็จ"));
        setColumns((prev) => {
          const existing = prev[statusId];
          if (!existing) return prev;
          return { ...prev, [statusId]: { ...existing, loading: false } };
        });
      }
    },
    [
      debouncedSearch,
      roleName,
      cardOrder,
      selectedPriorityIds,
      selectedCategoryIds,
      selectedAppIds,
      selectedCompanyIds,
      selectedAssigneeIds,
      selectedReporterIds,
      fail,
    ],
  );

  useEffect(() => {
    if (visibleStatuses.length === 0) return;
    void Promise.all(visibleStatuses.map((s) => loadColumn(s.id, 1, false)));
  }, [loadColumn, visibleStatuses]);

  const issueMap = useMemo(() => {
    const map = new Map<number, BoardIssue>();
    for (const col of Object.values(columns)) {
      for (const i of col.items) map.set(i.id, i);
    }
    return map;
  }, [columns]);

  const handleLoadMore = useCallback(
    (statusId: number) => {
      const col = columns[statusId];
      if (!col || col.loading || col.items.length >= col.total) return;
      void loadColumn(statusId, col.page + 1, true);
    },
    [columns, loadColumn],
  );

  const reloadColumns = useCallback(
    (ids?: number[]) => {
      const targets = ids ?? visibleStatuses.map((s) => s.id);
      void Promise.all(targets.map((id) => loadColumn(id, 1, false)));
    },
    [loadColumn, visibleStatuses],
  );

  /**
   * A drag that ended WITHOUT writing (released outside every column, a rule
   * refused it, ESC) must refresh BOTH columns the card could be showing in:
   * the preview pulled it out of its own column, and the target column still
   * holds the preview copy — which carries the "entered now" stamp, so it
   * would sit at the TOP of a column the card is not really in until that
   * column reloads for some unrelated reason.
   */
  const reloadDragColumns = useCallback(
    (...ids: (number | null)[]) => {
      const unique = [...new Set(ids.filter((id): id is number => id !== null))];
      if (unique.length > 0) reloadColumns(unique);
    },
    [reloadColumns],
  );

  useEffect(() => {
    setLocalStatuses(statuses);
  }, [statuses]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * Adjacent = the column directly before or after in `localStatuses` — the
   * same `position` order the API serves and the backend guard checks. An
   * unmeasurable pair (no source status yet, unknown ids) is allowed here;
   * `IssuesService.move()` is the authority and its 400 is handled on drop.
   */
  const isAdjacentStatus = (fromStatusId: number | null, toStatusId: number): boolean => {
    if (fromStatusId === null || fromStatusId === toStatusId) return true;
    const from = localStatuses.findIndex((s) => s.id === fromStatusId);
    const to = localStatuses.findIndex((s) => s.id === toStatusId);
    if (from === -1 || to === -1) return true;
    return Math.abs(from - to) === 1;
  };

  /**
   * Serializes drop writes: a drop is `moveIssue` + its column reload as one
   * job, so a drop fired while the previous one is still settling waits its
   * turn instead of interleaving writes and reloads — exactly what fast
   * dragging produces (cards resyncing out of order, stale targets).
   */
  const enqueueDrop = (job: () => Promise<void>): Promise<void> => {
    const run = dropChainRef.current.then(job, job);
    // the chain must never stay rejected or later jobs would never run
    dropChainRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    isDraggingRef.current = true;
    dragTargetStatusId.current = null;
    blockedTargetStatusId.current = null;
    if (active.data.current?.type === "status") {
      const statusId = Number(String(active.id).replace("status-", ""));
      const status = localStatuses.find((s) => s.id === statusId);
      setActiveStatus(status ?? null);
      setActiveIssue(null);
      setDragStartStatusId(null);
      return;
    }
    const issueId = Number(String(active.id).replace("issue-", ""));
    const issue = issueMap.get(issueId);
    if (issue) {
      setActiveIssue(issue);
      setDragStartStatusId(issue.statusId);
      previewSourceStatusId.current = issue.statusId;
      return;
    }
    // the card isn't on screen (a reload is mid-flight) — start from a clean
    // drag state instead of inheriting whatever the last drag left behind
    setActiveIssue(null);
    setDragStartStatusId(null);
    previewSourceStatusId.current = null;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    if (!over || active.data.current?.type === "status") {
      setHoverStatusId(null);
      return;
    }

    const activeId = Number(String(active.id).replace("issue-", ""));
    const overId = String(over.id);

    const activeIssue = issueMap.get(activeId);
    if (!activeIssue) {
      setHoverStatusId(null);
      return;
    }

    const overIssue = overId.startsWith("issue-") ? issueMap.get(Number(overId.replace("issue-", ""))) : undefined;
    const overDataType = over.data.current?.type;
    let targetStatusId: number | null = null;
    if (overIssue) {
      targetStatusId = overIssue.statusId;
    } else if (overDataType === "status-drop") {
      targetStatusId = (over.data.current as { statusId?: number })?.statusId ?? null;
    } else if (overId.startsWith("status-drop-")) {
      const dropStatusId = Number(overId.replace("status-drop-", ""));
      if (localStatuses.some((s) => s.id === dropStatusId)) {
        targetStatusId = dropStatusId;
      }
    } else if (overId.startsWith("status-")) {
      const overStatusId = Number(overId.replace("status-", ""));
      if (localStatuses.some((s) => s.id === overStatusId)) {
        targetStatusId = overStatusId;
      }
    }

    if (!targetStatusId) {
      return;
    }
    // Where the card sits *right now*: `issueMap` is a render-time snapshot,
    // so two fast `dragOver`s would both read the original column out of it.
    const sourceStatusId = previewSourceStatusId.current ?? activeIssue.statusId;
    if (sourceStatusId === targetStatusId) {
      return;
    }

    /**
     * ปลายทาง = สถานะ "ยกเลิก" → **ข้ามทั้งสองเช็คด้านล่าง** — parity กับ
     * `IssuesService.move()` (`isRejectMove` ข้าม move guards ทั้ง 3): "การ
     * ตีกลับ" ต้องเข้าคอลัมน์นี้ได้จากทุกคอลัมน์ (คอลัมน์นี้อยู่ท้ายสุดเสมอ
     * จึงไม่เคยติดกับใครเมื่อมีหลายคอลัมน์) และเคสหลักคือการ์ดยังไม่ระบุ
     * ประเภทใน "รอรับเรื่อง" — ไม่งั้น preview จะปฏิเสธทั้งที่ API จะรับ
     * · คอลัมน์ "ยกเลิก" ถูกซ่อนจากบอร์ดตามปกติ (ดู `visibleStatuses`) จึง
     * เจอเช็คนี้ก็ต่อเมื่อฟิลเตอร์สถานะ reveal มันออกมา
     */
    const isCancelTarget = targetStatusId === cancelStatusId;

    // "one column at a time": a jump-over column gets no preview — the card
    // stays put and handleDragEnd explains it on release
    if (!isCancelTarget && stepOnlyMoves && !isAdjacentStatus(sourceStatusId, targetStatusId)) {
      blockedTargetStatusId.current = targetStatusId;
      blockedReasonRef.current = "step";
      dragTargetStatusId.current = null;
      setHoverStatusId(null);
      return;
    }
    // "ประเภทงานก่อนลาก": the card sits in a gated status with no task type —
    // same snap-back as the step-only refusal, its own message on release
    if (
      !isCancelTarget &&
      sourceStatusId != null &&
      taskTypeGateIds.includes(sourceStatusId) &&
      !activeIssue.taskType
    ) {
      blockedTargetStatusId.current = targetStatusId;
      blockedReasonRef.current = "taskType";
      dragTargetStatusId.current = null;
      setHoverStatusId(null);
      return;
    }
    blockedTargetStatusId.current = null;
    blockedReasonRef.current = null;
    dragTargetStatusId.current = targetStatusId;
    previewSourceStatusId.current = targetStatusId;
    setHoverStatusId(targetStatusId);
    setColumns((prev) => {
      // Pull the card out of *every* column before inserting it: a stale
      // source would leave a copy behind, and two copies render two components
      // sharing one `issue-<id>` sortable id. The freshest card object wins.
      let moved: BoardIssue | null = null;
      const next: Record<number, KanbanColumnState> = {};
      for (const [key, col] of Object.entries(prev)) {
        const statusId = Number(key);
        const hit = col.items.find((i) => i.id === activeId);
        if (hit) moved = hit;
        next[statusId] = hit
          ? { ...col, items: col.items.filter((i) => i.id !== activeId) }
          : col;
      }
      const target = next[targetStatusId] ?? { items: [], page: 1, total: 0, loading: false };
      next[targetStatusId] = {
        ...target,
        items: target.items.some((i) => i.id === activeId)
          ? target.items
          : // Stamp "entered this column now" on the preview copy: the columns
            // are sorted by `statusChangedAt`, so without it the card would
            // hover at its OLD spot in the target column. Where "now" lands
            // follows the toolbar toggle — on TOP in desc (default), at the
            // BOTTOM in asc — which is exactly where the real stamp will put
            // it after release, so nothing jumps. Purely local: every path in
            // handleDragEnd reloads both the source and this column
            // (reloadDragColumns), so `move()`'s `now()` replaces it, and a
            // refused or abandoned drag cannot leave this copy behind.
            [
              ...target.items,
              {
                ...(moved ?? activeIssue),
                statusId: targetStatusId,
                statusChangedAt: new Date().toISOString(),
              },
            ],
      };
      return next;
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    // where the card renders RIGHT NOW — the preview may already have moved it
    // into another column, and every path below that does not write must put
    // it back there too (see reloadDragColumns)
    const previewedStatusId = previewSourceStatusId.current;
    setActiveIssue(null);
    setActiveStatus(null);
    setHoverStatusId(null);
    isDraggingRef.current = false;
    previewSourceStatusId.current = null;

    if (!over) {
      blockedTargetStatusId.current = null;
      reloadDragColumns(dragStartStatusId, previewedStatusId);
      setDragStartStatusId(null);
      return;
    }

    const activeType = active.data.current?.type;

    if (activeType === "status") {
      const activeStatusId = Number(String(active.id).replace("status-", ""));
      const overStatusId = Number(String(over.id).replace("status-", ""));
      if (activeStatusId === overStatusId) return;

      const activeStatus = localStatuses.find((s) => s.id === activeStatusId);
      if (!activeStatus) return;

      // คอลัมน์ "ยกเลิก" ลากไม่ได้ — ถูกล็อกไว้ท้ายสุดเสมอ (server ยัง pin ให้
      // อีกชั้นใน `PATCH /issue-statuses/reorder` → `pinRejectLast`)
      if (activeStatus.name === REJECT_STATUS_NAME) return;

      const oldIndex = localStatuses.findIndex((s) => s.id === activeStatusId);
      const newIndex = localStatuses.findIndex((s) => s.id === overStatusId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(localStatuses, oldIndex, newIndex);
      // กันไว้อีกชั้น: ลากคอลัมน์อื่นไป "ทับ" ตำแหน่งของ "ยกเลิก" ก็ตาม
      // ดันกลับท้ายสุดก่อนบันทึก (payload จึงไม่มีทางเอา "ยกเลิก" ไปไว้กลาง list)
      const rejectAt = reordered.findIndex(
        (s, i) => i !== reordered.length - 1 && s.name === REJECT_STATUS_NAME,
      );
      if (rejectAt !== -1) {
        const [rejectCol] = reordered.splice(rejectAt, 1);
        reordered.push(rejectCol);
      }
      setLocalStatuses(reordered);
      try {
        await reorderStatuses(
          reordered.map((s, idx) => ({ id: s.id, sortOrder: idx + 1 }))
        );
      } catch (e) {
        fail(getErrorMessage(e, "เกิดข้อผิดพลาด"));
        onRefresh();
      }
      return;
    }

    const issueId = Number(String(active.id).replace("issue-", ""));

    const issue = issueMap.get(issueId);
    if (!issue || issue.isLocked) {
      reloadDragColumns(dragStartStatusId, previewedStatusId);
      setDragStartStatusId(null);
      return;
    }

    const sourceStatusId = dragStartStatusId;
    const targetStatusId = dragTargetStatusId.current;
    dragTargetStatusId.current = null;

    if (targetStatusId === null) {
      const blockedId = blockedTargetStatusId.current;
      const blockedReason = blockedReasonRef.current;
      blockedTargetStatusId.current = null;
      blockedReasonRef.current = null;
      if (blockedId !== null) {
        // released over a column the rules refuse — say which guard did it
        // (rule refusals are a policy nudge, not a system error → warning toast)
        notify(
          blockedReason === "taskType" ? t("taskTypeRequired") : t("invalidTransition"),
          "warning",
        );
      }
      reloadDragColumns(sourceStatusId, previewedStatusId);
      setDragStartStatusId(null);
      return;
    }
    if (sourceStatusId !== null && targetStatusId === sourceStatusId) {
      setDragStartStatusId(null);
      reloadColumns([sourceStatusId]);
      return;
    }

    try {
      await enqueueDrop(async () => {
        await moveIssue(issueId, targetStatusId);
        // the rules may have started/stopped/reset a timer on this drag
        timers.refresh();
        reloadColumns(sourceStatusId !== null ? [sourceStatusId, targetStatusId] : [targetStatusId]);
      });
    } catch (e) {
      // 409 = the server's status lock refused the drag (client state was
      // stale — a locked card's handle is disabled, so this is the backstop);
      // 400 = the step-only guard rejected the jump; 422 = the card still has
      // no ประเภทงาน (both guards' policy lookups can fail open, so a refusal
      // may slip through the preview to the API). Rule refusals → warning
      // toast, anything else → the error toast.
      const refusal = isApiError(e, 422)
        ? t("taskTypeRequired")
        : isApiError(e, 409)
          ? t("lockedCard")
          : isApiError(e, 400)
            ? t("invalidTransition")
            : null;
      if (refusal) notify(refusal, "warning");
      else fail(getErrorMessage(e, "เกิดข้อผิดพลาด"));
      // the write was refused: the card is still where it started, so the
      // preview copy in the target column has to go (onRefresh reloads the
      // table/folder sources, not the per-column state)
      reloadDragColumns(dragStartStatusId, previewedStatusId);
      onRefresh();
    } finally {
      setDragStartStatusId(null);
    }
  };

  const handleDragCancel = () => {
    setActiveIssue(null);
    setActiveStatus(null);
    // ESC mid-drag: same two columns as a refused drop (the preview copy must
    // not stay behind in the column it hovered into)
    reloadDragColumns(dragStartStatusId, previewSourceStatusId.current);
    setDragStartStatusId(null);
    setHoverStatusId(null);
    isDraggingRef.current = false;
    dragTargetStatusId.current = null;
    blockedTargetStatusId.current = null;
    blockedReasonRef.current = null;
    previewSourceStatusId.current = null;
  };

  const handleSaveIssue = async (data: { title: string; description: string; statusId: number; labelId?: number | null; priorityId?: number | null }) => {
    try {
      if (editIssue) {
        await updateIssue(editIssue.id, { title: data.title, description: data.description, labelId: data.labelId ?? undefined, priorityId: data.priorityId ?? null });
      } else {
        await createIssue({ ...data, priorityId: data.priorityId ?? undefined });
      }
      setEditIssue(null);
      reloadColumns();
    } catch (e) {
      fail(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleDeleteIssue = async () => {
    if (!issueToDelete) return;
    try {
      await deleteIssue(issueToDelete.id);
      setIssueToDelete(null);
      setDetailIssue(null);
      reloadColumns();
    } catch (e) {
      fail(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleAddColumn = async (name: string, description: string) => {
    try {
      await createStatus(name, description);
      setAddColumnOpen(false);
      onRefresh();
    } catch (e) {
      fail(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleUnlockIssue = async (issueId: number) => {
    try {
      await unlockIssue(issueId);
      reloadColumns();
    } catch (e) {
      fail(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  /**
   * **ย้ายกลับ** — กดปุ่มบนการ์ดครั้งเดียว = ย้ายออกจาก "ยกเลิก" ไป**สถานะ
   * แรก** (`firstStatusId` = `localStatuses[0]` ตามลำดับ position = รอรับเรื่อง)
   * ทันที ไม่มีเมนูเลือก · comment / `resolution` ที่ฝังตอนตีกลับเก็บเป็น
   * ประวัติ, activity + notification มาจาก `move()` เดิม · `reloadColumns()` +
   * `revealTarget` — คอลัมน์แรกอาจอยู่นอกสายตา (บอร์ดเลื่อนมาทางขวาตอนอยู่
   * ใน "ยกเลิก") → เลื่อนไปหา + ไฮไลท์การ์ด ~1.8 วิ เหมือนตอนกดยกเลิก ·
   * 400 = ตาข่าย "ลากทีละคอลัมน์" ถูกเปิดทีหลัง (62→1 ไม่ติดกัน) → ข้อความ
   * ไทยเดียวกับตอนลากถูกกัน, ไม่ใช่ข้อความอังกฤษดิบ
   */
  const handleRecover = async (issue: BoardIssue) => {
    if (recoveringId != null || firstStatusId == null) return;
    setRecoveringId(issue.id);
    try {
      await moveIssue(issue.id, firstStatusId);
      notify(t("detail.recoverSuccess", { status: localStatuses[0]?.name ?? "" }), "success");
      reloadColumns();
      revealTarget(issue.id, firstStatusId);
    } catch (e) {
      const refusal = isApiError(e, 400) ? t("invalidTransition") : null;
      if (refusal) notify(refusal, "warning");
      else fail(getErrorMessage(e, t("detail.recoverFailed")));
    } finally {
      setRecoveringId(null);
    }
  };

  return (
    <Box sx={{ width: "100%", minWidth: 0 }}>
      <Box
        component="nav"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1200,
          bgcolor: "background.default",
          pb: 1,
          mb: 3,
          borderBottom: "1px solid",
          borderColor: "divider",
          width: "100%",
        }}
      >
        {toolbar}
      </Box>
      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 2, width: "100%", minWidth: 0, minHeight: 0 }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={visibleStatuses.map((s) => `status-${s.id}`)} strategy={horizontalListSortingStrategy}>
            {visibleStatuses.map((status) => (
              <KanbanColumn
                key={status.id}
                status={status}
                items={columns[status.id]?.items ?? []}
                total={columns[status.id]?.total ?? 0}
                hasMore={(columns[status.id]?.items.length ?? 0) < (columns[status.id]?.total ?? 0)}
                loading={columns[status.id]?.loading ?? false}
                onLoadMore={handleLoadMore}
                canManage={canManage}
                canEdit={canEdit}
                canDelete={canDelete}
                canUnlockIssue={canUnlockIssue}
                isDropTarget={hoverStatusId === status.id && !!activeIssue}
                isFirstColumn={status.id === firstStatusId}
                roleName={roleName}
                timers={timers}
                showTime={showTime}
                staleRules={staleRules}
                order={cardOrder}
                onOpenIssue={(issue) => { setDetailIssue(issue); setDetailTab("comments"); }}
                onEditIssue={(issue) => { setDetailIssue(issue); setDetailTab("comments"); }}
                onDeleteIssue={(issue) => { setDetailIssue(null); setIssueToDelete(issue); }}
                onCancelIssue={(issue) => { setDetailIssue(null); setIssueToCancel(issue); }}
                cancelStatusId={cancelStatusId}
                // ปุ่ม "ย้ายกลับ" ซ่อนเมื่อไม่มีสถานะแรก หรือสถานะแรกดันเป็น
                // "ยกเลิก" เอง (ไม่มีที่ให้ย้าย = กดแล้วไม่เกิดอะไร)
                onRecoverIssue={
                  firstStatusId != null && firstStatusId !== cancelStatusId
                    ? handleRecover
                    : undefined
                }
                flashIssueId={flashIssueId}
                onViewActivity={(issue) => { setDetailIssue(issue); setDetailTab("history"); }}
                onUnlockIssue={handleUnlockIssue}
              />
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={dropAnimation}>
            {activeIssue ? (
              <Box
                sx={{
                  width: 248,
                  p: 1.5,
                  bgcolor: "background.paper",
                  borderRadius: 1.5,
                  boxShadow: (theme) => theme.custom.cardShadow,
                  border: "2px solid",
                  borderColor: "primary.main",
                }}
              >
                <TrelloCardContent
                  issue={activeIssue}
                  runningSince={timers.running[activeIssue.id] ?? null}
                  nowMs={timers.now}
                  showTime={showTime}
                  staleDays={staleDaysFor(activeIssue, staleRules)}
                />
              </Box>
            ) : activeStatus ? (
              <Box
                sx={{
                  width: 200,
                  minWidth: 200,
                  bgcolor: "grey.50",
                  borderRadius: 2,
                  p: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  opacity: 0.8,
                }}
              >
                <Typography variant="subtitle2" fontWeight={700}>
                  {activeStatus?.customName ?? activeStatus?.name}
                </Typography>
              </Box>
            ) : null}
          </DragOverlay>
        </DndContext>
        {canManage && (
          <Box>
            {addColumnOpen ? (
              <AddColumnInline
                onAdd={handleAddColumn}
                onCancel={() => setAddColumnOpen(false)}
              />
            ) : (
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setAddColumnOpen(true)}
                sx={{ minWidth: 200, borderRadius: 2, border: "1px dashed", borderColor: "divider" }}
              >
                เพิ่มคอลัมน์
              </Button>
            )}
          </Box>
        )}
      </Box>

      <IssueDetailDialog
        issue={detailIssue}
        open={!!detailIssue}
        onClose={() => setDetailIssue(null)}
        initialTab={detailTab}
        statuses={localStatuses}
        labels={labels}
        onRefresh={onRefresh}
      />
      <IssueDialog
        issue={editIssue}
        statusId={null}
        open={!!editIssue}
        onClose={() => {
          setEditIssue(null);
        }}
        onSave={handleSaveIssue}
        labels={labels}
        priorities={priorities}
      />
      <Dialog open={!!issueToDelete} onClose={() => setIssueToDelete(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>
            {t("deleteIssueConfirmTrash", { title: issueToDelete?.title ?? "" })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueToDelete(null)}>{t("cancel")}</Button>
          <Button onClick={handleDeleteIssue} color="error">
            {t("delete")}
          </Button>
        </DialogActions>
      </Dialog>
      {/* "ยกเลิกงาน" — ย้ายไปสถานะ "ยกเลิก"; `reloadColumns()` ดึงทุกคอลัมน์ใหม่
          ทั้งคอลัมน์ต้นทาง (การ์ดหายไป) และคอลัมน์ปลายทาง (การ์ดโผล่) แล้ว
          `revealTarget` เลื่อนบอร์ดไปคอลัมน์ปลายทาง + ไฮไลท์การ์ด ~1.8 วิ
          — อ่าน `issueToCancel` จาก closure ของ render ที่ dialog เปิดอยู่
          (onDone ถูกเรียกหลัง `onClose()` แต่ก่อน re-render จึงยังเป็นการ์ดเดิม) */}
      <CancelIssueDialog
        issue={issueToCancel}
        statusId={cancelStatusId}
        onClose={() => setIssueToCancel(null)}
        onDone={() => {
          reloadColumns();
          revealTarget(issueToCancel?.id ?? null, cancelStatusId);
        }}
      />
    </Box>
  );
}

function TableView({
  statuses,
  issues,
  labels,
  priorities,
  categories,
  selectedStatusIds,
  selectedPriorityIds,
  selectedCategoryIds,
  selectedAppIds,
  companyReporterIds,
  selectedAssigneeIds,
  selectedReporterIds,
  searchQuery,
  canManage,
  canEdit,
  canSeeReporter,
  canViewOwnHistory,
  timers,
  canSeeTrackedTime,
  canSeeActualTime,
  currentUserId,
  onRefresh,
  cardOrder,
  toolbar,
}: {
  statuses: IssueStatus[];
  issues: BoardIssue[];
  labels: Label[];
  priorities: IssuePriority[];
  categories: Category[];
  selectedStatusIds: number[];
  selectedPriorityIds: number[];
  selectedCategoryIds: number[];
  selectedAppIds: number[];
  /**
   * Company filter resolved to **reporter ids**: `null` = no company selected
   * (no constraint), `[]` = a selected company with no members (must match
   * nothing — an empty array on its own would read as "no filter").
   */
  companyReporterIds: string[] | null;
  selectedAssigneeIds: string[];
  selectedReporterIds: string[];
  searchQuery: string;
  canManage: boolean;
  /** `issue.all.update` — gates the "ยกเลิกงาน" row (same as the board card's). */
  canEdit: boolean;
  canSeeReporter: boolean;
  canViewOwnHistory: boolean;
  timers: BoardTimers;
  canSeeTrackedTime: boolean;
  canSeeActualTime: boolean;
  currentUserId: string | null;
  onRefresh: () => void;
  /**
   * Shared ↑↓ toggle (the toolbar button) — `desc` = newest status change on
   * top, `asc` = longest-sitting on top, same comparator as the Kanban
   * columns (`sortByEnteredAt`).
   */
  cardOrder: "desc" | "asc";
  toolbar?: React.ReactNode;
}) {
  const t = useTranslations("Boards");
  const theme = useTheme();
  const { notify } = useNotification();
  const fail = useCallback(
    (msg: string | null) => {
      if (msg) notify(msg, "error");
    },
    [notify],
  );
  const [detailIssue, setDetailIssue] = useState<BoardIssue | null>(null);
  const [editIssue, setEditIssue] = useState<BoardIssue | null>(null);
  const [detailTab, setDetailTab] = useState<"comments" | "history">("comments");
  const [issueToDelete, setIssueToDelete] = useState<BoardIssue | null>(null);
  /** การ์ดที่กด "ยกเลิกงาน" ในเมนูแถว — รอ confirm ก่อนย้ายไปสถานะ "ยกเลิก" */
  const [issueToCancel, setIssueToCancel] = useState<BoardIssue | null>(null);
  const [actionAnchor, setActionAnchor] = useState<{
    el: HTMLElement;
    issue: BoardIssue;
  } | null>(null);
  /**
   * **"ย้ายกลับ" ในเมนูแถว** — กดครั้งเดียว = ย้ายไป**สถานะแรก** ทันที (ไม่มี
   * เมนูเลือก) · `recoveringId` กันกดซ้ำระหว่างย้าย · mirror ของ `handleRecover`
   * ใน `KanbanView`
   */
  const [recoveringId, setRecoveringId] = useState<number | null>(null);
  /**
   * สถานะปลายทางของ **"ยกเลิกงาน"** — หาด้วยชื่อ `REJECT_STATUS_NAME` (จุดเดียว
   * กับปุ่ม "ตีกลับงาน") · `null` = ไม่มีสถานะนี้ในระบบ → เมนูไม่ขึ้น
   */
  const cancelStatusId = statuses.find((s) => s.name === REJECT_STATUS_NAME)?.id ?? null;
  const [page, setPage] = useState(1);
  const hasActiveFilters =
    selectedStatusIds.length > 0 ||
    selectedPriorityIds.length > 0 ||
    selectedCategoryIds.length > 0 ||
    selectedAppIds.length > 0 ||
    companyReporterIds !== null ||
    selectedAssigneeIds.length > 0 ||
    selectedReporterIds.length > 0 ||
    searchQuery.trim() !== "";
  const filteredIssues = useMemo(() => {
    if (!hasActiveFilters) return issues;
    const query = searchQuery.trim().toLowerCase();
    return issues.filter((issue) => {
      if (selectedStatusIds.length > 0) {
        if (issue.statusId === null || !selectedStatusIds.includes(issue.statusId)) return false;
      }
      if (selectedPriorityIds.length > 0 && !selectedPriorityIds.includes(issue.priorityId ?? -1)) return false;
      if (selectedCategoryIds.length > 0) {
        const selectedCatNames = categories.filter((c) => selectedCategoryIds.includes(c.id)).map((c) => c.name);
        const matchCat = selectedCategoryIds.includes(issue.categoryId ?? -1);
        const matchCustom = issue.customCategory != null && selectedCatNames.includes(issue.customCategory);
        if (!matchCat && !matchCustom) return false;
      }
      if (selectedAppIds.length > 0 && !selectedAppIds.includes(issue.appId ?? -1)) return false;
      // company → the card's REPORTER must belong to one of the selected ones
      // (no reporter → "-1" never matches → hidden, same rule as the API)
      if (companyReporterIds !== null && !companyReporterIds.includes(String(issue.customerId ?? -1))) return false;
      if (selectedAssigneeIds.length > 0) {
        if (!issue.programmerId || !selectedAssigneeIds.includes(String(issue.programmerId))) return false;
      }
      if (selectedReporterIds.length > 0) {
        if (!issue.customerId || !selectedReporterIds.includes(String(issue.customerId))) return false;
      }
      if (query) {
        const matchTitle = issue.title.toLowerCase().includes(query);
        const matchLabel = (issue.labels ?? []).some((l) => l.name.toLowerCase().includes(query));
        if (!matchTitle && !matchLabel) return false;
      }
      return true;
    });
  }, [issues, statuses, categories, selectedStatusIds, selectedPriorityIds, selectedCategoryIds, selectedAppIds, companyReporterIds, selectedAssigneeIds, selectedReporterIds, searchQuery, hasActiveFilters]);
  /**
   * Row order — the SAME comparator as the Kanban columns (`sortByEnteredAt`),
   * so the table reads in the same order the board's columns do. Purely
   * client-side: the list is already loaded (the API's default `createdAt`
   * order just gets re-sorted), so flipping it costs no request.
   */
  const orderedIssues = useMemo(
    () => sortByEnteredAt(filteredIssues, cardOrder),
    [filteredIssues, cardOrder],
  );
  const pageIssues = orderedIssues.slice((page - 1) * 10, page * 10);
  // Flipping the order must not strand the reader on page 5 of a
  // differently-ordered list.
  useEffect(() => {
    setPage(1);
  }, [cardOrder]);

  const handleSaveIssue = async (data: { title: string; description: string; statusId: number; labelId?: number | null }) => {
    try {
      if (editIssue) {
        await createIssue({ ...data, statusId: editIssue.statusId ?? data.statusId });
      } else {
        await createIssue(data);
      }
      setEditIssue(null);
      onRefresh();
    } catch (e) {
      fail(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleDeleteIssue = async () => {
    if (!issueToDelete) return;
    try {
      await deleteIssue(issueToDelete.id);
      setIssueToDelete(null);
      setDetailIssue(null);
      onRefresh();
    } catch (e) {
      fail(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  /**
   * **ย้ายกลับจากเมนูแถว** — กดครั้งเดียว = ย้ายออกจาก "ยกเลิก" ไป**สถานะ
   * แรก** (`statuses[0]` ตามลำดับ position = รอรับเรื่อง) ทันที · mirror ของ
   * `handleRecover` ใน `KanbanView` (comment/`resolution` ที่ฝังตอนตีกลับเก็บ
   * เป็นประวัติ, activity + notification มาจาก `move()` เดิม) · 400 = ตาข่าย
   * "ลากทีละคอลัมน์" ถูกเปิดทีหลัง → ข้อความไทยเดียวกับตอนลากถูกกัน
   */
  const handleRecover = async (issue: BoardIssue) => {
    const target = statuses[0];
    if (recoveringId != null || !target || target.id === cancelStatusId) return;
    setRecoveringId(issue.id);
    try {
      await moveIssue(issue.id, target.id);
      notify(t("detail.recoverSuccess", { status: target.name }), "success");
      onRefresh();
    } catch (e) {
      const refusal = isApiError(e, 400) ? t("invalidTransition") : null;
      if (refusal) notify(refusal, "warning");
      else fail(getErrorMessage(e, t("detail.recoverFailed")));
    } finally {
      setRecoveringId(null);
    }
  };

  const getStatusName = (statusId: number | null): string => {
    if (!statusId) return "—";
    const s = statuses.find((st) => st.id === statusId);
    return s ? (s.customName ?? s.name) : "—";
  };

  /** Color by id, straight from `issue_statuses.color` — not the status name. */
  const getStatusColorById = (statusId: number | null): string => {
    const s = statusId ? statuses.find((st) => st.id === statusId) : null;
    return resolveStatusColor(theme, s?.color, s?.name);
  };

  const canViewHistory = (issue: BoardIssue) =>
    canManage ||
    (canViewOwnHistory &&
      issue.customerId != null &&
      String(issue.customerId) === currentUserId);

  return (
    <Box>
      {toolbar && (
        <Box
          component="nav"
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 1200,
            bgcolor: "background.default",
            pb: 1,
            mb: 3,
            minWidth: 0,
            borderBottom: "1px solid",
            borderColor: "divider",
            width: "100%",
          }}
        >
          {toolbar}
        </Box>
      )}
      <DataTable>
        <DataTableHead>
          <DataTableRow>
            <DataTableCell>ID</DataTableCell>
            <DataTableCell>หัวข้อ</DataTableCell>
            <DataTableCell sx={{ display: { xs: "none", xl: "table-cell" } }}>แอป</DataTableCell>
            <DataTableCell sx={{ display: { xs: "none", xl: "table-cell" } }}>หมวดหมู่</DataTableCell>
            <DataTableCell sx={{ display: { xs: "none", xl: "table-cell" } }}>ความสำคัญ</DataTableCell>
            <DataTableCell>สถานะ</DataTableCell>
            <DataTableCell>ผู้รับผิดชอบ</DataTableCell>
            {canSeeReporter && (
              <DataTableCell sx={{ display: { xs: "none", xl: "table-cell" } }}>ผู้แจ้ง</DataTableCell>
            )}
            <DataTableCell>สร้างเมื่อ</DataTableCell>
            {canSeeTrackedTime && <DataTableCell>เวลาที่จับได้</DataTableCell>}
            {canSeeActualTime && <DataTableCell>เวลาแก้ไขจริง</DataTableCell>}
            {(canManage || canViewOwnHistory) && (
              <DataTableCell align="right" sx={{ width: "1%", whiteSpace: "nowrap" }}>
                จัดการ
              </DataTableCell>
            )}
          </DataTableRow>
        </DataTableHead>
            <DataTableBody>
              {pageIssues.map((issue) => (
                <DataTableRow
                  key={issue.id}
                  onClick={() => { setDetailIssue(issue); setDetailTab("comments"); }}
                  sx={{ cursor: "pointer" }}
                >
                  <DataTableCell>
                    <Typography variant="caption" color="common.black" fontWeight={700}>{issue.issueNumber}</Typography>
                  </DataTableCell>
                  <DataTableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {issue.title}
                    </Typography>
                  </DataTableCell>
                  <DataTableCell sx={{ display: { xs: "none", xl: "table-cell" } }}>
                    {issue.appName ?? "—"}
                  </DataTableCell>
                  <DataTableCell sx={{ display: { xs: "none", xl: "table-cell" } }}>{getCategoryLabel(issue)}</DataTableCell>
                  <DataTableCell sx={{ display: { xs: "none", xl: "table-cell" } }}>
                    {issue.priorityName ? (
                      <Chip
                        label={priorityLabel(t, issue.priorityName)}
                        size="small"
                        variant="outlined"
                        color={PRIORITY_COLORS[issue.priorityName.toLowerCase()] ?? "default"}
                        sx={{ fontSize: "0.7rem", fontWeight: 600 }}
                      />
                    ) : "—"}
                  </DataTableCell>
                  <DataTableCell>
                    <Chip
                      label={getStatusName(issue.statusId)}
                      size="small"
                      sx={{
                        ...statusChipSx(getStatusColorById(issue.statusId)),
                        fontWeight: 600,
                        fontSize: "0.7rem",
                      }}
                    />
                  </DataTableCell>
                  <DataTableCell>{issue.programmerName ?? "รอมอบหมาย"}</DataTableCell>
                  {canSeeReporter && (
                    <DataTableCell sx={{ display: { xs: "none", xl: "table-cell" } }}>{issue.customerName ?? "—"}</DataTableCell>
                  )}
                  <DataTableCell>
                    {new Date(issue.createdAt).toLocaleDateString("th-TH")}
                  </DataTableCell>
                  {canSeeTrackedTime && (
                    <DataTableCell>
                      <TrackedTimeCell issue={issue} timers={timers} />
                    </DataTableCell>
                  )}
                  {canSeeActualTime && (
                    <DataTableCell>
                      <ActualTimeCell issue={issue} />
                    </DataTableCell>
                  )}
                  {(canManage || canViewOwnHistory) && (
                    <DataTableCell align="right" sx={{ width: "1%", whiteSpace: "nowrap" }}>
                      <IconButton
                        size="small"
                        aria-label={t("actions")}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionAnchor({ el: e.currentTarget, issue });
                        }}
                      >
                        <MoreHorizIcon fontSize="small" />
                      </IconButton>
                      <Menu
                        anchorEl={actionAnchor?.el}
                        open={Boolean(actionAnchor)}
                        onClose={() => setActionAnchor(null)}
                        // portal event bubble — เหมือนเมนู "…" ของการ์ดบอร์ด:
                        // คลิกเมนูต้องไม่ฟองขึ้นไปเรียก `onClick` ของ `<DataTableRow>`
                        // ที่ครอบไว้ (มันเปิด `detailIssue` กลับมาทับค่า `null`
                        // ที่ "ยกเลิกงาน" / "ลบ" เพิ่งสั่ง → รายละเอียดค้างหลังกล่องยืนยัน)
                        onClick={(e) => e.stopPropagation()}
                        elevation={0}
                        PaperProps={{
                          sx: {
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1.5,
                            overflow: "hidden",
                          },
                        }}
                      >
                        {canManage && (
                          <MenuItem
                            onClick={() => {
                              const selected = actionAnchor?.issue;
                              setActionAnchor(null);
                              if (selected) {
                                setDetailIssue(selected);
                                setDetailTab("comments");
                              }
                            }}
                          >
                            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                            <ListItemText>{t("edit")}</ListItemText>
                          </MenuItem>
                        )}
                        {actionAnchor && canViewHistory(actionAnchor.issue) && (
                          <MenuItem
                            onClick={() => {
                              const selected = actionAnchor?.issue;
                              setActionAnchor(null);
                              if (selected) {
                                setDetailIssue(selected);
                                setDetailTab("history");
                              }
                            }}
                          >
                            <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
                            <ListItemText>{t("history")}</ListItemText>
                          </MenuItem>
                        )}
                        {/* "ยกเลิกงาน" — ย้ายไปสถานะ "ยกเลิก" (คนละความหมายกับ
                            "ลบ" ที่ส่งไปถังขยะ) · ซ่อนเมื่อไม่มีสิทธิ์แก้ /
                            ไม่มีสถานะปลายทาง / การ์ดอยู่ในนั้นแล้ว */}
                        {canEdit &&
                          cancelStatusId != null &&
                          actionAnchor &&
                          actionAnchor.issue.statusId !== cancelStatusId && (
                            <MenuItem
                              onClick={() => {
                                const selected = actionAnchor?.issue;
                                setActionAnchor(null);
                                if (selected) {
                                  setDetailIssue(null);
                                  setIssueToCancel(selected);
                                }
                              }}
                            >
                              <ListItemIcon><CancelIcon fontSize="small" color="error" /></ListItemIcon>
                              <ListItemText sx={{ color: "error.main" }}>{t("cancelIssue")}</ListItemText>
                            </MenuItem>
                          )}
                        {/* "ย้ายกลับ" — กลับด้านกับ "ยกเลิกงาน": ขึ้นเฉพาะแถวที่อยู่
                            ในสถานะ "ยกเลิก" แล้ว · กดครั้งเดียว = ย้ายไปสถานะแรก
                            ทันที (mirror ปุ่มบนหน้าการ์ด) · ซ่อนเมื่อสถานะแรกเป็น
                            "ยกเลิก" เอง (ไม่มีที่ให้ย้าย) */}
                        {canEdit &&
                          cancelStatusId != null &&
                          actionAnchor &&
                          actionAnchor.issue.statusId === cancelStatusId &&
                          statuses[0] != null &&
                          statuses[0].id !== cancelStatusId && (
                            <MenuItem
                              disabled={recoveringId != null}
                              onClick={() => {
                                const selected = actionAnchor?.issue;
                                setActionAnchor(null);
                                if (selected) void handleRecover(selected);
                              }}
                            >
                              <ListItemIcon>
                                <UndoIcon fontSize="small" sx={{ color: "navy.main" }} />
                              </ListItemIcon>
                              <ListItemText sx={{ color: "navy.main", fontWeight: 600 }}>
                                {t("recover")}
                              </ListItemText>
                            </MenuItem>
                          )}
                        {canManage && (
                          <MenuItem
                            onClick={() => {
                              const selected = actionAnchor?.issue;
                              setActionAnchor(null);
                              if (selected) {
                                setDetailIssue(null);
                                setIssueToDelete(selected);
                              }
                            }}
                          >
                            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                            <ListItemText sx={{ color: "error.main" }}>{t("delete")}</ListItemText>
                          </MenuItem>
                        )}
                      </Menu>
                    </DataTableCell>
                  )}
                </DataTableRow>
              ))}
              {/* Empty (no rows at all, or a search/filter matched nothing)
                  used to render as bare headers that looked like a crash —
                  say so instead. colSpan mirrors the head's conditional
                  columns exactly. */}
              {pageIssues.length === 0 && (
                <DataTableRow hover={false}>
                  <DataTableCell
                    align="center"
                    colSpan={
                      8 +
                      (canSeeReporter ? 1 : 0) +
                      (canSeeTrackedTime ? 1 : 0) +
                      (canSeeActualTime ? 1 : 0) +
                      (canManage || canViewOwnHistory ? 1 : 0)
                    }
                    sx={{ py: 6, color: "text.secondary" }}
                  >
                    {t("filter.noResults")}
                  </DataTableCell>
                </DataTableRow>
              )}
            </DataTableBody>
      </DataTable>
      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(filteredIssues.length / 10))}
        total={filteredIssues.length}
        limit={10}
        onPageChange={setPage}
      />

      <IssueDetailDialog
        issue={detailIssue}
        open={!!detailIssue}
        onClose={() => setDetailIssue(null)}
        initialTab={detailTab}
        statuses={statuses}
        labels={labels}
        onRefresh={onRefresh}
      />
      <IssueDialog
        issue={editIssue}
        statusId={null}
        open={!!editIssue}
        onClose={() => {
          setEditIssue(null);
        }}
        onSave={handleSaveIssue}
        labels={labels}
        priorities={priorities}
      />
      <Dialog open={!!issueToDelete} onClose={() => setIssueToDelete(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>
          <Typography>
            {t("deleteIssueConfirmTrash", { title: issueToDelete?.title ?? "" })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueToDelete(null)}>{t("cancel")}</Button>
          <Button onClick={handleDeleteIssue} color="error">
            {t("delete")}
          </Button>
        </DialogActions>
      </Dialog>
      {/* "ยกเลิกงาน" — ย้ายไปสถานะ "ยกเลิก" แล้วดึงรายการใหม่ (`onRefresh`) */}
      <CancelIssueDialog
        issue={issueToCancel}
        statusId={cancelStatusId}
        onClose={() => setIssueToCancel(null)}
        onDone={onRefresh}
      />
    </Box>
  );
}

/* ================= Folder view (Drive-style drill-down) =================
   แอป → หมวดหมู่ → ความสำคัญ → สถานะ → การ์ด. Purely client-side grouping
   over the same filtered `issues` the table view uses — no extra API calls.
   Status changes go through the same `moveIssue` the drag handler calls, so
   the step-only (400) and status-lock (409) guards apply unchanged. */
const FOLDER_PAGE_SIZE = 12;

/* ---------- folder card thumbnails (Drive-style preview) ----------
   The attachment download endpoint needs the Bearer token, so a plain
   <img src> at the API can never render — fetch the bytes and hand the card
   an object URL instead. Cached per issue at module scope (survives drilling
   in and out of folders) with one in-flight promise per id, so a page of
   cards never double-fetches. The cache stores the attachment count it was
   built from: uploading a new image bumps the count and the thumb refreshes.
   A transient failure stays uncached so the next visit retries; "no image"
   and 403 are cached as misses. Object URLs live for the session — they are
   small thumbnails and revoking them would defeat the cache. */
type ThumbEntry = { count: number; url: string | null };
const thumbCache = new Map<number, ThumbEntry>();
const thumbPending = new Map<number, Promise<string | null>>();

function loadFolderThumb(issueId: number, attachmentCount: number): Promise<string | null> {
  const cached = thumbCache.get(issueId);
  if (cached && cached.count === attachmentCount) return Promise.resolve(cached.url);
  const pending = thumbPending.get(issueId);
  if (pending) return pending;

  const task = (async (): Promise<string | null> => {
    try {
      const files = await fetchAttachments(issueId);
      const image = files.find(
        (f) =>
          (f.fileType ?? "").trim().startsWith("image/") ||
          /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(f.fileName ?? ""),
      );
      if (!image) {
        thumbCache.set(issueId, { count: attachmentCount, url: null });
        return null;
      }
      const token = getToken();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/attachments/${image.id}/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) {
        // 403 = no permission — cache the miss; anything else stays retryable
        if (res.status === 403) thumbCache.set(issueId, { count: attachmentCount, url: null });
        return null;
      }
      const url = URL.createObjectURL(await res.blob());
      thumbCache.set(issueId, { count: attachmentCount, url });
      return url;
    } catch {
      // network hiccup — leave uncached so the next mount retries
      return null;
    } finally {
      thumbPending.delete(issueId);
    }
  })();

  thumbPending.set(issueId, task);
  return task;
}

function FolderThumb({
  issue,
  color,
  enabled,
}: {
  issue: BoardIssue;
  /** Resolved status colour — tints the loading spinner while the thumb loads. */
  color: string;
  /** Gate: only viewers holding `board.view` may hit the attachment API. */
  enabled: boolean;
}) {
  // undefined = still loading (spinner), null = no image (render no plate at all)
  const [url, setUrl] = useState<string | null | undefined>(() => {
    // synchronous cache hit — no spinner flash when the thumb is already known
    if (!enabled || issue.attachmentCount <= 0) return null;
    const hit = thumbCache.get(issue.id);
    return hit && hit.count === issue.attachmentCount ? hit.url : undefined;
  });

  useEffect(() => {
    if (!enabled || issue.attachmentCount <= 0) {
      setUrl(null);
      return;
    }
    let alive = true;
    loadFolderThumb(issue.id, issue.attachmentCount).then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [issue.id, issue.attachmentCount, enabled]);

  /* No image to show — no attachments at all, files that aren't pictures, or
     no `board.view` — so the card skips the plate entirely instead of drawing
     an empty one. The paperclip count on the card still signals the files. */
  if (url === null) return null;

  return (
    <Box
      sx={{
        width: "100%",
        aspectRatio: "16 / 10",
        borderRadius: 1.5,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: alpha(color, 0.08),
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      {url === undefined ? (
        <CircularProgress size={24} sx={{ color: alpha(color, 0.6) }} />
      ) : (
        <Box
          component="img"
          src={url}
          alt=""
          sx={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </Box>
  );
}

/**
 * One level of the folder drill path (app → category → priority → status).
 * `-1` is the "no value" bucket at every level, and `cat` may also be an
 * `"x:<name>"` string key for a custom category that has no row of its own.
 *
 * It lives at module scope — not inside `FolderView` — because the breadcrumb
 * for this path renders in the **Navbar header** (`DashboardLayout header=`),
 * one component tree above the folder grid.
 */
type FolderPath = {
  app: number | null;
  cat: number | string | null;
  prio: number | null;
  st: number | null;
};

function FolderView({
  statuses,
  issues,
  labels,
  apps,
  categories,
  priorities,
  path,
  setPath,
  selectedStatusIds,
  selectedPriorityIds,
  selectedCategoryIds,
  selectedAppIds,
  companyReporterIds,
  selectedAssigneeIds,
  selectedReporterIds,
  searchQuery,
  canEdit,
  canSeeReporter,
  staleRules,
  hideStaleRules,
  onRefresh,
  cardOrder,
  onToggleCardOrder,
  toolbar,
}: {
  statuses: IssueStatus[];
  issues: BoardIssue[];
  labels: Label[];
  apps: App[];
  categories: Category[];
  priorities: IssuePriority[];
  /**
   * Current drill path + its setter — **owned by `BoardsPageInner`**, because
   * the breadcrumb that mirrors it renders up in the Navbar header. The folder
   * grid below just reads it and drills into it.
   */
  path: FolderPath;
  setPath: Dispatch<SetStateAction<FolderPath>>;
  selectedStatusIds: number[];
  selectedPriorityIds: number[];
  selectedCategoryIds: number[];
  selectedAppIds: number[];
  /** See TableView: `null` = no company selected, `[]` = matches nothing. */
  companyReporterIds: string[] | null;
  selectedAssigneeIds: string[];
  selectedReporterIds: string[];
  searchQuery: string;
  canEdit: boolean;
  canSeeReporter: boolean;
  /** Active stale rules ({statusId, days}) — the red card border. */
  staleRules: StaleRule[];
  /**
   * Active hide rules ({statusId, days}) — cards past their day count are
   * dropped before anything below (folder counts, breadcrumbs, cards), so
   * every number in this view agrees. The table next door never filters.
   */
  hideStaleRules: StaleRule[];
  onRefresh: () => void;
  /**
   * Shared ↑↓ direction — of whichever sort criterion this view's dropdown is
   * on (`sortByEnteredAt` for the entered/created criteria, reversed priority
   * order for ความสำคัญ). Flipped by the toolbar button in the board/table
   * views; **this view hides that button**, so the dropdown's two direction
   * items below call `onToggleCardOrder` instead.
   */
  cardOrder: "desc" | "asc";
  /** Flip `cardOrder` — the folder view's own direction control (see above). */
  onToggleCardOrder: () => void;
  toolbar?: ReactNode;
}) {
  const t = useTranslations("Boards");
  const theme = useTheme();
  const { can } = usePermissions();
  const { notify } = useNotification();
  const fail = useCallback(
    (msg: string | null) => {
      if (msg) notify(msg, "error");
    },
    [notify],
  );
  const [detailIssue, setDetailIssue] = useState<BoardIssue | null>(null);
  const [visibleCount, setVisibleCount] = useState(FOLDER_PAGE_SIZE);
  /**
   * Sort **criterion** for the level-5 card grid — the direction is NOT in
   * here: the shared `cardOrder` flips it (toolbar ↑↓ in the board/table
   * views, this dropdown's direction items in THIS view), so no label ever
   * bakes in a direction. `entered` (default) = วันที่เข้าสถานะ, the very
   * criterion the board's columns use; `created` = the old creation-date
   * order; `prio` = ความสำคัญ (criterion borrowed from the old dropdown,
   * unchanged).
   */
  const [sort, setSort] = useState<"entered" | "created" | "prio">("entered");
  /** Text for one criterion — the DIRECTION lives on `cardOrder`, not here. */
  const sortLabel = (key: "entered" | "created" | "prio") =>
    key === "prio"
      ? t("filter.sectionPriority")
      : key === "created"
        ? t("folderSortDate")
        : t("folderSortEntered");
  const [movingId, setMovingId] = useState<number | null>(null);
  /* Status picker on a card: which chip opened it (Drive-like — no bulky
     inline <Select> on the card face). */
  const [statusMenu, setStatusMenu] = useState<{ el: HTMLElement; issue: BoardIssue } | null>(null);
  const canViewAttachments = can("board.view");

  const level =
    path.st !== null ? 5 : path.prio !== null ? 4 : path.cat !== null ? 3 : path.app !== null ? 2 : 1;

  const hasActiveFilters =
    selectedStatusIds.length > 0 ||
    selectedPriorityIds.length > 0 ||
    selectedCategoryIds.length > 0 ||
    selectedAppIds.length > 0 ||
    companyReporterIds !== null ||
    selectedAssigneeIds.length > 0 ||
    selectedReporterIds.length > 0 ||
    searchQuery.trim() !== "";

  /* Same filter rules as TableView, so the chips + search behave identically.
     The hide policy runs FIRST: a card an active `issue.hide_from_board`
     rule covers never reaches the filters, so folder counts, breadcrumbs and
     cards all drop it together (the table never receives this prop). */
  const visibleIssues = useMemo(
    () =>
      hideStaleRules.length === 0
        ? issues
        : issues.filter((issue) => !isHiddenFromFolder(issue, hideStaleRules)),
    [issues, hideStaleRules],
  );
  const filteredIssues = useMemo(() => {
    if (!hasActiveFilters) return visibleIssues;
    const query = searchQuery.trim().toLowerCase();
    return visibleIssues.filter((issue) => {
      if (selectedStatusIds.length > 0) {
        if (issue.statusId === null || !selectedStatusIds.includes(issue.statusId)) return false;
      }
      if (selectedPriorityIds.length > 0 && !selectedPriorityIds.includes(issue.priorityId ?? -1)) return false;
      if (selectedCategoryIds.length > 0) {
        const selectedCatNames = categories.filter((c) => selectedCategoryIds.includes(c.id)).map((c) => c.name);
        const matchCat = selectedCategoryIds.includes(issue.categoryId ?? -1);
        const matchCustom = issue.customCategory != null && selectedCatNames.includes(issue.customCategory);
        if (!matchCat && !matchCustom) return false;
      }
      if (selectedAppIds.length > 0 && !selectedAppIds.includes(issue.appId ?? -1)) return false;
      // company → the card's REPORTER must belong to one of the selected ones
      // (no reporter → "-1" never matches → hidden, same rule as the API)
      if (companyReporterIds !== null && !companyReporterIds.includes(String(issue.customerId ?? -1))) return false;
      if (selectedAssigneeIds.length > 0) {
        if (!issue.programmerId || !selectedAssigneeIds.includes(String(issue.programmerId))) return false;
      }
      if (selectedReporterIds.length > 0) {
        if (!issue.customerId || !selectedReporterIds.includes(String(issue.customerId))) return false;
      }
      if (query) {
        const matchTitle = issue.title.toLowerCase().includes(query);
        const matchLabel = (issue.labels ?? []).some((l) => l.name.toLowerCase().includes(query));
        if (!matchTitle && !matchLabel) return false;
      }
      return true;
    });
  }, [
    visibleIssues,
    categories,
    selectedStatusIds,
    selectedPriorityIds,
    selectedCategoryIds,
    selectedAppIds,
    companyReporterIds,
    selectedAssigneeIds,
    selectedReporterIds,
    searchQuery,
    hasActiveFilters,
  ]);

  /* Cards inside the current folder path (app → category → priority → status). */
  const branch = filteredIssues.filter((issue) => {
    if (path.app !== null) {
      if (path.app === -1 ? issue.appId !== null : issue.appId !== path.app) return false;
    }
    if (path.cat !== null) {
      if (typeof path.cat === "string") {
        // custom category with no row of its own: "x:<name>"
        if (!(issue.categoryId === null && issue.customCategory === path.cat.slice(2))) return false;
      } else if (path.cat === -1) {
        if (!(issue.categoryId === null && issue.customCategory == null)) return false;
      } else {
        const catName = categories.find((c) => c.id === path.cat)?.name;
        if (!(issue.categoryId === path.cat || (catName != null && issue.customCategory === catName))) {
          return false;
        }
      }
    }
    if (path.prio !== null) {
      if (path.prio === -1 ? issue.priorityId !== null : issue.priorityId !== path.prio) return false;
    }
    if (path.st !== null) {
      if (path.st === -1 ? issue.statusId !== null : issue.statusId !== path.st) return false;
    }
    return true;
  });

  /* Folders for levels 1–4; level 4 keeps the board's status order. Cards
     missing a value get their own "no value" bucket so nothing is invisible. */
  const folders: { id: number | string; name: string; count: number; color: string }[] = [];
  if (level === 1) {
    apps.forEach((a) =>
      folders.push({
        id: a.id,
        name: a.name,
        color: theme.palette.primary.main,
        count: branch.filter((i) => i.appId === a.id).length,
      }),
    );
    const noApp = branch.filter((i) => i.appId === null).length;
    if (noApp > 0) {
      folders.push({ id: -1, name: t("folderNoApp"), color: theme.palette.text.disabled, count: noApp });
    }
  } else if (level === 2) {
    categories.forEach((c) =>
      folders.push({
        id: c.id,
        name: c.name,
        color: theme.palette.secondary.main,
        count: branch.filter((i) => i.categoryId === c.id || i.customCategory === c.name).length,
      }),
    );
    // custom categories that have no row of their own in `categories`
    const customNames = [
      ...new Set(
        branch
          .filter((i) => i.categoryId === null && i.customCategory)
          .map((i) => i.customCategory as string),
      ),
    ].filter((n) => !categories.some((c) => c.name === n));
    customNames.forEach((n) =>
      folders.push({
        id: "x:" + n,
        name: n,
        color: theme.palette.secondary.light,
        count: branch.filter((i) => i.categoryId === null && i.customCategory === n).length,
      }),
    );
    const noCat = branch.filter((i) => i.categoryId === null && i.customCategory == null).length;
    if (noCat > 0) {
      folders.push({ id: -1, name: t("folderNoCat"), color: theme.palette.text.disabled, count: noCat });
    }
  } else if (level === 3) {
    priorities.forEach((p) =>
      folders.push({
        id: p.id,
        name: p.name,
        color: theme.palette.info.main,
        count: branch.filter((i) => i.priorityId === p.id).length,
      }),
    );
    const noPrio = branch.filter((i) => i.priorityId === null).length;
    if (noPrio > 0) {
      folders.push({ id: -1, name: t("folderNoPrio"), color: theme.palette.text.disabled, count: noPrio });
    }
  } else if (level === 4) {
    statuses.forEach((s) =>
      folders.push({
        id: s.id,
        name: s.name,
        // resolve first — the column may hold a palette *name* ("yellow"),
        // which MUI's alpha() would reject (it only takes hex/rgb/hsl)
        color: resolveStatusColor(theme, s.color, s.name),
        count: branch.filter((i) => i.statusId === s.id).length,
      }),
    );
    const noStatus = branch.filter((i) => i.statusId === null).length;
    if (noStatus > 0) {
      folders.push({ id: -1, name: t("folderNoStatus"), color: theme.palette.text.disabled, count: noStatus });
    }
  }
  const visibleFolders = hasActiveFilters ? folders.filter((f) => f.count > 0) : folders;

  /* Level 5: flat card grid — paged client-side. The CRITERION comes from the
     dropdown below, the DIRECTION from the shared `cardOrder` — flipped by the
     toolbar's ↑↓ in the board/table views and by that dropdown's direction
     items here (folder hides the button), so one arrow means "flip the
     order" in every view. (Plain code, not a memo: `branch` is rebuilt every
     render anyway, exactly as before.) */
  const sortedCards = (() => {
    // Creation time, newest-first by default and flipped by the same arrow —
    // tie-breaks (createdAt, id) mirror the API's fixed addOrderBy exactly
    // like `sortByEnteredAt` does for the status-change stamp.
    const byCreatedAt = (a: BoardIssue, b: BoardIssue) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      const base = diff !== 0 ? diff : b.id - a.id;
      return cardOrder === "asc" ? -base : base;
    };
    if (sort === "entered") return sortByEnteredAt(branch, cardOrder);
    if (sort === "created") return [...branch].sort(byCreatedAt);
    // `prio`: sortOrder ASCENDING = ความสำคัญมากก่อน, which is what the
    // DEFAULT direction (desc) has always shown here — flipping to `asc`
    // simply reverses it (น้อย → มาก). A card with no priority sorts last
    // either way, then falls through to the same time tie-break.
    return [...branch].sort((a, b) => {
      const ra = priorities.find((p) => p.id === a.priorityId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const rb = priorities.find((p) => p.id === b.priorityId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (ra !== rb) return cardOrder === "desc" ? ra - rb : rb - ra;
      return byCreatedAt(a, b);
    });
  })();
  const shownCards = sortedCards.slice(0, visibleCount);

  /* New folder / new filters → back to the first page of cards. */
  useEffect(() => {
    setVisibleCount(FOLDER_PAGE_SIZE);
  }, [
    path,
    searchQuery,
    selectedStatusIds,
    selectedPriorityIds,
    selectedCategoryIds,
    selectedAppIds,
    selectedAssigneeIds,
    selectedReporterIds,
  ]);

  const drill = (id: number | string) => {
    setPath((p) =>
      level === 1
        ? { app: typeof id === "number" ? id : null, cat: null, prio: null, st: null }
        : level === 2
          ? { ...p, cat: id, prio: null, st: null }
          : level === 3
            ? { ...p, prio: typeof id === "number" ? id : null, st: null }
            : { ...p, st: typeof id === "number" ? id : null },
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleMove = async (issue: BoardIssue, statusId: number) => {
    if (issue.statusId === statusId) return;
    setMovingId(issue.id);
    try {
      await moveIssue(issue.id, statusId);
      onRefresh();
    } catch (e) {
      // Same mapping as the drag handler: 422 = task type missing, 409 =
      // status lock, 400 = step-only guard — rule refusals are a policy nudge
      // (warning toast), anything else the error toast
      const refusal = isApiError(e, 422)
        ? t("taskTypeRequired")
        : isApiError(e, 409)
          ? t("lockedCard")
          : isApiError(e, 400)
            ? t("invalidTransition")
            : null;
      if (refusal) notify(refusal, "warning");
      else fail(getErrorMessage(e, "เกิดข้อผิดพลาด"));
      onRefresh();
    } finally {
      setMovingId(null);
    }
  };

  /** Resolved status colour for a card — same lookup as the table's column. */
  const statusColorOf = (issue: BoardIssue): string => {
    const s = issue.statusId ? statuses.find((st) => st.id === issue.statusId) : null;
    return resolveStatusColor(theme, s?.color, issue.statusName ?? s?.name ?? null);
  };

  return (
    <Box>
      {toolbar}

      {/* The breadcrumb (บอร์ด › แอป › หมวด › ความสำคัญ › สถานะ) no longer
          renders here — it lives in the Navbar header one level up, in place of
          the page title (see BoardsPageInner's `header`). The mt below replaces
          the gap those crumbs used to own. */}

      {level < 5 ? (
        visibleFolders.length > 0 ? (
          <Box
            sx={{
              mt: 2,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
              gap: 2,
            }}
          >
            {visibleFolders.map((f) => (
              <Paper
                key={f.id}
                variant="outlined"
                onClick={() => drill(f.id)}
                sx={{
                  // Drive-style tile: soft tinted plate, generous rounding,
                  // no hard outline — the folder colour drives the tint
                  p: 1.75,
                  borderRadius: 3,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  bgcolor: alpha(f.color, 0.08),
                  borderColor: "transparent",
                  transition: "box-shadow .15s ease, transform .15s ease",
                  "&:hover": {
                    bgcolor: alpha(f.color, 0.16),
                    boxShadow: 4,
                    transform: "translateY(-2px)",
                  },
                }}
              >
                <FolderIcon sx={{ color: f.color, fontSize: 34, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography fontWeight={600} noWrap>
                    {f.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t("folderItems", { count: f.count })}
                  </Typography>
                </Box>
                {level === 4 && (
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      bgcolor: f.color,
                      flexShrink: 0,
                    }}
                  />
                )}
              </Paper>
            ))}
          </Box>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }}>
            {t("filter.noResults")}
          </Alert>
        )
      ) : (
        <>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2, mb: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              {/* white pill, same recipe as every non-dashboard dropdown
                  (PILL_SELECT_SX above) — the old compact 28px look was
                  dropped so it matches the rest */}
              <Select
                value={sort}
                onChange={(e) => {
                  const v = e.target.value as string;
                  // The two DIRECTION items live in this menu too (this view
                  // hides the toolbar's ↑↓): flip the shared order and leave
                  // the criterion alone. Only the OTHER direction flips, so
                  // clicking the state you are already on is a no-op.
                  if (v === "order-desc" || v === "order-asc") {
                    const want = v === "order-asc" ? "asc" : "desc";
                    if (want !== cardOrder) onToggleCardOrder();
                    return;
                  }
                  setSort(v as "entered" | "created" | "prio");
                }}
                renderValue={(raw) => {
                  const value = typeof raw === "string" ? raw : "entered";
                  return (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                      <Typography sx={PILL_VALUE_SX}>{sortLabel(value)}</Typography>
                      {/* Current direction at a glance — the SAME glyph +
                          rotation as the toolbar's ↑↓, which this view does
                          not render. */}
                      <SwapVertIcon
                        sx={{
                          fontSize: 16,
                          color: "text.secondary",
                          flexShrink: 0,
                          transform: cardOrder === "asc" ? "rotate(180deg)" : "none",
                          transition: "transform 150ms ease-in-out",
                        }}
                      />
                    </Box>
                  );
                }}
                MenuProps={{ slotProps: { paper: { sx: pillPaperSx(theme) } } }}
                sx={PILL_SELECT_SX}
              >
                {([
                  { key: "entered", label: t("folderSortEntered") },
                  { key: "created", label: t("folderSortDate") },
                  { key: "prio", label: t("filter.sectionPriority") },
                ] as const).map((o) => (
                  <MenuItem key={o.key} value={o.key} sx={PILL_ITEM_SX}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.label}
                      </Typography>
                      {sort === o.key && (
                        <CheckIcon sx={{ fontSize: 16, ml: "auto", flexShrink: 0, color: "primary.main" }} />
                      )}
                    </Box>
                  </MenuItem>
                ))}
                {/* DIRECTION — the toolbar's ↑↓ is hidden in this view, so the
                    flip lives here: the two states (✓ = the one you are on),
                    wording shared with the toolbar button's tooltip
                    (`cardOrderNewest`/`cardOrderOldest`). These values are NOT
                    Select values — the `onChange` above intercepts them and
                    never touches `sort`. */}
                <Divider sx={{ my: 0.75 }} />
                {([
                  { key: "order-desc", label: t("cardOrderNewest"), on: cardOrder === "desc" },
                  { key: "order-asc", label: t("cardOrderOldest"), on: cardOrder === "asc" },
                ] as const).map((o) => (
                  <MenuItem key={o.key} value={o.key} sx={PILL_ITEM_SX}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {o.label}
                      </Typography>
                      {o.on && (
                        <CheckIcon sx={{ fontSize: 16, ml: "auto", flexShrink: 0, color: "primary.main" }} />
                      )}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          {sortedCards.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              {t("noCards")}
            </Alert>
          ) : (
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 2 }}>
              {shownCards.map((issue) => {
                const assignee =
                  issue.programmerName ?? (canSeeReporter ? issue.customerName : null);
                const statusColor = statusColorOf(issue);
                // Trello-style label stubs, same as the Kanban card — first 4
                // render, the rest collapse into ONE "+N" stub (hover lists
                // the hidden names) instead of vanishing silently
                const allLabels = issue.labels ?? [];
                const labelBars = allLabels.slice(0, 4);
                const hiddenLabels = allLabels.slice(4);
                const statusEditable = canEdit && !issue.isLocked && movingId !== issue.id;
                const staleDays = staleDaysFor(issue, staleRules);
                return (
                <Paper
                  key={issue.id}
                  variant="outlined"
                  onClick={() => setDetailIssue(issue)}
                  sx={{
                    // compact cell: 1.25/0.75 padding+gap (was 2/1.25) — a
                    // folder row should read as a list of tickets, not posters
                    p: 1.25,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 0.75,
                    borderRadius: 3,
                    // the card's own outline turns red while it sits past a
                    // stale rule — same rule, same look as the Kanban board
                    ...(staleDays != null
                      ? { border: "2px solid", borderColor: "error.main" }
                      : {}),
                    transition: "box-shadow .15s ease, transform .15s ease",
                    "&:hover": { boxShadow: 4, transform: "translateY(-2px)" },
                  }}
                >
                  {/* Label colour stubs + the stale notice — SAME shape as the
                      Kanban card (TrelloCardContent): the row exists whenever
                      EITHER half does, so a stale card with no labels still
                      says "ค้าง N วัน" (alone, on the right). */}
                  {(staleDays != null || labelBars.length > 0) && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      {labelBars.map((lbl) => (
                        <Box
                          key={lbl.id}
                          title={lbl.name}
                          sx={{
                            width: 28,
                            height: 8,
                            borderRadius: "4px",
                            bgcolor: labelColorValue(lbl.color, theme),
                          }}
                        />
                      ))}
                      {hiddenLabels.length > 0 && (
                        <Box
                          title={hiddenLabels.map((l) => l.name).join(", ")}
                          sx={{
                            minWidth: 28,
                            height: 14,
                            px: 0.4,
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: "action.selected",
                            color: "text.secondary",
                            fontSize: "0.575rem",
                            fontWeight: 700,
                            lineHeight: 1,
                          }}
                        >
                          +{hiddenLabels.length}
                        </Box>
                      )}
                      {/* Plain red text pushed to the RIGHT of the stubs —
                          the Kanban card's treatment byte-for-byte (no chip,
                          no clock icon, no background, same 0.7rem metrics);
                          `ml: "auto"` keeps the labels on the left edge. */}
                      {staleDays != null && (
                        <Typography
                          sx={{
                            ml: "auto",
                            color: "error.main",
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            lineHeight: 1,
                            flexShrink: 0,
                          }}
                        >
                          {t("staleBadge", { days: staleDays })}
                        </Typography>
                      )}
                    </Box>
                  )}
                  {/* No `#issueNumber` line here — the number lives in the
                      detail dialog; the title is the card's first line now */}
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.4, flex: 1, minWidth: 0 }}>
                      {issue.title}
                    </Typography>
                    {issue.appName && (
                      <Chip
                        label={issue.appName}
                        size="small"
                        sx={{
                          // folder-card chip metrics (16px/0.6rem) — one notch
                          // under the Kanban card's 18px now that the cell is
                          // compact, so the pill doesn't out-shout the title
                          height: 16,
                          fontSize: "0.6rem",
                          fontWeight: 600,
                          flexShrink: 0,
                          ml: 0.5,
                          bgcolor: "action.selected",
                          color: "text.secondary",
                        }}
                      />
                    )}
                  </Box>

                  {/* Drive-style preview: the first image attachment only —
                      cards without one render no plate at all */}
                  <FolderThumb
                    issue={issue}
                    color={statusColor}
                    enabled={canViewAttachments}
                  />

                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                    <Chip
                      size="small"
                      label={issue.statusName ?? "—"}
                      onClick={(e) => {
                        if (!statusEditable) return;
                        e.stopPropagation();
                        setStatusMenu({ el: e.currentTarget, issue });
                      }}
                      clickable={statusEditable}
                      icon={
                        issue.isLocked ? (
                          // `color="inherit"` keeps the lock on the tint's own
                          // text colour — without it MUI paints the icon its
                          // default grey regardless of the chip's text colour
                          <LockIcon color="inherit" sx={{ fontSize: 12 }} />
                        ) : undefined
                      }
                      sx={{
                        ...statusChipSx(statusColor),
                        // Folder-card metrics: 16px/0.6rem — one notch under
                        // the Kanban card's 18px/0.65rem (TrelloCardContent),
                        // since this cell is compact (220px, p 1.25) and a
                        // full-size pill out-shouts the title in it.
                        height: 16,
                        fontSize: "0.6rem",
                        fontWeight: 600,
                        cursor: statusEditable ? "pointer" : "default",
                        // re-assert the tint: MUI's clickable:hover would
                        // otherwise swap it for the grey action overlay —
                        // 15% → 20% deepens the pill without leaving its hue.
                        // 0.25 was the value picked while this chip still
                        // chased WCAG AA (it cost 4.41:1); with AA dropped in
                        // favour of vivid text that reason is gone, so 0.2
                        // simply stayed rather than being re-tuned for looks.
                        "&:hover": statusEditable
                          ? { bgcolor: alpha(statusColor, 0.2) }
                          : undefined,
                      }}
                    />
                    {issue.priorityName && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={priorityLabel(t, issue.priorityName)}
                        color={PRIORITY_COLORS[issue.priorityName.toLowerCase()] ?? "default"}
                        sx={{ height: 16, fontSize: "0.6rem", fontWeight: 600 }}
                      />
                    )}
                    {/* Stale past a rule's day count — the notice lives in the
                        LABEL row above as plain red text (the Kanban card's
                        treatment), not as a chip here any more */}
                    <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.75 }}>
                      {issue.commentCount > 0 && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.2 }}>
                          <ChatBubbleOutlineIcon sx={{ fontSize: 13, color: "text.secondary" }} />
                          <Typography variant="caption" color="text.secondary">
                            {issue.commentCount}
                          </Typography>
                        </Box>
                      )}
                      {issue.attachmentCount > 0 && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.2 }}>
                          <AttachFileIcon sx={{ fontSize: 13, color: "text.secondary" }} />
                          <Typography variant="caption" color="text.secondary">
                            {issue.attachmentCount}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>

                  {/* No description preview either — the full text (editable)
                      lives in the detail dialog, which a card click opens.
                      Pinned to the cell floor so footers line up across a
                      mixed row — a card with a thumb is taller than one without */}
                  <Divider sx={{ mt: "auto" }} />
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {assignee ? (
                      <Avatar
                        sx={{
                          width: 22,
                          height: 22,
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                        }}
                      >
                        {assignee.charAt(0).toUpperCase()}
                      </Avatar>
                    ) : (
                      <Avatar
                        sx={{
                          width: 22,
                          height: 22,
                          bgcolor: theme.palette.grey[300],
                          color: theme.palette.grey[600],
                        }}
                      >
                        <PersonIcon sx={{ fontSize: 14 }} />
                      </Avatar>
                    )}
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
                      {assignee ?? "—"}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.35, flexShrink: 0 }}>
                      <CalendarTodayIcon sx={{ fontSize: 13, color: "text.secondary" }} />
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(issue.createdAt)}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
                );
              })}
            </Box>
          )}
          <Box sx={{ display: "flex", justifyContent: "center", gap: 1, mt: 2 }}>
            {sortedCards.length > shownCards.length && (
              <Button variant="outlined" size="small" onClick={() => setVisibleCount((v) => v + FOLDER_PAGE_SIZE)}>
                {t("folderLoadMore")}
              </Button>
            )}
            {visibleCount > FOLDER_PAGE_SIZE && sortedCards.length > FOLDER_PAGE_SIZE && (
              <Button variant="text" size="small" onClick={() => setVisibleCount(FOLDER_PAGE_SIZE)}>
                {t("folderShowLess")}
              </Button>
            )}
          </Box>
        </>
      )}

      {/* status picker opened from a card's status chip (canEdit + unlocked) */}
      <Menu
        anchorEl={statusMenu?.el}
        open={Boolean(statusMenu)}
        onClose={() => setStatusMenu(null)}
        onClick={(e) => e.stopPropagation()}
      >
        {statuses.map((s) => (
          <MenuItem
            key={s.id}
            selected={s.id === statusMenu?.issue.statusId}
            disabled={movingId !== null}
            onClick={() => {
              const issue = statusMenu?.issue;
              setStatusMenu(null);
              if (issue) handleMove(issue, s.id);
            }}
          >
            <Box
              component="span"
              sx={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                bgcolor: resolveStatusColor(theme, s.color, s.name),
                mr: 1.25,
                flexShrink: 0,
              }}
            />
            {s.name}
          </MenuItem>
        ))}
      </Menu>

      <IssueDetailDialog
        issue={detailIssue}
        open={!!detailIssue}
        onClose={() => setDetailIssue(null)}
        statuses={statuses}
        labels={labels}
        onRefresh={onRefresh}
      />
    </Box>
  );
}

function BoardsPageInner() {
  const t = useTranslations("Boards");
  const { can, roleName } = usePermissions();
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUserId = useAuthStore((s) => s.user?.id) ?? null;
  const isCustomer = roleName === "customer";
  // Default view = the Kanban board for staff, the table for customers.
  // `chosenView` only records an explicit toggle (null = none yet), so the
  // default re-applies on every visit and the derived value self-corrects if
  // `roleName` resolves after the first render (usePermissions falls back to
  // "customer" while logged out). Customers are forced to the table here —
  // one place, regardless of what was chosen.
  const [chosenView, setChosenView] = useState<"board" | "table" | "folder" | null>(null);
  const view: "board" | "table" | "folder" = isCustomer ? "table" : (chosenView ?? "board");
  const isBoardView = view === "board";
  const isTableView = view === "table";
  const isFolderView = view === "folder";
  /**
   * Card order for EVERY view — "entered this column when": `desc` (default,
   * newest status change on top) or `asc` (longest-sitting on top, which
   * floats the cards the stale rules are about to catch). The Kanban columns
   * ask the API for it (`?sortBy=statusChangedAt`), the table and the folder
   * grid sort the same list with the same comparator (`sortByEnteredAt`), and
   * the folder's dropdown picks the CRITERION while this flips its direction.
   * `/reports` keeps its own `createdAt` order — out of scope. The choice
   * survives a reload (localStorage) — read in an effect because SSR has no
   * `localStorage`, and a stored `desc` equals the default so it never costs
   * a re-render.
   */
  const [cardOrder, setCardOrder] = useState<"desc" | "asc">("desc");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(BOARD_CARD_ORDER_KEY) === "asc") setCardOrder("asc");
    } catch {
      // storage unavailable (private mode / blocked) — keep the default
    }
  }, []);
  const toggleCardOrder = useCallback(() => {
    setCardOrder((prev) => {
      const next = prev === "desc" ? "asc" : "desc";
      try {
        window.localStorage.setItem(BOARD_CARD_ORDER_KEY, next);
      } catch {
        // not remembering is fine — the order still flips for this visit
      }
      return next;
    });
  }, []);
  /**
   * Folder drill path (app → category → priority → status) — owned **here**,
   * not inside `FolderView`, so the breadcrumb that mirrors it can render in
   * the Navbar header (in place of the "บอร์ด" title) while the grid drills.
   * `-1` is the "no value" bucket; `cat` may also be `"x:<name>"` (a custom
   * category with no row of its own).
   */
  const [path, setPath] = useState<FolderPath>({ app: null, cat: null, prio: null, st: null });
  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  // the "one column at a time" rule — false also while the lookup fails, so
  // the board degrades to free dragging and the server's 400 stays the backstop
  const [stepOnlyMoves, setStepOnlyMoves] = useState(false);
  // statuses where an active `issue.require_task_type` rule demands a
  // ประเภทงาน before the card may leave — the preview refuses an untyped card
  // there ([] = no rule / lookup failed → fail open, the server's 422 is the
  // backstop)
  const [taskTypeGateIds, setTaskTypeGateIds] = useState<number[]>([]);
  // any active `issue.unlock` rule — a locked card only offers its unlock
  // button while the rules allow a release (false while the lookup fails)
  const [unlockAvailable, setUnlockAvailable] = useState(false);
  // active stale rules ({statusId, days}) — the board/folder paint the red
  // "sitting too long" border from these; [] (no rule / lookup failed) = none
  const [staleRules, setStaleRules] = useState<StaleRule[]>([]);
  // the OTHER board policy ({statusId, days}) — active `issue.hide_from_board`
  // rules; the folder drops covered cards client-side off these, the board
  // asks the API instead (hideStaleDone=1). [] = nothing hides (fail open)
  const [hideStaleRules, setHideStaleRules] = useState<StaleRule[]>([]);
  const [priorities, setPriorities] = useState<IssuePriority[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<BoardMember[]>([]);
  const [selectedStatusIds, setSelectedStatusIds] = useState<number[]>([]);
  const [selectedPriorityIds, setSelectedPriorityIds] = useState<number[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedAppIds, setSelectedAppIds] = useState<number[]>([]);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<number[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [selectedReporterIds, setSelectedReporterIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [trashedIssues, setTrashedIssues] = useState<TrashedIssue[]>([]);
  const [trashDetailIssue, setTrashDetailIssue] = useState<TrashedIssue | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const { notify } = useNotification();
  const fail = useCallback(
    (msg: string | null) => {
      if (msg) notify(msg, "error");
    },
    [notify],
  );
  const [loading, setLoading] = useState(false);
  // `?issue=<id>` comes from a notification deep link and opens one card's
  // detail dialog directly, whichever view (table/kanban) is active
  const issueParamRaw = searchParams.get("issue");
  const issueParam =
    issueParamRaw && Number.isInteger(Number(issueParamRaw)) && Number(issueParamRaw) > 0
      ? Number(issueParamRaw)
      : null;
  const [deepLinkIssue, setDeepLinkIssue] = useState<BoardIssue | null>(null);

  // running timers — one fetch for the whole board + one shared ticking clock
  const [openTimers, setOpenTimers] = useState<Record<number, string>>({});
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const refreshTimers = useCallback(async () => {
    try {
      const sessions = await fetchOpenTimers();
      const map: Record<number, string> = {};
      for (const session of sessions) map[session.issueId] = session.startedAt;
      setOpenTimers(map);
    } catch {
      // no permission or offline — chips just keep showing the banked totals
      setOpenTimers({});
    }
    setTimerNow(Date.now());
  }, []);
  useEffect(() => {
    refreshTimers();
  }, [refreshTimers]);
  useEffect(() => {
    if (Object.keys(openTimers).length === 0) return;
    const interval = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [openTimers]);
  const timers: BoardTimers = useMemo(
    () => ({ running: openTimers, now: timerNow, refresh: refreshTimers }),
    [openTimers, timerNow, refreshTimers],
  );

  const canEdit = can("issue.all.update");
  const canDelete = can("issue.delete");
  const canAssign = can("issue.assign");
  // unlocking a card needs the permission *and* an active `issue.unlock`
  // rule: without one, a locked status stays sealed and admins release
  // cards by pausing the lock rule in the ระบบอัตโนมัติ tab of /master-data
  const canUnlockIssue = can("issue.all.update") && unlockAvailable;
  const canManage = canEdit || canDelete || canAssign;
  const canSeeReporter = can("issue.all.view");
  const canViewOwnHistory = can("issue.own.view");
  // time columns/chips are permission-driven, never role-driven
  const canSeeTime = can("time.system.view");
  const canSeeActualTime = can("time.actual.view");

  const handleToggleStatusFilter = (statusId: number) => {
    setSelectedStatusIds((prev) =>
      prev.includes(statusId)
        ? prev.filter((id) => id !== statusId)
        : [...prev, statusId],
    );
  };

  const handleTogglePriorityFilter = (priorityId: number) => {
    setSelectedPriorityIds((prev) =>
      prev.includes(priorityId)
        ? prev.filter((id) => id !== priorityId)
        : [...prev, priorityId],
    );
  };

  const handleToggleAssigneeFilter = (userId: string) => {
    setSelectedAssigneeIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const handleToggleReporterFilter = (userId: string) => {
    setSelectedReporterIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const handleToggleCategoryFilter = (categoryId: number) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId],
    );
  };

  const handleToggleAppFilter = (appId: number) => {
    setSelectedAppIds((prev) =>
      prev.includes(appId)
        ? prev.filter((id) => id !== appId)
        : [...prev, appId],
    );
  };

  const handleToggleCompanyFilter = (companyId: number) => {
    setSelectedCompanyIds((prev) =>
      prev.includes(companyId)
        ? prev.filter((id) => id !== companyId)
        : [...prev, companyId],
    );
  };

  const handleClearAllFilters = () => {
    setSelectedStatusIds([]);
    setSelectedPriorityIds([]);
    setSelectedCategoryIds([]);
    setSelectedAppIds([]);
    setSelectedCompanyIds([]);
    setSelectedAssigneeIds([]);
    setSelectedReporterIds([]);
    setSearchQuery("");
  };

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const results = await Promise.allSettled([
        fetchIssues(1, 100, [], "", roleName === "programmer"),
        fetchLabels(),
        fetchStatuses(),
        fetchPriorities(),
        fetchCategories(),
        fetchApps(),
        fetchCompanies(),
        fetchMembers(),
        // fail-open: a rejected policy lookup must not raise the load error
        fetchMovePolicy().catch(() => ({
          stepOnly: false,
          requireTaskTypeStatusIds: [] as number[],
          unlockAvailable: false,
          staleRules: [],
          hideStaleRules: [],
        })),
        refreshTimers(),
      ]);
      const [iss, lbls, sts, pri, cats, aps, cmps, usr, policy] = results;
      if (iss.status === "fulfilled") setIssues(iss.value.data);
      if (lbls.status === "fulfilled") setLabels(lbls.value.data);
      if (sts.status === "fulfilled") setStatuses(sts.value.data);
      if (pri.status === "fulfilled") setPriorities(pri.value.data);
      if (cats.status === "fulfilled") setCategories(cats.value.data);
      if (aps.status === "fulfilled") setApps(aps.value.data);
      if (cmps.status === "fulfilled") setCompanies(cmps.value.data);
      if (usr.status === "fulfilled") setUsers(usr.value);
      if (policy.status === "fulfilled") {
        setStepOnlyMoves(policy.value.stepOnly);
        setTaskTypeGateIds(policy.value.requireTaskTypeStatusIds ?? []);
        setUnlockAvailable(Boolean(policy.value.unlockAvailable));
        setStaleRules(policy.value.staleRules ?? []);
        setHideStaleRules(policy.value.hideStaleRules ?? []);
      }
      const firstError = results.find((r) => r.status === "rejected");
      if (firstError && firstError.status === "rejected") {
        fail(getErrorMessage(firstError.reason, "โหลดข้อมูลไม่สำเร็จ"));
      }
    } catch (e) {
      fail(getErrorMessage(e, "โหลดข้อมูลไม่สำเร็จ"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [roleName, refreshTimers, fail]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Notification deep link: fetch that one card and open its detail dialog.
  // A card that is gone (trashed meanwhile, wrong permissions) just leaves the
  // user on the board — no error banner for a link that no longer resolves.
  useEffect(() => {
    if (!issueParam) return;
    let cancelled = false;
    fetchIssue(issueParam)
      .then((issue) => {
        if (!cancelled) setDeepLinkIssue(issue);
      })
      .catch(() => {
        if (!cancelled) setDeepLinkIssue(null);
      });
    return () => {
      cancelled = true;
    };
  }, [issueParam]);

  /**
   * Company filter resolved to **reporter ids** for the two in-memory views
   * (table / folder) — the kanban columns ask the API with `companyIds`
   * instead and the server runs the identical rule as a subquery.
   * `null` = no company selected (no constraint at all); `[]` = a selected
   * company that has no members, which must match nothing (an empty array
   * without the null would read as "no filter" and show every card).
   *
   * Path is **การ์ด → ผู้แจ้ง → บริษัท** (`issues.customer_id` →
   * `users.company_id`): a card is "of" a company because the person who
   * reported it belongs to that company — exactly what the company field on
   * the user form records. A card with no reporter, or a reporter with no
   * company, is never in the list → hidden while a company filter is on
   * (deliberate: it belongs to no company).
   *
   * NOTE: the OLD path (card → app → `app_companies`) is gone here. It made
   * every company return the same cards whenever one app was linked to all
   * of them (POS was linked to all three).
   */
  const companyReporterIds = useMemo<string[] | null>(() => {
    if (selectedCompanyIds.length === 0) return null;
    const wanted = new Set(selectedCompanyIds);
    return users
      .filter((member) => member.companyId != null && wanted.has(member.companyId))
      .map((member) => member.id);
  }, [selectedCompanyIds, users]);

  const activeFilterChips = useMemo(() => {
    type FilterChipEntry = {
      key: string;
      label: string;
      color?: string;
      icon?: React.ReactElement;
      avatar?: React.ReactElement;
      onDelete: () => void;
    };
    const chips: FilterChipEntry[] = [];

    for (const status of statuses) {
      if (!selectedStatusIds.includes(status.id)) continue;
      const color = resolveStatusColor(theme, status.color, status.name);
      chips.push({
        key: `status-${status.id}`,
        label: status.customName ?? status.name,
        color,
        icon: (
          <Box
            component="span"
            sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color, ml: 0.5 }}
          />
        ),
        onDelete: () => handleToggleStatusFilter(status.id),
      });
    }
    for (const app of apps) {
      if (!selectedAppIds.includes(app.id)) continue;
      chips.push({
        key: `app-${app.id}`,
        label: app.name,
        icon: <AppsIcon sx={{ fontSize: 16, ml: 0.5 }} />,
        onDelete: () => handleToggleAppFilter(app.id),
      });
    }
    for (const company of companies) {
      if (!selectedCompanyIds.includes(company.id)) continue;
      chips.push({
        key: `company-${company.id}`,
        label: company.name,
        icon: <BusinessIcon sx={{ fontSize: 16, ml: 0.5 }} />,
        onDelete: () => handleToggleCompanyFilter(company.id),
      });
    }
    for (const priority of priorities) {
      if (!selectedPriorityIds.includes(priority.id)) continue;
      const color = getPriorityColor(theme, priority.name);
      chips.push({
        key: `priority-${priority.id}`,
        label: priority.name,
        color,
        icon: <FlagIcon sx={{ fontSize: 15, ml: 0.5, color }} />,
        onDelete: () => handleTogglePriorityFilter(priority.id),
      });
    }
    for (const category of categories) {
      if (!selectedCategoryIds.includes(category.id)) continue;
      chips.push({
        key: `category-${category.id}`,
        label: category.name,
        onDelete: () => handleToggleCategoryFilter(category.id),
      });
    }
    for (const member of users) {
      if (!member.isActive) continue;
      if (member.roleName === "programmer" && selectedAssigneeIds.includes(member.id)) {
        chips.push({
          key: `assignee-${member.id}`,
          label: member.name,
          avatar: <Avatar sx={{ width: 18, height: 18, fontSize: 10 }}>{getInitials(member.name)}</Avatar>,
          onDelete: () => handleToggleAssigneeFilter(member.id),
        });
      }
      if (member.roleName === "customer" && selectedReporterIds.includes(member.id)) {
        chips.push({
          key: `reporter-${member.id}`,
          label: member.name,
          avatar: <Avatar sx={{ width: 18, height: 18, fontSize: 10 }}>{getInitials(member.name)}</Avatar>,
          onDelete: () => handleToggleReporterFilter(member.id),
        });
      }
    }
    return chips;
  }, [
    statuses,
    apps,
    companies,
    priorities,
    categories,
    users,
    selectedStatusIds,
    selectedAppIds,
    selectedCompanyIds,
    selectedPriorityIds,
    selectedCategoryIds,
    selectedAssigneeIds,
    selectedReporterIds,
    theme,
  ]);

  const filterCount = activeFilterChips.length;

  /* ---------- folder breadcrumb: บอร์ด › แอป › หมวด › ความสำคัญ › สถานะ ----------
     Derived from `path` here so it can render up in the Navbar header — the
     crumbs used to sit under the search box inside FolderView. Same logic, same
     labels (`-1` = the "no value" bucket, `x:<name>` = custom category). */
  const crumbs: { key: "root" | "app" | "cat" | "prio" | "st"; label: string }[] = [
    { key: "root", label: t("board") },
  ];
  if (path.app !== null) {
    const label = path.app === -1 ? t("folderNoApp") : apps.find((x) => x.id === path.app)?.name;
    if (label) crumbs.push({ key: "app", label });
  }
  if (path.cat !== null) {
    const label =
      typeof path.cat === "string"
        ? path.cat.slice(2)
        : path.cat === -1
          ? t("folderNoCat")
          : categories.find((x) => x.id === path.cat)?.name;
    if (label) crumbs.push({ key: "cat", label });
  }
  if (path.prio !== null) {
    const label = path.prio === -1 ? t("folderNoPrio") : priorities.find((x) => x.id === path.prio)?.name;
    if (label) crumbs.push({ key: "prio", label });
  }
  if (path.st !== null) {
    const label = path.st === -1 ? t("folderNoStatus") : statuses.find((x) => x.id === path.st)?.name;
    if (label) crumbs.push({ key: "st", label });
  }

  const goCrumb = (key: "root" | "app" | "cat" | "prio" | "st") => {
    if (key === "st") return; // last segment = current folder, not clickable
    setPath((p) =>
      key === "root"
        ? { app: null, cat: null, prio: null, st: null }
        : key === "app"
          ? { app: p.app, cat: null, prio: null, st: null }
          : key === "cat"
            ? { app: p.app, cat: p.cat, prio: null, st: null }
            : { app: p.app, cat: p.cat, prio: p.prio, st: null },
    );
  };

  /**
   * The trail replaces the Navbar's page title — but only **after drilling**
   * (2+ crumbs). At the folder root `crumbs.length === 1`, so we hand the slot
   * back to the Navbar's default title ("บอร์ด") — same as before. The Kanban/
   * table views have no folder path at all and keep that title too.
   * `nowrap` + `overflow: hidden` keep a long path from growing the AppBar row.
   */
  const header = isFolderView && crumbs.length > 1 ? (
    <Box
      aria-label={t("folderView")}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        flexWrap: "nowrap",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      {crumbs.map((c, i) => (
        <Box
          key={c.key}
          component="span"
          sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, minWidth: 0, overflow: "hidden" }}
        >
          {i > 0 && (
            <Typography component="span" sx={{ color: "text.disabled", flexShrink: 0 }}>
              ›
            </Typography>
          )}
          {i === crumbs.length - 1 ? (
            <Typography component="span" fontWeight={700} noWrap sx={{ minWidth: 0 }}>
              {c.label}
            </Typography>
          ) : (
            <Typography
              component="button"
              type="button"
              onClick={() => goCrumb(c.key)}
              sx={{
                border: "none",
                background: "none",
                p: 0,
                font: "inherit",
                cursor: "pointer",
                color: "text.secondary",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
                "&:hover": { color: "primary.main", textDecoration: "underline" },
              }}
            >
              {c.label}
            </Typography>
          )}
        </Box>
      ))}
    </Box>
  ) : undefined;

  const toolbar = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <TextField
          size="small"
          placeholder={t("searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ flexGrow: 1, maxWidth: 480, minWidth: 200 }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} />,
          }}
          // Without `autoComplete: "off"` the password manager dumps its saved
          // username (the account's first e-mail) into this box when the
          // profile dialog's password field is autofilled — the table then
          // filters to nothing and only a refresh clears it.
          inputProps={{ autoComplete: "off", name: "board-search" }}
        />
        <Box
          className="board-toolbar-icons"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            ml: "auto",
          }}
        >
          {!isCustomer && (
            <>
              <Tooltip title={t("board")}>
                <IconButton
                  size="small"
                  onClick={() => setChosenView("board")}
                  sx={{
                    width: 36,
                    height: 36,
                    color: isBoardView ? "primary.contrastText" : "text.secondary",
                    bgcolor: isBoardView ? "primary.main" : "transparent",
                    "&:hover": { bgcolor: isBoardView ? "primary.dark" : "action.hover" },
                  }}
                >
                  <ViewKanbanIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("table")}>
                <IconButton
                  size="small"
                  onClick={() => setChosenView("table")}
                  sx={{
                    width: 36,
                    height: 36,
                    color: isTableView ? "primary.contrastText" : "text.secondary",
                    bgcolor: isTableView ? "primary.main" : "transparent",
                    "&:hover": { bgcolor: isTableView ? "primary.dark" : "action.hover" },
                  }}
                >
                  <TableChartIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={t("folderView")}>
                <IconButton
                  size="small"
                  aria-label={t("folderView")}
                  onClick={() => setChosenView("folder")}
                  sx={{
                    width: 36,
                    height: 36,
                    color: isFolderView ? "primary.contrastText" : "text.secondary",
                    bgcolor: isFolderView ? "primary.main" : "transparent",
                    "&:hover": { bgcolor: isFolderView ? "primary.dark" : "action.hover" },
                  }}
                >
                  <FolderIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          {/* Flips the ORDER of whatever view is on: the Kanban columns'
              "newest entry on top" (desc) ↔ "longest-sitting on top" (asc) —
              the stale rules' targets float up in asc — and the very same
              arrow flips the table's rows and the folder grid's chosen
              criterion (`sortByEnteredAt`, so board/table/folder always
              agree). Shown for EVERY role (customers live in the table) and
              ALWAYS visible — the earlier hover-to-reveal hid it from anyone
              who did not already know it existed (and `pointerEvents: none`
              suppressed its tooltip too, so nothing could reveal it). The
              tooltip/aria-label spell out the CURRENT direction
              (`cardOrderNewest`/`cardOrderOldest`, th+en) and the glyph's
              rotation mirrors it. Folder view is the exception: its sort
              dropdown owns the direction there (arrow in the closed box +
              the two direction items in the menu), so this button is simply
              not rendered in that view. */}
          {!isFolderView && (
            <Tooltip
              title={cardOrder === "desc" ? t("cardOrderNewest") : t("cardOrderOldest")}
            >
              <IconButton
                size="small"
                aria-label={cardOrder === "desc" ? t("cardOrderNewest") : t("cardOrderOldest")}
                onClick={toggleCardOrder}
                sx={{ width: 36, height: 36, color: "text.secondary" }}
              >
                <SwapVertIcon
                  fontSize="small"
                  sx={{
                    // the glyph points the way the list reads: ↓ newest
                    // first (default), ↑ oldest first after the flip
                    transform: cardOrder === "asc" ? "rotate(180deg)" : "none",
                    transition: "transform 150ms ease-in-out",
                  }}
                />
              </IconButton>
            </Tooltip>
          )}
          {can("issue.trash.view") && (
            <Tooltip title={t("recycleBin")}>
              <IconButton
                size="small"
                onClick={() => setRecycleBinOpen(true)}
                sx={{ width: 36, height: 36 }}
              >
                <RestoreFromTrashIcon sx={{ fontSize: 20, color: "text.secondary" }} />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={t("filter.label")}>
            <Badge
              badgeContent={filterCount}
              max={99}
              overlap="circular"
              sx={{
                "& .MuiBadge-badge": {
                  minWidth: 16,
                  height: 16,
                  px: 0.4,
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1,
                  bgcolor: "primary.contrastText",
                  color: "primary.main",
                  top: 4,
                  right: 4,
                },
              }}
            >
              <IconButton
                size="small"
                onClick={(event) => setFilterAnchor(event.currentTarget)}
                aria-haspopup="dialog"
                aria-expanded={Boolean(filterAnchor)}
                sx={{
                  width: 36,
                  height: 36,
                  color: filterCount > 0 ? "primary.contrastText" : "text.secondary",
                  bgcolor: filterCount > 0 ? "primary.main" : "transparent",
                  "&:hover": {
                    bgcolor: filterCount > 0 ? "primary.dark" : "action.hover",
                  },
                }}
              >
                <FilterListIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Badge>
          </Tooltip>
        </Box>
      </Box>

      {filterCount > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
          {activeFilterChips.map((chip) => (
            <Chip
              key={chip.key}
              size="small"
              variant="outlined"
              label={chip.label}
              icon={chip.icon}
              avatar={chip.avatar}
              onDelete={chip.onDelete}
              deleteIcon={<CloseIcon sx={{ fontSize: 14 }} />}
              sx={{
                borderColor: chip.color ?? "divider",
                fontWeight: 600,
                "&:hover": { bgcolor: "action.hover" },
              }}
            />
          ))}
          <Button
            size="small"
            onClick={handleClearAllFilters}
            startIcon={<DeleteOutlineIcon fontSize="small" />}
            sx={{
              ml: 0.5,
              textTransform: "none",
              fontWeight: 600,
              color: "text.secondary",
            }}
          >
            {t("filter.clearAll")}
          </Button>
        </Box>
      )}
    </Box>
  );

  return (
    <RequirePermission permission="board.view">
      <DashboardLayout header={header}>
        <Box sx={{ pb: 2 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            isFolderView ? (
              <FolderView
                statuses={statuses}
                issues={issues}
                labels={labels}
                apps={apps}
                categories={categories}
                priorities={priorities}
                path={path}
                setPath={setPath}
                selectedStatusIds={selectedStatusIds}
                selectedPriorityIds={selectedPriorityIds}
                selectedCategoryIds={selectedCategoryIds}
                selectedAppIds={selectedAppIds}
                companyReporterIds={companyReporterIds}
                selectedAssigneeIds={selectedAssigneeIds}
                selectedReporterIds={selectedReporterIds}
                searchQuery={searchQuery}
                canEdit={canEdit}
                canSeeReporter={canSeeReporter}
                staleRules={staleRules}
                hideStaleRules={hideStaleRules}
                onRefresh={() => loadData(false)}
                cardOrder={cardOrder}
                onToggleCardOrder={toggleCardOrder}
                toolbar={toolbar}
              />
            ) : isBoardView ? (
              <KanbanView
                statuses={statuses}
                labels={labels}
                priorities={priorities}
                categories={categories}
                users={users}
                selectedStatusIds={selectedStatusIds}
                selectedPriorityIds={selectedPriorityIds}
                selectedCategoryIds={selectedCategoryIds}
                selectedAppIds={selectedAppIds}
                selectedCompanyIds={selectedCompanyIds}
                selectedAssigneeIds={selectedAssigneeIds}
                selectedReporterIds={selectedReporterIds}
                searchQuery={searchQuery}
                canManage={canManage}
                canEdit={canEdit}
                canDelete={canDelete}
                canUnlockIssue={canUnlockIssue}
                timers={timers}
                showTime={canSeeTime}
                onRefresh={() => loadData(false)}
                roleName={roleName}
                stepOnlyMoves={stepOnlyMoves}
                taskTypeGateIds={taskTypeGateIds}
                staleRules={staleRules}
                cardOrder={cardOrder}
                toolbar={toolbar}
              />
            ) : (
              <TableView
                statuses={statuses}
                issues={issues}
                labels={labels}
                priorities={priorities}
                categories={categories}
                selectedStatusIds={selectedStatusIds}
                selectedPriorityIds={selectedPriorityIds}
                selectedCategoryIds={selectedCategoryIds}
                selectedAppIds={selectedAppIds}
                companyReporterIds={companyReporterIds}
                selectedAssigneeIds={selectedAssigneeIds}
                selectedReporterIds={selectedReporterIds}
                searchQuery={searchQuery}
                canManage={canManage}
                canEdit={canEdit}
                canSeeReporter={canSeeReporter}
                canViewOwnHistory={canViewOwnHistory}
                timers={timers}
                canSeeTrackedTime={canSeeTime}
                canSeeActualTime={canSeeActualTime}
                currentUserId={currentUserId}
                onRefresh={() => loadData(false)}
                cardOrder={cardOrder}
                toolbar={toolbar}
              />
            ))}

          <BoardFilterPanel
            open={Boolean(filterAnchor)}
            anchorEl={filterAnchor}
            statuses={statuses}
            priorities={priorities}
            categories={categories}
            apps={apps}
            companies={companies}
            users={users}
            selectedStatusIds={selectedStatusIds}
            selectedPriorityIds={selectedPriorityIds}
            selectedCategoryIds={selectedCategoryIds}
            selectedAppIds={selectedAppIds}
            selectedCompanyIds={selectedCompanyIds}
            selectedAssigneeIds={selectedAssigneeIds}
            selectedReporterIds={selectedReporterIds}
            isCustomer={isCustomer}
            onToggleStatus={handleToggleStatusFilter}
            onTogglePriority={handleTogglePriorityFilter}
            onToggleCategory={handleToggleCategoryFilter}
            onToggleApp={handleToggleAppFilter}
            onToggleCompany={handleToggleCompanyFilter}
            onToggleAssignee={handleToggleAssigneeFilter}
            onToggleReporter={handleToggleReporterFilter}
            onClearAll={handleClearAllFilters}
            onClose={() => setFilterAnchor(null)}
          />
          <RecycleBinDialog
            open={recycleBinOpen}
            onClose={() => setRecycleBinOpen(false)}
            onRestored={loadData}
            onViewDetail={(issue) => {
              setRecycleBinOpen(false);
              setTrashDetailIssue(issue);
            }}
          />
          <IssueDetailDialog
            issue={trashDetailIssue}
            open={!!trashDetailIssue}
            onClose={() => setTrashDetailIssue(null)}
            statuses={statuses}
            labels={labels}
            onRefresh={() => {}}
            readOnly={!!trashDetailIssue}
            onRestore={async (id) => {
              try {
                await restoreIssue(id);
                setTrashDetailIssue(null);
                setRecycleBinOpen(true);
                loadData();
              } catch {
                // keep dialog open on failure
              }
            }}
          />
          <IssueDetailDialog
            issue={deepLinkIssue}
            open={!!deepLinkIssue}
            onClose={() => {
              setDeepLinkIssue(null);
              // drop ?issue= so refreshing the page doesn't reopen the dialog
              if (issueParam) router.replace("/boards");
            }}
            statuses={statuses}
            labels={labels}
            onRefresh={() => loadData(false)}
          />
        </Box>

      </DashboardLayout>
    </RequirePermission>
  );
}

export default function BoardsPage() {
  // `useSearchParams` must sit under a Suspense boundary on statically
  // rendered pages — the same pattern the login page uses.
  return (
    <Suspense fallback={null}>
      <BoardsPageInner />
    </Suspense>
  );
}
