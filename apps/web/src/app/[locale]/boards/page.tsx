"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box,
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
  useTheme,
  type Theme,
  Checkbox,
  FormControlLabel,
  Popover,
  ToggleButton,
  ToggleButtonGroup,
  ClickAwayListener,
  ListItemButton,
  List,
  ListItem,
} from "@mui/material";
import {
  DndContext,
  DragOverlay,
  closestCorners,
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
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import HistoryIcon from "@mui/icons-material/History";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SearchIcon from "@mui/icons-material/Search";
import CategoryIcon from "@mui/icons-material/Category";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import CancelIcon from "@mui/icons-material/Cancel";
import SendIcon from "@mui/icons-material/Send";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import PersonIcon from "@mui/icons-material/Person";
import FilterListIcon from "@mui/icons-material/FilterList";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RestoreFromTrashIcon from "@mui/icons-material/RestoreFromTrash";
import { useTranslations } from "next-intl";
import { usePermissions } from "@/lib/permissions";
import { useAuthStore } from "@/lib/auth-store";
import { apiFetch, isApiError } from "@/lib/api";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import {
  fetchColumns,
  createColumn,
  createColumnWithStatus,
  updateColumn,
  unlockColumn,
  deleteColumn,
  reorderColumns,
  fetchIssues,
  createIssue,
  moveIssue,
  assignIssue,
  deleteIssue,
  unlockIssue,
  updateIssue,
  fetchIssueActivity,
  fetchIssueComments,
  fetchStatuses,
  fetchPriorities,
  fetchUsers,
  createComment,
  uploadAttachment,
  type BoardColumn,
  type BoardIssue,
  type ActivityLog,
  type Comment,
  type IssueStatus,
  type IssuePriority,
  type UserSummary,
  type TrashedIssue,
  fetchTrashedIssues,
  restoreIssue,
} from "@/lib/board-api";
import { fetchLabels, createLabel, updateLabel, type Label } from "@/lib/labels-api";
import { Pagination } from "@/components/pagination";

function getErrorMessage(e: unknown, fallback: string): string | null {
  if (isApiError(e, 403)) return null;
  return e instanceof Error ? e.message : fallback;
}

const PRIORITY_COLORS: Record<string, "error" | "warning" | "success" | "default"> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "success",
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

function getColumnColor(status: string, theme: any): string {
  const key = status.toLowerCase();
  return theme.custom.columnColors[key] ?? theme.custom.columnColors.default;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "วันนี้";
  if (diffDays === 1) return "เมื่อวาน";
  if (diffDays < 7) return `${diffDays} วัน`;
  return date.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })} ${date.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`;
}

const FIELD_LABELS: Record<string, string> = {
  title: "หัวข้อ",
  description: "คำอธิบาย",
  priority: "ความสำคัญ",
  priorityId: "ความสำคัญ",
  category: "หมวดหมู่",
  label: "ป้าย",
  labels: "ป้าย",
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

const COLOR_MAP: Record<string, string> = {
  green: "#4caf50",
  red: "#f44336",
  yellow: "#ffeb3b",
  blue: "#2196f3",
  purple: "#9c27b0",
  orange: "#ff9800",
  pink: "#e91e63",
  gray: "#9e9e9e",
  default: "#9e9e9e",
};

const LABEL_COLORS = Object.keys(COLOR_MAP).filter((c) => c !== "default");

function labelContrast(color: string, theme: Theme): string {
  return theme.palette.getContrastText(COLOR_MAP[color] ?? theme.palette.grey[400]);
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

function TrelloCard({
  issue,
  canManage = false,
  canEdit = false,
  canDelete = false,
  canUnlockIssue = false,
  onOpen,
  onEdit,
  onDelete,
  onViewActivity,
  onUnlock,
}: {
  issue: BoardIssue;
  canManage?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canUnlockIssue?: boolean;
  onOpen?: (issue: BoardIssue) => void;
  onEdit?: (issue: BoardIssue) => void;
  onDelete?: (issue: BoardIssue) => void;
  onViewActivity?: (issue: BoardIssue) => void;
  onUnlock?: (issue: BoardIssue) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id, disabled: issue.isLocked });

  const theme = useTheme();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const priorityColor = issue.priorityName
    ? PRIORITY_COLORS[issue.priorityName.toLowerCase()] ?? "default"
    : "default";

  const labelBgColor = COLOR_MAP[issue.labelColor ?? "default"] ?? issue.labelColor ?? theme.palette.grey[400];
  const labelTextColor = theme.palette.getContrastText(labelBgColor);

  const avatarChar = issue.programmerName
    ? issue.programmerName.charAt(0).toUpperCase()
    : null;

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(canManage && !issue.isLocked ? listeners : {})}
      onClick={() => {
        if (!issue.isLocked) onOpen?.(issue);
      }}
      elevation={1}
      sx={{
        p: 1.5,
        mb: 1,
        cursor: issue.isLocked ? "not-allowed" : canManage ? "grab" : "pointer",
        "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.12)" },
        bgcolor: "background.paper",
        borderRadius: 1.5,
        border: "none",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
        <Typography variant="caption" color="primary.main" fontWeight={700} sx={{ letterSpacing: 0.3 }}>
          ISS-{String(issue.id).padStart(3, "0")}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {issue.priorityName && (
            <Chip
              label={PRIORITY_LABELS[issue.priorityName.toLowerCase()] ?? issue.priorityName}
              size="small"
              color={priorityColor}
              sx={{ height: 18, fontSize: "0.65rem", fontWeight: 600 }}
            />
          )}
          {issue.labelName && (
            <Chip
              label={issue.labelName}
              size="small"
              sx={{
                height: 18,
                fontSize: "0.65rem",
                fontWeight: 600,
                bgcolor: labelBgColor,
                color: labelTextColor,
                opacity: 0.2,
              }}
            />
          )}
          {(canEdit || canDelete || canUnlockIssue) && (
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }}
              sx={{ p: 0.3 }}
            >
              <MoreVertIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            </IconButton>
          )}
        </Box>
      </Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.25, lineHeight: 1.4 }}>
        {issue.title}
      </Typography>
      {issue.description && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            mb: 0.5,
            lineHeight: 1.4,
          }}
        >
          {issue.description}
        </Typography>
      )}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 0.75 }}>
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
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {canEdit && (
          <MenuItem onClick={() => { setMenuAnchor(null); onEdit?.(issue); }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            <ListItemText>แก้ไข</ListItemText>
          </MenuItem>
        )}
        {canEdit && (
          <MenuItem onClick={() => { setMenuAnchor(null); onViewActivity?.(issue); }}>
            <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
            <ListItemText>ประวัติ</ListItemText>
          </MenuItem>
        )}
        {issue.isLocked && canUnlockIssue && (
          <MenuItem onClick={() => { setMenuAnchor(null); onUnlock?.(issue); }}>
            <ListItemIcon><LockOpenIcon fontSize="small" color="warning" /></ListItemIcon>
            <ListItemText sx={{ color: "warning.main" }}>ปลดล็อก</ListItemText>
          </MenuItem>
        )}
        {canDelete && (
          <MenuItem onClick={() => { setMenuAnchor(null); onDelete?.(issue); }}>
            <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText sx={{ color: "error.main" }}>ลบ</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Paper>
  );
}

function KanbanColumn({
  column,
  issues,
  showAll,
  canManage,
  canEdit,
  canDelete,
  canUnlockIssue,
  canUnlockColumn,
  isDropTarget,
  roleName,
  onOpenIssue,
  onEditIssue,
  onDeleteIssue,
  onViewActivity,
  onDeleteColumn,
  onUnlockColumn,
  onUnlockIssue,
}: {
  column: BoardColumn;
  issues: BoardIssue[];
  showAll: boolean;
  canManage: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUnlockIssue: boolean;
  canUnlockColumn: boolean;
  isDropTarget: boolean;
  roleName: string;
  onOpenIssue: (issue: BoardIssue) => void;
  onEditIssue: (issue: BoardIssue) => void;
  onDeleteIssue: (issue: BoardIssue) => void;
  onViewActivity: (issue: BoardIssue) => void;
  onDeleteColumn: (columnId: number) => void;
  onUnlockColumn: (columnId: number) => void;
  onUnlockIssue: (issueId: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setColumnNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: "column" }, disabled: column.isLocked });
  const { setNodeRef: setDroppableNodeRef, isOver: isColumnOver } = useDroppable({
    id: `column-drop-${column.id}`,
    data: { type: "column-drop", columnId: column.id },
  });

  const theme = useTheme();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const color = getColumnColor(column.statusName, theme);
  const sorted = [...issues].sort((a, b) => b.id - a.id);
  const visibleIssues = showAll ? sorted : sorted.slice(0, 10);

  return (
    <Box
      ref={setColumnNodeRef}
      style={style}
      {...attributes}
      {...(canManage && !column.isLocked ? listeners : {})}
      sx={{
        width: 240,
        minWidth: 240,
        bgcolor: isDropTarget ? "primary.50" : "grey.50",
        borderRadius: 2,
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        maxHeight: "calc(100vh - 200px)",
        border: isDropTarget ? "2px solid" : "1px solid",
        borderColor: isDropTarget ? "primary.main" : theme.palette.divider,
        transition: "background-color 0.15s ease, border-color 0.15s ease",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }} />
          <Typography variant="caption" fontWeight={700} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            {column.customName ?? column.statusName}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            {issues.length}
          </Typography>
          {!showAll && issues.length > 10 && (
            <Typography variant="caption" color="text.disabled">
              · แสดง 10 ล่าสุด
            </Typography>
          )}
          {canManage && (
            <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ p: 0.3 }}>
              <MoreHorizIcon sx={{ fontSize: 16, color: "text.secondary" }} />
            </IconButton>
          )}
        </Box>
      </Box>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        {column.isLocked && canUnlockColumn && (
          <MenuItem onClick={() => { setMenuAnchor(null); onUnlockColumn(column.id); }}>
            <ListItemIcon><LockOpenIcon fontSize="small" color="warning" /></ListItemIcon>
            <ListItemText sx={{ color: "warning.main" }}>ปลดล็อกคอลัมน์</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { setMenuAnchor(null); onDeleteColumn(column.id); }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: "error.main" }}>ลบคอลัมน์</ListItemText>
        </MenuItem>
      </Menu>
      <SortableContext items={visibleIssues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <Box
          ref={setDroppableNodeRef}
          data-column-drop-id={column.id}
          sx={{
            flexGrow: 1,
            overflowY: "auto",
            minHeight: isDropTarget ? 120 : 80,
            transition: "min-height 0.2s ease",
          }}
        >
          {visibleIssues.map((issue) => (
            <TrelloCard
              key={issue.id}
              issue={issue}
              canManage={canManage}
              canEdit={canEdit}
              canDelete={canDelete && (roleName !== "customer" || column.statusName.toLowerCase() === "backlog")}
              canUnlockIssue={canUnlockIssue}
              onOpen={onOpenIssue}
              onEdit={onEditIssue}
              onDelete={onDeleteIssue}
              onViewActivity={onViewActivity}
              onUnlock={(iss) => onUnlockIssue(iss.id)}
            />
          ))}
          {issues.length === 0 && (
            <Box
              sx={{
                py: 3,
                textAlign: "center",
                border: isDropTarget ? "2px dashed" : "1px dashed",
                borderColor: isDropTarget ? "primary.main" : "divider",
                borderRadius: 1.5,
                transition: "border-color 0.15s ease",
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
}: {
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const t = useTranslations("Boards");
  const [items, setItems] = useState<TrashedIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetchTrashedIssues()
      .then(setItems)
      .catch((e) => setError(getErrorMessage(e, "โหลดข้อมูลไม่สำเร็จ")))
      .finally(() => setLoading(false));
  }, [open]);

  const handleRestore = async (id: number) => {
    setRestoringId(id);
    setError(null);
    try {
      await restoreIssue(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      onRestored();
    } catch (e) {
      setError(getErrorMessage(e, "กู้คืนไม่สำเร็จ"));
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <DeleteOutlineIcon color="error" />
        {t("recycleBin")}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4 }}>
            <DeleteOutlineIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
            <Typography color="text.secondary">{t("noTrashItems")}</Typography>
          </Box>
        ) : (
          <List>
            {items.map((item, idx) => (
              <Box key={item.id}>
                <ListItem
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
                  <ListItemText
                    primary={
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="caption" color="primary.main" fontWeight={700}>
                          ISS-{String(item.id).padStart(3, "0")}
                        </Typography>
                        <Typography variant="subtitle2" fontWeight={700} noWrap>
                          {item.title}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary">
                        {item.deletedByName ?? "—"} · {formatDateTime(item.deletedAt)}
                      </Typography>
                    }
                  />
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

function ActivityLogDialog({
  issue,
  open,
  onClose,
}: {
  issue: BoardIssue | null;
  open: boolean;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!issue || !open) return;
    setLoading(true);
    fetchIssueActivity(issue.id)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [issue, open]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>ประวัติ: {issue?.title}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
            <CircularProgress />
          </Box>
        ) : logs.length === 0 ? (
          <Typography color="text.secondary">ยังไม่มีประวัติ</Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {logs.map((log) => (
              <Box key={log.id} sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 60 }}>
                  {new Date(log.createdAt).toLocaleTimeString("th-TH", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Typography>
                <Typography variant="body2">{formatActivityAction(log)}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ปิด</Button>
      </DialogActions>
    </Dialog>
  );
}

function IssueDialog({
  issue,
  columnId,
  open,
  onClose,
  onSave,
  labels,
}: {
  issue: BoardIssue | null;
  columnId: number | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description: string; columnId: number; labelId?: number | null }) => void;
  labels: Label[];
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [colId, setColId] = useState<number | null>(null);
  const [labelId, setLabelId] = useState<number | "">("");

  useEffect(() => {
    if (open) {
      setTitle(issue?.title ?? "");
      setDescription(issue?.description ?? "");
      setColId(issue?.columnId ?? columnId);
      setLabelId(issue?.labelId ?? "");
    }
  }, [open, issue, columnId]);

  const handleSave = () => {
    if (!title.trim() || !colId) return;
    onSave({ title: title.trim(), description: description.trim(), columnId: colId, labelId: labelId === "" ? null : labelId });
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

function IssueDetailDialog({
  issue,
  open,
  onClose,
  columns,
  labels,
  onRefresh,
  onEdit,
  onDelete,
}: {
  issue: BoardIssue | null;
  open: boolean;
  onClose: () => void;
  columns: BoardColumn[];
  labels: Label[];
  onRefresh: () => void;
  onEdit: (issue: BoardIssue) => void;
  onDelete: (issue: BoardIssue) => void;
}) {
  const { can } = usePermissions();
  const [tab, setTab] = useState<"comments" | "history">("comments");
  const [comments, setComments] = useState<Comment[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localIssue, setLocalIssue] = useState<BoardIssue | null>(null);
  const [priorities, setPriorities] = useState<IssuePriority[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [priorityAnchor, setPriorityAnchor] = useState<HTMLElement | null>(null);
  const [labelAnchor, setLabelAnchor] = useState<HTMLElement | null>(null);
  const [memberAnchor, setMemberAnchor] = useState<HTMLElement | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [labelSearch, setLabelSearch] = useState("");
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("default");
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [saving, setSaving] = useState(false);

  const canViewComments = can("comment.view");
  const canPostComment = can("comment.create");
  const canViewHistory = can("issue.detail.view");
  const canEditIssue = can("issue.all.update");
  const canDeleteIssue = can("issue.delete");
  const canSetPriority = can("priority.view") && canEditIssue;
  const canSetLabels = can("label.view") && canEditIssue;
  const canCreateLabel = can("label.create");
  const canEditLabel = can("label.update");
  const canAssign = can("user.view") && can("issue.assign");

  useEffect(() => {
    setLocalIssue(issue);
  }, [issue]);

  useEffect(() => {
    if (!issue || !open) return;
    setLoading(true);
    setError(null);
    Promise.all([
      canViewComments ? fetchIssueComments(issue.id).then((r) => r.data) : Promise.resolve([] as Comment[]),
      canViewHistory ? fetchIssueActivity(issue.id) : Promise.resolve([] as ActivityLog[]),
      canSetPriority
        ? fetchPriorities().then((r) => r.data)
        : Promise.resolve([] as IssuePriority[]),
      canAssign
        ? fetchUsers().then((r) => r.data)
        : Promise.resolve([] as UserSummary[]),
    ])
      .then(([c, l, p, u]) => {
        setComments(c);
        setLogs(l);
        setPriorities(p);
        setUsers(u);
      })
      .catch((e) => setError(getErrorMessage(e, "โหลดข้อมูลไม่สำเร็จ")))
      .finally(() => setLoading(false));
  }, [issue, open, canViewComments, canViewHistory, canSetPriority, canAssign]);

  const handlePost = async () => {
    const content = draft.trim();
    if (!content || !localIssue) return;
    setPosting(true);
    try {
      const comment = await createComment(localIssue.id, content);
      setComments((prev) => [...prev, comment]);
      setDraft("");
    } catch (e) {
      setError(getErrorMessage(e, "ส่งความคิดเห็นไม่สำเร็จ"));
    } finally {
      setPosting(false);
    }
  };

  const applyUpdate = async (data: { priorityId?: number; labelIds?: number[] }) => {
    if (!localIssue) return;
    setSaving(true);
    try {
      const updated = await updateIssue(localIssue.id, data);
      setLocalIssue(updated);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "บันทึกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  const handleSetPriority = async (priorityId: number | null) => {
    setPriorityAnchor(null);
    await applyUpdate({ priorityId: priorityId ?? undefined });
  };

  const handleAssign = async (programmerId: number | null) => {
    setMemberAnchor(null);
    setMemberSearch("");
    if (!localIssue) return;
    setSaving(true);
    try {
      const updated = await assignIssue(localIssue.id, programmerId);
      setLocalIssue(updated);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "มอบหมายไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  const selectedLabelIds = localIssue?.labelIds ?? [];

  const selectedLabels = labels.filter((l) => selectedLabelIds.includes(l.id));

  const handleToggleLabel = async (labelId: number) => {
    const next = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((id) => id !== labelId)
      : [...selectedLabelIds, labelId];
    await applyUpdate({ labelIds: next });
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
      await applyUpdate({ labelIds: [...selectedLabelIds, label.id] });
    } catch (e) {
      setError(getErrorMessage(e, "สร้ายป้ายไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLabel = async (id: number, data: { name: string; color: string }) => {
    setEditingLabel(null);
    try {
      await updateLabel(id, data);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "แก้ไขป้ายไม่สำเร็จ"));
    }
  };

  const theme = useTheme();
  const current = localIssue;
  const column = current?.columnId ? columns.find((c) => c.id === current.columnId) : null;
  const columnName = column ? (column.customName ?? column.statusName) : null;
  const columnColor = getColumnColor(columnName ?? "", theme);
  const categoryName = current?.categoryName ?? current?.customCategory ?? "—";
  const programmers = users.filter((u) => u.isActive && u.roleName === "programmer");
  const member = current?.programmerId
    ? programmers.find((u) => Number(u.id) === current.programmerId) ?? null
    : null;
  const visibleProgrammers = programmers.filter(
    (u) =>
      u.id !== member?.id &&
      u.name.toLowerCase().includes(memberSearch.trim().toLowerCase()),
  );
  const visibleLabels = labels.filter((l) =>
    l.name.toLowerCase().includes(labelSearch.trim().toLowerCase()),
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, maxHeight: "88vh", display: "flex", flexDirection: "column" } }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2.5, pt: 2, pb: 1 }}>
        {columnName && (
          <Chip
            label={columnName}
            size="small"
            sx={{
              bgcolor: `${columnColor}20`,
              color: columnColor,
              fontWeight: 700,
              fontSize: "0.75rem",
            }}
          />
        )}
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1, lineHeight: 1.3 }}>
          {current?.title}
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Divider />
      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Box
          sx={{
            flex: 1.15,
            p: 2.5,
            overflowY: "auto",
            borderRight: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Box>
            <Typography
              variant="body2"
              sx={{ whiteSpace: "pre-wrap", color: current?.description ? "text.primary" : "text.secondary" }}
            >
              {current?.description || "เพิ่มคำอธิบายโดยละเอียด..."}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>หมวดหมู่</Typography>
              <Typography variant="body2">{categoryName}</Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>ความสำคัญ</Typography>
              {canSetPriority ? (
                <Button
                  size="small"
                  variant={current?.priorityName ? "contained" : "outlined"}
                  disabled={saving}
                  endIcon={<ArrowDropDownIcon />}
                  onClick={(e) => setPriorityAnchor(e.currentTarget)}
                  sx={{ textTransform: "none", justifyContent: "flex-start", fontWeight: 600 }}
                >
                  {current?.priorityName
                    ? PRIORITY_LABELS[current.priorityName.toLowerCase()] ?? current.priorityName
                    : "เลือกความสำคัญ"}
                </Button>
              ) : current?.priorityName ? (
                <Chip
                  label={PRIORITY_LABELS[current.priorityName.toLowerCase()] ?? current.priorityName}
                  size="small"
                  color={PRIORITY_COLORS[current.priorityName.toLowerCase()] ?? "default"}
                  sx={{ fontSize: "0.7rem", fontWeight: 600 }}
                />
              ) : (
                <Typography variant="body2">—</Typography>
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90, pt: 0.75 }}>ป้าย</Typography>
              {canSetLabels ? (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center" }}>
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
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        bgcolor: COLOR_MAP[l.color] ?? l.color,
                        color: labelContrast(l.color, theme),
                      }}
                    />
                  ))}
                  {selectedLabels.length === 0 && !current?.labelName && (
                    <Typography variant="caption" color="text.secondary">เพิ่มป้าย</Typography>
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
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    bgcolor: COLOR_MAP[current.labelColor ?? "default"] ?? current.labelColor ?? undefined,
                    color: labelContrast(current.labelColor ?? "default", theme),
                  }}
                />
              ) : (
                <Typography variant="body2">—</Typography>
              )}
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>สมาชิก</Typography>
              {canAssign ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {member ? (
                    <Chip
                      size="small"
                      disabled={saving}
                      avatar={
                        <Avatar
                          sx={{
                            width: 20,
                            height: 20,
                            fontSize: "0.65rem",
                            fontWeight: 700,
                            bgcolor: "primary.main",
                            color: "primary.contrastText",
                          }}
                        >
                          {member.name.charAt(0).toUpperCase()}
                        </Avatar>
                      }
                      label={member.name}
                      onDelete={() => handleAssign(null)}
                      sx={{ fontWeight: 600 }}
                    />
                  ) : (
                    <Chip label="รอมอบหมาย" size="small" variant="outlined" />
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
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Avatar
                    sx={{
                      width: 24,
                      height: 24,
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      bgcolor: current?.programmerName ? "primary.main" : theme.palette.grey[300],
                      color: current?.programmerName ? "primary.contrastText" : theme.palette.grey[600],
                    }}
                  >
                    {current?.programmerName ? current.programmerName.charAt(0).toUpperCase() : <PersonIcon sx={{ fontSize: 15 }} />}
                  </Avatar>
                  <Typography variant="body2">{current?.programmerName ?? "รอมอบหมาย"}</Typography>
                </Box>
              )}
            </Box>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>ผู้แจ้ง</Typography>
              <Typography variant="body2">{current?.customerName ?? "—"}</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>สร้างเมื่อ</Typography>
              <Typography variant="body2">{current ? formatDateTime(current.createdAt) : "—"}</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>อัปเดตล่าสุด</Typography>
              <Typography variant="body2">{current ? formatDateTime(current.updatedAt) : "—"}</Typography>
            </Box>
          </Box>
          <Box sx={{ display: "flex", gap: 1, mt: "auto", pt: 1 }}>
            {canEditIssue && (
              <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => current && onEdit(current)}>
                แก้ไข
              </Button>
            )}
            <Button size="small" variant="outlined" startIcon={<HistoryIcon />} onClick={() => setTab("history")}>
              ประวัติ
            </Button>
            {canDeleteIssue && (
              <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => current && onDelete(current)}>
                ลบ
              </Button>
            )}
          </Box>
          <Popover
            open={Boolean(priorityAnchor)}
            anchorEl={priorityAnchor}
            onClose={() => setPriorityAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            PaperProps={{ sx: { p: 1.5, display: "flex", flexWrap: "wrap", gap: 0.5, maxWidth: 280 } }}
          >
            {priorities
              .filter((p) => p.isActive)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((p) => (
                <Chip
                  key={p.id}
                  label={PRIORITY_LABELS[p.name.toLowerCase()] ?? p.name}
                  size="small"
                  color={PRIORITY_COLORS[p.name.toLowerCase()] ?? "default"}
                  variant={current?.priorityId === p.id ? "filled" : "outlined"}
                  disabled={saving}
                  onClick={() => handleSetPriority(p.id)}
                  sx={{ fontWeight: 600 }}
                />
              ))}
            {current?.priorityId && (
              <Button size="small" disabled={saving} onClick={() => handleSetPriority(null)}>
                ล้าง
              </Button>
            )}
          </Popover>
          <Popover
            open={Boolean(labelAnchor)}
            anchorEl={labelAnchor}
            onClose={() => setLabelAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            PaperProps={{ sx: { width: 300, p: 1.5, display: "flex", flexDirection: "column", gap: 1 } }}
          >
            <TextField
              size="small"
              placeholder="ค้นหาป้าย..."
              value={labelSearch}
              onChange={(e) => setLabelSearch(e.target.value)}
              autoFocus
            />
            <Box sx={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0.25 }}>
              {visibleLabels.length === 0 ? (
                <Typography variant="caption" color="text.secondary">ไม่พบป้าย</Typography>
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
                        flex: 1,
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        bgcolor: COLOR_MAP[l.color] ?? l.color,
                        color: labelContrast(l.color, theme),
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
                    placeholder="ชื่อป้ายใหม่"
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    fullWidth
                  />
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {LABEL_COLORS.map((c) => (
                      <Box
                        key={c}
                        onClick={() => setNewLabelColor(c)}
                        title={c}
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: "50%",
                          bgcolor: COLOR_MAP[c],
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
                      สร้างและใส่ป้าย
                    </Button>
                    <Button size="small" disabled={saving} onClick={() => setCreatingLabel(false)}>
                      ยกเลิก
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
                  สร้ายป้ายใหม่
                </Button>
              ))}
          </Popover>
          <Popover
            open={Boolean(memberAnchor)}
            anchorEl={memberAnchor}
            onClose={() => setMemberAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            PaperProps={{ sx: { width: 280, p: 1.5, display: "flex", flexDirection: "column", gap: 1 } }}
          >
            <TextField
              size="small"
              placeholder="ค้นหาสมาชิก"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              autoFocus
            />
            {member && (
              <Box>
                <Typography variant="caption" color="text.secondary">สมาชิกในการ์ด</Typography>
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
            <Typography variant="caption" color="text.secondary">เพิ่มสมาชิก</Typography>
            <Box sx={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {visibleProgrammers.length === 0 ? (
                <Typography variant="caption" color="text.secondary">ไม่พบสมาชิก</Typography>
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
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth" sx={{ px: 2, minHeight: 40 }}>
            <Tab value="comments" label="ความคิดเห็น" sx={{ minHeight: 40, fontSize: "0.8rem", textTransform: "none" }} />
            <Tab value="history" label="ประวัติ" sx={{ minHeight: 40, fontSize: "0.8rem", textTransform: "none" }} />
          </Tabs>
          <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 1.5, display: "flex", flexDirection: "column", gap: 1.5 }}>
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
                comments.map((c) => (
                  <Box key={c.id} sx={{ display: "flex", gap: 1 }}>
                    <Avatar
                      sx={{
                        width: 28,
                        height: 28,
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        bgcolor: "primary.main",
                        color: "primary.contrastText",
                        flexShrink: 0,
                      }}
                    >
                      {c.authorName ? c.authorName.charAt(0).toUpperCase() : <PersonIcon sx={{ fontSize: 16 }} />}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
                        <Typography variant="caption" fontWeight={700}>{c.authorName ?? "ไม่ทราบชื่อ"}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatDateTime(c.createdAt)}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{c.content}</Typography>
                    </Box>
                  </Box>
                ))
              )
            ) : !canViewHistory ? (
              <Typography variant="body2" color="text.secondary">ไม่มีสิทธิ์ดูประวัติ</Typography>
            ) : logs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">ยังไม่มีประวัติ</Typography>
            ) : (
              logs.map((log) => (
                <Box key={log.id} sx={{ display: "flex", gap: 1 }}>
                  <Avatar
                    sx={{
                      width: 28,
                      height: 28,
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      bgcolor: "primary.main",
                      color: "primary.contrastText",
                      flexShrink: 0,
                    }}
                  >
                    {log.actorName ? log.actorName.charAt(0).toUpperCase() : <HistoryIcon sx={{ fontSize: 16 }} />}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2">{formatActivityAction(log)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(log.createdAt)}
                    </Typography>
                  </Box>
                </Box>
              ))
            )}
          </Box>
          {tab === "comments" && canPostComment && (
            <Box sx={{ p: 2, pt: 1, display: "flex", gap: 1, alignItems: "flex-end" }}>
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
                maxRows={4}
              />
                <IconButton color="primary" onClick={handlePost} disabled={!draft.trim() || posting}>
                  <SendIcon />
                </IconButton>
            </Box>
          )}
          {error && (
            <Alert severity="error" sx={{ m: 2, mt: 0 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </Box>
      </Box>
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
            {LABEL_COLORS.map((c) => (
              <Tooltip key={c} title={c}>
                <Box
                  onClick={() => setColor(c)}
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    bgcolor: COLOR_MAP[c],
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

function ReportIssuePopover({
  open,
  onClose,
  onSubmit,
  columns,
  anchorEl,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    categoryId?: number | null;
    customCategory?: string;
    columnId: number;
    description: string;
    files: File[];
  }) => void;
  columns: BoardColumn[];
  anchorEl: HTMLElement | null;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [columnId, setColumnId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const catDropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const token = useAuthStore.getState().token;
    apiFetch<{ data: { id: number; name: string }[] }>("/categories", {}, token)
      .then((res) => setCategories(res?.data ?? []))
      .catch(() => setCategories([]));
    setColumnId(columns[0]?.id ?? "");
  }, [open, columns]);

  useEffect(() => {
    if (open) {
      setTitle("");
      setCategoryId(null);
      setCustomCategory("");
      setSearchQuery("");
      setDescription("");
      setFiles([]);
      setIsDragOver(false);
    }
  }, [open]);

  const allCategories = useMemo(() => {
    const hasOther = categories.some((c) => c.name === "อื่น ๆ");
    if (hasOther) return categories;
    return [...categories, { id: -1, name: "อื่น ๆ" }];
  }, [categories]);

  const filteredCategories = allCategories.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const selectedCategory = allCategories.find((c) => c.id === categoryId) ?? null;
  const isOtherSelected = selectedCategory?.name === "อื่น ๆ";
  const canSubmit =
    columns.length > 0 &&
    title.trim().length > 0 &&
    (selectedCategory !== null || customCategory.trim().length > 0);

  const addFiles = (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (incoming.length > 0) {
      setFiles((prev) => [...prev, ...incoming]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      categoryId: selectedCategory && !isOtherSelected ? selectedCategory.id : null,
      customCategory: isOtherSelected ? customCategory.trim() : undefined,
      columnId: columnId as number,
      description: description.trim(),
      files,
    });
  };

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorEl={anchorEl}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      PaperProps={{
        sx: {
          width: 420,
          maxWidth: "95vw",
          borderRadius: 3,
          boxShadow: theme.custom.cardShadow,
          overflow: "hidden",
        },
      }}
    >
      <Box
        sx={{ p: 2.5 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
          <WarningAmberIcon sx={{ fontSize: 28, color: "warning.main" }} />
          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            แจ้งปัญหาใหม่
          </Typography>
        </Box>

        <TextField
          autoFocus
          size="small"
          label="หัวข้อ"
          fullWidth
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          sx={{ mb: 1.5 }}
        />

        <ClickAwayListener onClickAway={() => setCatDropOpen(false)}>
          <Box ref={catDropRef} sx={{ position: "relative", mb: 1.5 }}>
            <TextField
              size="small"
              fullWidth
              label="หมวดหมู่"
              value={selectedCategory?.name ?? ""}
              placeholder="เลือกหมวดหมู่"
              onClick={() => setCatDropOpen(!catDropOpen)}
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <ArrowDropDownIcon
                    sx={{
                      fontSize: 20,
                      color: "text.secondary",
                      transform: catDropOpen ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s",
                    }}
                  />
                ),
              }}
              sx={{
                cursor: "pointer",
                "& .MuiOutlinedInput-root": {
                  cursor: "pointer",
                },
                "& input": {
                  cursor: "pointer",
                },
              }}
            />

            {catDropOpen && (
              <Paper
                sx={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 10,
                  mt: 0.5,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1.5,
                  boxShadow: theme.custom.cardShadow,
                  overflow: "hidden",
                }}
              >
                <TextField
                  size="small"
                  fullWidth
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหา..."
                  InputProps={{
                    startAdornment: <SearchIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} />,
                  }}
                  sx={{
                    p: 1,
                    "& .MuiOutlinedInput-root": {
                      "& fieldset": { border: "none" },
                    },
                  }}
                />

                <Box sx={{ maxHeight: 200, overflowY: "auto" }}>
                  {filteredCategories.length > 0 ? (
                    filteredCategories.map((cat) => (
                      <ListItemButton
                        key={cat.id}
                        onClick={() => {
                          setCategoryId(cat.id);
                          setCatDropOpen(false);
                          setSearchQuery("");
                        }}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1.5,
                          px: 2,
                          py: 1.25,
                          bgcolor: categoryId === cat.id ? "sky.dark" : "transparent",
                          "&:hover": { bgcolor: categoryId === cat.id ? "sky.dark" : "action.hover" },
                        }}
                      >
                        <CategoryIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {cat.name}
                        </Typography>
                        {categoryId === cat.id && <CheckIcon sx={{ fontSize: 16, color: "primary.main" }} />}
                      </ListItemButton>
                    ))
                  ) : (
                    <Box sx={{ px: 2, py: 3, textAlign: "center" }}>
                      <Typography variant="body2" color="text.disabled">
                        ไม่มีข้อมูลนี้
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Paper>
            )}
          </Box>
        </ClickAwayListener>

        {isOtherSelected && (
          <TextField
            size="small"
            label="ระบุหมวดหมู่เพิ่มเติม"
            fullWidth
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            placeholder="ระบุหมวดหมู่เพิ่มเติม"
            sx={{ mb: 1.5 }}
          />
        )}

        {columns.length === 0 && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            ยังไม่มีคอลัมน์บนบอร์ด กรุณาเพิ่มคอลัมน์ก่อนแจ้งปัญหา
          </Alert>
        )}

        <TextField
          size="small"
          label="รายละเอียด"
          fullWidth
          multiline
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          sx={{ mb: 1.5 }}
        />

        <Box sx={{ mb: 2 }}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <Button
            size="small"
            variant={isDragOver ? "contained" : "outlined"}
            startIcon={<AttachFileIcon />}
            onClick={() => fileInputRef.current?.click()}
            sx={
              isDragOver
                ? { border: "2px dashed", borderColor: "primary.main", bgcolor: "sky.dark" }
                : undefined
            }
          >
            แนบไฟล์ (รูปภาพ, PDF)
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
            ลากไฟล์มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์
          </Typography>
          {files.length > 0 && (
            <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 0.5 }}>
              {files.map((file, index) => (
                <Box
                  key={index}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    p: 0.75,
                    px: 1.5,
                    bgcolor: "sky.dark",
                    borderRadius: 1.5,
                    border: "1px solid",
                    borderColor: "sky.main",
                  }}
                >
                  <AttachFileIcon sx={{ fontSize: 16, color: "navy.main" }} />
                  <Typography
                    variant="caption"
                    sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", color: "navy.main" }}
                  >
                    {file.name}
                  </Typography>
                  <IconButton size="small" onClick={() => removeFile(index)} sx={{ p: 0.2 }}>
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
          <Button onClick={onClose} color="inherit" size="small">
            ยกเลิก
          </Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={!canSubmit}
            startIcon={<SendIcon />}
            size="small"
          >
            ส่งปัญหา
          </Button>
        </Box>
      </Box>
    </Popover>
  );
}

function StatusFilterDialog({
  open,
  statuses,
  priorities,
  categories,
  users,
  labels,
  selectedStatusIds,
  selectedPriorityIds,
  selectedCategoryIds,
  selectedLabelIds,
  selectedAssigneeIds,
  searchQuery,
  onToggleStatus,
  onTogglePriority,
  onToggleCategory,
  onToggleLabel,
  onToggleAssignee,
  onSearchChange,
  onSelectAllStatuses,
  onClearAll,
  onClose,
}: {
  open: boolean;
  statuses: IssueStatus[];
  priorities: IssuePriority[];
  categories: { id: number; name: string }[];
  users: UserSummary[];
  labels: Label[];
  selectedStatusIds: number[];
  selectedPriorityIds: number[];
  selectedCategoryIds: number[];
  selectedLabelIds: number[];
  selectedAssigneeIds: string[];
  searchQuery: string;
  onToggleStatus: (statusId: number) => void;
  onTogglePriority: (priorityId: number) => void;
  onToggleCategory: (categoryId: number) => void;
  onToggleLabel: (labelId: number) => void;
  onToggleAssignee: (userId: string) => void;
  onSearchChange: (query: string) => void;
  onSelectAllStatuses: () => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>ตัวกรอง</DialogTitle>
      <DialogContent dividers sx={{ pt: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="ค้นหาชื่องาน..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          sx={{ mb: 2 }}
        />

        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          สถานะ
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 2 }}>
          {statuses.map((status) => (
            <FormControlLabel
              key={status.id}
              control={
                <Checkbox
                  checked={selectedStatusIds.includes(status.id)}
                  onChange={() => onToggleStatus(status.id)}
                  size="small"
                />
              }
              label={status.name}
            />
          ))}
          {statuses.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              ไม่พบสถานะ
            </Typography>
          )}
        </Box>

        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          ความสำคัญ
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 2 }}>
          {priorities.map((priority) => (
            <FormControlLabel
              key={priority.id}
              control={
                <Checkbox
                  checked={selectedPriorityIds.includes(priority.id)}
                  onChange={() => onTogglePriority(priority.id)}
                  size="small"
                />
              }
              label={priority.name}
            />
          ))}
          {priorities.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              ไม่พบความสำคัญ
            </Typography>
          )}
        </Box>

        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          หมวดหมู่
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 2 }}>
          {categories.map((cat) => (
            <FormControlLabel
              key={cat.id}
              control={
                <Checkbox
                  checked={selectedCategoryIds.includes(cat.id)}
                  onChange={() => onToggleCategory(cat.id)}
                  size="small"
                />
              }
              label={cat.name}
            />
          ))}
          {categories.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              ไม่พบหมวดหมู่
            </Typography>
          )}
        </Box>

        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          ป้ายกำกับ
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 2 }}>
          {labels.map((label) => (
            <FormControlLabel
              key={label.id}
              control={
                <Checkbox
                  checked={selectedLabelIds.includes(label.id)}
                  onChange={() => onToggleLabel(label.id)}
                  size="small"
                />
              }
              label={label.name}
            />
          ))}
          {labels.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              ไม่พบป้ายกำกับ
            </Typography>
          )}
        </Box>

        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          ผู้รับผิดชอบ
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {users.map((user) => (
            <FormControlLabel
              key={user.id}
              control={
                <Checkbox
                  checked={selectedAssigneeIds.includes(user.id)}
                  onChange={() => onToggleAssignee(user.id)}
                  size="small"
                />
              }
              label={user.name}
            />
          ))}
          {users.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              ไม่พบผู้ใช้
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, py: 1.5 }}>
        <Box>
          <Button size="small" onClick={onSelectAllStatuses} disabled={statuses.length === 0}>
            เลือกทั้งหมด
          </Button>
          <Button size="small" onClick={onClearAll} disabled={statuses.length === 0 && priorities.length === 0 && labels.length === 0 && users.length === 0}>
            ล้างทั้งหมด
          </Button>
        </Box>
        <Button variant="contained" onClick={onClose}>
          ปิด
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function KanbanView({
  columns,
  issues,
  labels,
  statuses,
  priorities,
  users,
  selectedStatusIds,
  selectedPriorityIds,
  selectedCategoryIds,
  selectedLabelIds,
  selectedAssigneeIds,
  searchQuery,
  canManage,
  canEdit,
  canDelete,
  canUnlockIssue,
  canUnlockColumn,
  onRefresh,
  toolbar,
  roleName,
}: {
  columns: BoardColumn[];
  issues: BoardIssue[];
  labels: Label[];
  statuses: IssueStatus[];
  priorities: IssuePriority[];
  users: UserSummary[];
  selectedStatusIds: number[];
  selectedPriorityIds: number[];
  selectedCategoryIds: number[];
  selectedLabelIds: number[];
  selectedAssigneeIds: string[];
  searchQuery: string;
  canManage: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUnlockIssue: boolean;
  canUnlockColumn: boolean;
  onRefresh: () => void;
  toolbar: React.ReactNode;
  roleName: string;
}) {
  const t = useTranslations("Boards");
  const [activeIssue, setActiveIssue] = useState<BoardIssue | null>(null);
  const [activeColumn, setActiveColumn] = useState<BoardColumn | null>(null);
  const [detailIssue, setDetailIssue] = useState<BoardIssue | null>(null);
  const [editIssue, setEditIssue] = useState<BoardIssue | null>(null);
  const [activityIssue, setActivityIssue] = useState<BoardIssue | null>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [deleteColumnId, setDeleteColumnId] = useState<number | null>(null);
  const [issueToDelete, setIssueToDelete] = useState<BoardIssue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localIssues, setLocalIssues] = useState<BoardIssue[]>(issues);
  const [localColumns, setLocalColumns] = useState<BoardColumn[]>(columns);
  const [dragStartColumnId, setDragStartColumnId] = useState<number | null>(null);
  const [hoverColumnId, setHoverColumnId] = useState<number | null>(null);
  const dragTargetColumnId = useRef<number | null>(null);

  const hasActiveFilters =
    selectedStatusIds.length > 0 ||
    selectedPriorityIds.length > 0 ||
    selectedCategoryIds.length > 0 ||
    selectedLabelIds.length > 0 ||
    selectedAssigneeIds.length > 0 ||
    searchQuery.trim() !== "";

  const filteredIssues = useMemo(() => {
    if (!hasActiveFilters) return localIssues;
    const query = searchQuery.trim().toLowerCase();
    return localIssues.filter((issue) => {
      if (selectedStatusIds.length > 0) {
        const col = localColumns.find((c) => c.id === issue.columnId);
        if (!col || !selectedStatusIds.includes(col.statusId)) return false;
      }
      if (selectedPriorityIds.length > 0 && !selectedPriorityIds.includes(issue.priorityId ?? -1)) return false;
      if (selectedCategoryIds.length > 0 && !selectedCategoryIds.includes(issue.categoryId ?? -1)) return false;
      if (selectedLabelIds.length > 0) {
        const issueLabelIds = issue.labelIds?.length ? issue.labelIds : (issue.labelId ? [issue.labelId] : []);
        if (!selectedLabelIds.some((id) => issueLabelIds.includes(id))) return false;
      }
      if (selectedAssigneeIds.length > 0) {
        const assigneeId = issue.programmerId ?? issue.customerId;
        if (!assigneeId || !selectedAssigneeIds.includes(String(assigneeId))) return false;
      }
      if (query && !issue.title.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [localIssues, localColumns, selectedStatusIds, selectedPriorityIds, selectedCategoryIds, selectedLabelIds, selectedAssigneeIds, searchQuery, hasActiveFilters]);

  const visibleColumns =
    selectedStatusIds.length === 0
      ? localColumns
      : localColumns.filter((c) => selectedStatusIds.includes(c.statusId));

  useEffect(() => {
    setLocalIssues(issues);
  }, [issues]);

  useEffect(() => {
    setLocalColumns(columns);
  }, [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    dragTargetColumnId.current = null;
    const issue = localIssues.find((i) => i.id === active.id);
    if (issue) {
      setActiveIssue(issue);
      setDragStartColumnId(issue.columnId);
      return;
    }
    const column = localColumns.find((c) => c.id === active.id);
    setActiveColumn(column ?? null);
    setDragStartColumnId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    if (!over || active.data.current?.type === "column") {
      setHoverColumnId(null);
      return;
    }

    const activeId = active.id as number;
    const overId = over.id as number;

    const activeIssue = localIssues.find((i) => i.id === activeId);
    if (!activeIssue) {
      setHoverColumnId(null);
      return;
    }

    const overIssue = localIssues.find((i) => i.id === overId);
    const overDataType = over.data.current?.type;
    let targetColumnId: number | null = null;
    if (overIssue) {
      targetColumnId = overIssue.columnId;
    } else if (overDataType === "column-drop") {
      targetColumnId = (over.data.current as { columnId?: number })?.columnId ?? null;
    } else if (localColumns.some((c) => c.id === overId)) {
      targetColumnId = overId;
    }

    if (!targetColumnId || activeIssue.columnId === targetColumnId) {
      return;
    }

    dragTargetColumnId.current = targetColumnId;
    setHoverColumnId(targetColumnId);
    setLocalIssues((prev) =>
      prev.map((i) =>
        i.id === activeId ? { ...i, columnId: targetColumnId } : i
      )
    );
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveIssue(null);
    setActiveColumn(null);
    setHoverColumnId(null);

    if (!over || !canManage) return;

    const activeType = active.data.current?.type;

    if (activeType === "column") {
      const activeColumnId = active.id as number;
      const overColumnId = over.id as number;
      if (activeColumnId === overColumnId) return;

      const activeColumn = localColumns.find((c) => c.id === activeColumnId);
      if (!activeColumn || activeColumn.isLocked) return;

      const oldIndex = localColumns.findIndex((c) => c.id === activeColumnId);
      const newIndex = localColumns.findIndex((c) => c.id === overColumnId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(localColumns, oldIndex, newIndex);
      setLocalColumns(reordered);
      try {
        await reorderColumns(
          reordered.map((col, idx) => ({ id: col.id, position: idx + 1 }))
        );
      } catch (e) {
        setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
        onRefresh();
      }
      return;
    }

    const issueId = active.id as number;

    const issue = localIssues.find((i) => i.id === issueId);
    if (!issue || issue.isLocked) return;

    const targetColumnId = dragTargetColumnId.current;
    dragTargetColumnId.current = null;

    if (targetColumnId === null) return;
    if (dragStartColumnId !== null && targetColumnId === dragStartColumnId) {
      setDragStartColumnId(null);
      return;
    }

    try {
      await moveIssue(issueId, targetColumnId);
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
      onRefresh();
    } finally {
      setDragStartColumnId(null);
    }
  };

  const handleDragCancel = () => {
    setActiveIssue(null);
    setActiveColumn(null);
    setDragStartColumnId(null);
    setHoverColumnId(null);
    dragTargetColumnId.current = null;
    onRefresh();
  };

  const handleSaveIssue = async (data: { title: string; description: string; columnId: number; labelId?: number | null }) => {
    try {
      if (editIssue) {
        await createIssue({ ...data, columnId: editIssue.columnId ?? data.columnId });
      } else {
        await createIssue(data);
      }
      setEditIssue(null);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleDeleteIssue = async () => {
    if (!issueToDelete) return;
    try {
      await deleteIssue(issueToDelete.id);
      setIssueToDelete(null);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleAddColumn = async (name: string, description: string) => {
    try {
      await createColumnWithStatus(name, description);
      setAddColumnOpen(false);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleDeleteColumn = async () => {
    if (!deleteColumnId) return;
    try {
      await deleteColumn(deleteColumnId);
      setDeleteColumnId(null);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleUnlockColumn = async (columnId: number) => {
    try {
      await unlockColumn(columnId);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleUnlockIssue = async (issueId: number) => {
    try {
      await unlockIssue(issueId);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  return (
    <Box sx={{ width: "100%" }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          bgcolor: "background.default",
          py: 1,
          mb: 1,
        }}
      >
        {toolbar}
      </Box>
      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 2, width: "100%" }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={visibleColumns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
            {visibleColumns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                issues={filteredIssues.filter((i) => i.columnId === column.id)}
                showAll={hasActiveFilters}
                canManage={canManage}
                canEdit={canEdit}
                canDelete={canDelete}
                canUnlockIssue={canUnlockIssue}
                canUnlockColumn={canUnlockColumn}
                isDropTarget={hoverColumnId === column.id && !!activeIssue}
                roleName={roleName}
                onOpenIssue={(issue) => setDetailIssue(issue)}
                onEditIssue={(issue) => setEditIssue(issue)}
                onDeleteIssue={(issue) => setIssueToDelete(issue)}
                onViewActivity={(issue) => setActivityIssue(issue)}
                onDeleteColumn={(colId) => setDeleteColumnId(colId)}
                onUnlockColumn={handleUnlockColumn}
                onUnlockIssue={handleUnlockIssue}
              />
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={dropAnimation}>
            {activeIssue ? (
              <Box
                sx={{
                  width: 240,
                  p: 1.5,
                  bgcolor: "background.paper",
                  borderRadius: 1.5,
                  boxShadow: (theme) => theme.custom.cardShadow,
                  border: "2px solid",
                  borderColor: "primary.main",
                }}
              >
                <Typography variant="caption" color="primary.main" fontWeight={700} sx={{ display: "block", mb: 0.5 }}>
                  ISS-{String(activeIssue.id).padStart(3, "0")}
                </Typography>
                <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.4 }}>
                  {activeIssue.title}
                </Typography>
              </Box>
            ) : activeColumn ? (
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
                  {activeColumn.customName ?? activeColumn.statusName}
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

      <ActivityLogDialog
        issue={activityIssue}
        open={!!activityIssue}
        onClose={() => setActivityIssue(null)}
      />
      <IssueDetailDialog
        issue={detailIssue}
        open={!!detailIssue}
        onClose={() => setDetailIssue(null)}
        columns={localColumns}
        labels={labels}
        onRefresh={onRefresh}
        onEdit={(issue) => {
          setDetailIssue(null);
          setEditIssue(issue);
        }}
        onDelete={(issue) => {
          setDetailIssue(null);
          setIssueToDelete(issue);
        }}
      />
      <IssueDialog
        issue={editIssue}
        columnId={null}
        open={!!editIssue}
        onClose={() => {
          setEditIssue(null);
        }}
        onSave={handleSaveIssue}
        labels={labels}
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
      <Dialog open={!!deleteColumnId} onClose={() => setDeleteColumnId(null)}>
        <DialogTitle>ยืนยันการลบคอลัมน์</DialogTitle>
        <DialogContent>
          <Typography>
            {(() => {
              const col = columns.find((c) => c.id === deleteColumnId);
              const statusWillDelete =
                col && columns.filter((c) => c.id !== deleteColumnId && c.statusId === col.statusId).length === 0;
              return statusWillDelete
                ? `ต้องการลบคอลัมน์นี้ใช่หรือไม่? สถานะ "${col?.statusName}" จะถูกลบไปด้วย`
                : "ต้องการลบคอลัมน์นี้ใช่หรือไม่?";
            })()}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteColumnId(null)}>ยกเลิก</Button>
          <Button onClick={handleDeleteColumn} color="error">
            ลบ
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function TableView({
  columns,
  issues,
  labels,
  selectedStatusIds,
  canManage,
  canSeeReporter,
  canViewOwnHistory,
  currentUserId,
  onRefresh,
  toolbar,
}: {
  columns: BoardColumn[];
  issues: BoardIssue[];
  labels: Label[];
  selectedStatusIds: number[];
  canManage: boolean;
  canSeeReporter: boolean;
  canViewOwnHistory: boolean;
  currentUserId: string | null;
  onRefresh: () => void;
  toolbar?: React.ReactNode;
}) {
  const t = useTranslations("Boards");
  const theme = useTheme();
  const [detailIssue, setDetailIssue] = useState<BoardIssue | null>(null);
  const [editIssue, setEditIssue] = useState<BoardIssue | null>(null);
  const [activityIssue, setActivityIssue] = useState<BoardIssue | null>(null);
  const [issueToDelete, setIssueToDelete] = useState<BoardIssue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const filteredIssues =
    selectedStatusIds.length === 0
      ? issues
      : issues.filter((i) => {
          const col = columns.find((c) => c.id === i.columnId);
          return col !== undefined && selectedStatusIds.includes(col.statusId);
        });
  const pageIssues = filteredIssues.slice((page - 1) * 10, page * 10);

  const handleSaveIssue = async (data: { title: string; description: string; columnId: number; labelId?: number | null }) => {
    try {
      if (editIssue) {
        await createIssue({ ...data, columnId: editIssue.columnId ?? data.columnId });
      } else {
        await createIssue(data);
      }
      setEditIssue(null);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleDeleteIssue = async () => {
    if (!issueToDelete) return;
    try {
      await deleteIssue(issueToDelete.id);
      setIssueToDelete(null);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const getColumnName = (columnId: number | null): string => {
    if (!columnId) return "—";
    const col = columns.find((c) => c.id === columnId);
    return col ? (col.customName ?? col.statusName) : "—";
  };

  const canViewHistory = (issue: BoardIssue) =>
    canManage ||
    (canViewOwnHistory &&
      issue.customerId != null &&
      String(issue.customerId) === currentUserId);

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {toolbar && (
        <Box
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            bgcolor: "background.default",
            py: 1,
            mb: 1,
          }}
        >
          {toolbar}
        </Box>
      )}
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden", border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: theme.custom.tableStripe }}>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>ID</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>หัวข้อ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>สถานะ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>ความสำคัญ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>หมวดหมู่</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>ผู้รับผิดชอบ</th>
                {canSeeReporter && (
                  <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>ผู้แจ้ง</th>
                )}
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>สร้างเมื่อ</th>
                {(canManage || canViewOwnHistory) && (
                  <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>จัดการ</th>
                )}
              </tr>
            </thead>
            <tbody>
              {pageIssues.map((issue) => (
                <tr key={issue.id} style={{ borderBottom: `1px solid ${theme.custom.tableBorder}` }}>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    <Typography variant="caption" fontWeight={500}>ISS-{String(issue.id).padStart(3, "0")}</Typography>
                  </td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      onClick={() => setDetailIssue(issue)}
                      sx={{ cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } }}
                    >
                      {issue.title}
                    </Typography>
                  </td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    <Chip
                      label={getColumnName(issue.columnId)}
                      size="small"
                      sx={{
                        bgcolor: `${getColumnColor(getColumnName(issue.columnId), theme)}20`,
                        color: getColumnColor(getColumnName(issue.columnId), theme),
                        fontWeight: 600,
                        fontSize: "0.7rem",
                      }}
                    />
                  </td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    {issue.priorityName ? (
                      <Chip
                        label={PRIORITY_LABELS[issue.priorityName.toLowerCase()] ?? issue.priorityName}
                        size="small"
                        color={PRIORITY_COLORS[issue.priorityName.toLowerCase()] ?? "default"}
                        sx={{ fontSize: "0.7rem", fontWeight: 600 }}
                      />
                    ) : "—"}
                  </td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>{issue.categoryName ?? "—"}</td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>{issue.programmerName ?? "รอมอบหมาย"}</td>
                  {canSeeReporter && (
                    <td style={{ padding: "12px", fontSize: "0.8rem" }}>{issue.customerName ?? "—"}</td>
                  )}
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    {new Date(issue.createdAt).toLocaleDateString("th-TH")}
                  </td>
                  {(canManage || canViewOwnHistory) && (
                    <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        {canManage && (
                          <IconButton size="small" onClick={() => setEditIssue(issue)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                        {canViewHistory(issue) && (
                          <IconButton size="small" onClick={() => setActivityIssue(issue)}>
                            <HistoryIcon fontSize="small" />
                          </IconButton>
                        )}
                        {canManage && (
                          <IconButton size="small" onClick={() => setIssueToDelete(issue)} color="error">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Paper>
      <Pagination
        page={page}
        totalPages={Math.max(1, Math.ceil(filteredIssues.length / 10))}
        total={filteredIssues.length}
        limit={10}
        onPageChange={setPage}
      />

      <ActivityLogDialog
        issue={activityIssue}
        open={!!activityIssue}
        onClose={() => setActivityIssue(null)}
      />
      <IssueDetailDialog
        issue={detailIssue}
        open={!!detailIssue}
        onClose={() => setDetailIssue(null)}
        columns={columns}
        labels={labels}
        onRefresh={onRefresh}
        onEdit={(issue) => {
          setDetailIssue(null);
          setEditIssue(issue);
        }}
        onDelete={(issue) => {
          setDetailIssue(null);
          setIssueToDelete(issue);
        }}
      />
      <IssueDialog
        issue={editIssue}
        columnId={null}
        open={!!editIssue}
        onClose={() => {
          setEditIssue(null);
        }}
        onSave={handleSaveIssue}
        labels={labels}
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
    </Box>
  );
}

export default function BoardsPage() {
  const t = useTranslations("Boards");
  const { can, roleName } = usePermissions();
  const theme = useTheme();
  const currentUserId = useAuthStore((s) => s.user?.id) ?? null;
  const isCustomer = roleName === "customer";
  const [view, setView] = useState<"board" | "table">("table");
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [priorities, setPriorities] = useState<IssuePriority[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedStatusIds, setSelectedStatusIds] = useState<number[]>([]);
  const [selectedPriorityIds, setSelectedPriorityIds] = useState<number[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [trashedIssues, setTrashedIssues] = useState<TrashedIssue[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportAnchorEl, setReportAnchorEl] = useState<HTMLElement | null>(null);

  const canEdit = can("issue.all.update");
  const canDelete = can("issue.delete");
  const canAssign = can("issue.assign");
  const canUnlockIssue = can("issue.unlock");
  const canManage = canEdit || canDelete || canAssign;
  const canUnlockColumn = can("board.column.unlock");
  const canReport = can("issue.create");
  const canSeeReporter = can("issue.all.view");
  const canViewOwnHistory = can("issue.own.view");

  const handleToggleStatusFilter = (statusId: number) => {
    setSelectedStatusIds((prev) =>
      prev.includes(statusId)
        ? prev.filter((id) => id !== statusId)
        : [...prev, statusId],
    );
  };

  const handleSelectAllStatuses = () => {
    setSelectedStatusIds(statuses.map((s) => s.id));
  };

  const handleClearAllStatuses = () => {
    setSelectedStatusIds([]);
  };

  const handleTogglePriorityFilter = (priorityId: number) => {
    setSelectedPriorityIds((prev) =>
      prev.includes(priorityId)
        ? prev.filter((id) => id !== priorityId)
        : [...prev, priorityId],
    );
  };

  const handleToggleLabelFilter = (labelId: number) => {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId],
    );
  };

  const handleToggleAssigneeFilter = (userId: string) => {
    setSelectedAssigneeIds((prev) =>
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

  const handleClearAllFilters = () => {
    setSelectedStatusIds([]);
    setSelectedPriorityIds([]);
    setSelectedCategoryIds([]);
    setSelectedLabelIds([]);
    setSelectedAssigneeIds([]);
    setSearchQuery("");
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        fetchColumns(),
        fetchIssues(),
        fetchLabels(),
        fetchStatuses(),
        fetchPriorities(),
        fetchUsers(),
      ]);
      const [cols, iss, lbls, sts, pri, usr] = results;
      if (cols.status === "fulfilled") setColumns(cols.value.data);
      if (iss.status === "fulfilled") setIssues(iss.value.data);
      if (lbls.status === "fulfilled") setLabels(lbls.value.data);
      if (sts.status === "fulfilled") setStatuses(sts.value.data);
      if (pri.status === "fulfilled") setPriorities(pri.value.data);
      if (usr.status === "fulfilled") setUsers(usr.value.data);
      const firstError = results.find((r) => r.status === "rejected");
      if (firstError && firstError.status === "rejected") {
        setError(getErrorMessage(firstError.reason, "โหลดข้อมูลไม่สำเร็จ"));
      } else {
        setError(null);
      }
    } catch (e) {
      setError(getErrorMessage(e, "โหลดข้อมูลไม่สำเร็จ"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    const timer = setTimeout(() => {
      fetchIssues(1, 100, [], searchQuery.trim())
        .then((res) => setIssues(res.data))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const categories = useMemo(() => {
    const map = new Map<number, string>();
    issues.forEach((issue) => {
      if (issue.categoryId && issue.categoryName) {
        map.set(issue.categoryId, issue.categoryName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [issues]);

  const handleReportIssue = async (data: {
    title: string;
    categoryId?: number | null;
    customCategory?: string;
    columnId: number;
    description: string;
    files: File[];
  }) => {
    try {
      const issue = await createIssue({
        title: data.title,
        description: data.description,
        columnId: data.columnId,
        categoryId: data.categoryId ?? undefined,
        customCategory: data.customCategory,
      });
      if (data.files.length > 0) {
        await Promise.all(data.files.map((file) => uploadAttachment(issue.id, file)));
      }
      setReportAnchorEl(null);
      loadData();
    } catch (e) {
      setError(getErrorMessage(e, "แจ้งปัญหาไม่สำเร็จ"));
    }
  };

  return (
    <RequirePermission permission="board.view">
      <DashboardLayout>
        <Box sx={{ py: 2 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            view === "board" ? (
              <KanbanView
                columns={columns}
                issues={issues}
                labels={labels}
                statuses={statuses}
                priorities={priorities}
                users={users}
                selectedStatusIds={selectedStatusIds}
                selectedPriorityIds={selectedPriorityIds}
                selectedCategoryIds={selectedCategoryIds}
                selectedLabelIds={selectedLabelIds}
            selectedAssigneeIds={selectedAssigneeIds}
                searchQuery={searchQuery}

                canManage={canManage}
                canEdit={canEdit}
                canDelete={canDelete}
                canUnlockIssue={canUnlockIssue}
                canUnlockColumn={canUnlockColumn}
                onRefresh={loadData}
                roleName={roleName}
                toolbar={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <TextField
                      size="small"
                      placeholder={t("searchPlaceholder")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      sx={{ flexGrow: 1, minWidth: 200 }}
                      InputProps={{
                        startAdornment: <SearchIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} />,
                      }}
                    />
                    {!isCustomer && (
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={view}
                        onChange={(_, v) => v && setView(v)}
                      >
                        <ToggleButton value="board">
                          <ViewKanbanIcon fontSize="small" />
                        </ToggleButton>
                        <ToggleButton value="table">
                          <TableChartIcon fontSize="small" />
                        </ToggleButton>
                      </ToggleButtonGroup>
                    )}
                    {can("issue.trash.view") && (
                      <Tooltip title={t("recycleBin")}>
                        <IconButton size="small" onClick={() => setRecycleBinOpen(true)}>
                          <DeleteOutlineIcon sx={{ fontSize: 20, color: "text.secondary" }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<FilterListIcon />}
                      onClick={() => setFilterOpen(true)}
                    >
                      {t("filter")}
                    </Button>
                    {canReport && (
                      <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={(e) => setReportAnchorEl(e.currentTarget)}
                        sx={{ ml: "auto" }}
                      >
                        {t("reportIssue")}
                      </Button>
                    )}
                  </Box>
                }
              />
            ) : (
              <TableView
                columns={columns}
                issues={issues}
                labels={labels}
                selectedStatusIds={selectedStatusIds}
                canManage={canManage}
                canSeeReporter={canSeeReporter}
                canViewOwnHistory={canViewOwnHistory}
                currentUserId={currentUserId}
                onRefresh={loadData}
                toolbar={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <TextField
                      size="small"
                      placeholder={t("searchPlaceholder")}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      sx={{ flexGrow: 1, minWidth: 200 }}
                      InputProps={{
                        startAdornment: <SearchIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} />,
                      }}
                    />
                    {!isCustomer && (
                      <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={view}
                        onChange={(_, v) => v && setView(v)}
                      >
                        <ToggleButton value="board">
                          <ViewKanbanIcon fontSize="small" />
                        </ToggleButton>
                        <ToggleButton value="table">
                          <TableChartIcon fontSize="small" />
                        </ToggleButton>
                      </ToggleButtonGroup>
                    )}
                    {can("issue.trash.view") && (
                      <Tooltip title={t("recycleBin")}>
                        <IconButton size="small" onClick={() => setRecycleBinOpen(true)}>
                          <DeleteOutlineIcon sx={{ fontSize: 20, color: "text.secondary" }} />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<FilterListIcon />}
                      onClick={() => setFilterOpen(true)}
                    >
                      {t("filter")}
                    </Button>
                    {canReport && (
                      <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={(e) => setReportAnchorEl(e.currentTarget)}
                        sx={{ ml: "auto" }}
                      >
                        {t("reportIssue")}
                      </Button>
                    )}
                  </Box>
                }
              />
            ))}

          <StatusFilterDialog
            open={filterOpen}
            statuses={statuses}
            priorities={priorities}
            categories={categories}
            users={users}
            labels={labels}
            selectedStatusIds={selectedStatusIds}
            selectedPriorityIds={selectedPriorityIds}
            selectedCategoryIds={selectedCategoryIds}
            selectedLabelIds={selectedLabelIds}
            selectedAssigneeIds={selectedAssigneeIds}
            searchQuery={searchQuery}
            onToggleStatus={handleToggleStatusFilter}
            onTogglePriority={handleTogglePriorityFilter}
            onToggleCategory={handleToggleCategoryFilter}
            onToggleLabel={handleToggleLabelFilter}
            onToggleAssignee={handleToggleAssigneeFilter}
            onSearchChange={setSearchQuery}
            onSelectAllStatuses={handleSelectAllStatuses}
            onClearAll={handleClearAllFilters}
            onClose={() => setFilterOpen(false)}
          />
          <ReportIssuePopover
            open={Boolean(reportAnchorEl)}
            onClose={() => setReportAnchorEl(null)}
            onSubmit={handleReportIssue}
            columns={columns}
            anchorEl={reportAnchorEl}
          />
          <RecycleBinDialog
            open={recycleBinOpen}
            onClose={() => setRecycleBinOpen(false)}
            onRestored={loadData}
          />
        </Box>
        <Box
          component="footer"
          sx={{
            py: 2,
            textAlign: "center",
            color: "text.secondary",
            fontSize: "0.75rem",
            borderTop: "1px solid",
            borderColor: "divider",
            mt: 2,
          }}
        >
          Issue Tracker © {new Date().getFullYear()}
        </Box>
      </DashboardLayout>
    </RequirePermission>
  );
}
