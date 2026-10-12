"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Autocomplete,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
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
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import SendIcon from "@mui/icons-material/Send";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import PersonIcon from "@mui/icons-material/Person";
import FilterListIcon from "@mui/icons-material/FilterList";
import { useTranslations } from "next-intl";
import { usePermissions } from "@/lib/permissions";
import { useAuthStore } from "@/lib/auth-store";
import { apiFetch } from "@/lib/api";
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
  fetchIssueActivity,
  fetchIssueComments,
  fetchStatuses,
  createComment,
  uploadAttachment,
  type BoardColumn,
  type BoardIssue,
  type ActivityLog,
  type Comment,
  type IssueStatus,
} from "@/lib/board-api";
import { fetchLabels, type Label } from "@/lib/labels-api";
import { Pagination } from "@/components/pagination";

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
        return `${log.actorName ?? "ระบบ"} แก้ไข: ${(detail.fields ?? []).join(", ")}`;
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
      {(canEdit || canDelete || canUnlockIssue) && (
        <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, justifyContent: "flex-end" }}>
          {issue.isLocked && canUnlockIssue && (
            <Tooltip title="ปลดล็อก">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onUnlock?.(issue); }} sx={{ p: 0.3 }}>
                <LockOpenIcon sx={{ fontSize: 16, color: "warning.main" }} />
              </IconButton>
            </Tooltip>
          )}
          {canEdit && (
            <Tooltip title="แก้ไข">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit?.(issue); }} sx={{ p: 0.3 }}>
                <EditIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {canEdit && (
            <Tooltip title="ประวัติ">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onViewActivity?.(issue); }} sx={{ p: 0.3 }}>
                <HistoryIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
          {canDelete && (
            <Tooltip title="ลบ">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete?.(issue); }} color="error" sx={{ p: 0.3 }}>
                <DeleteIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      )}
    </Paper>
  );
}

function KanbanColumn({
  column,
  issues,
  canManage,
  canEdit,
  canDelete,
  canUnlockIssue,
  canUnlockColumn,
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
  canManage: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUnlockIssue: boolean;
  canUnlockColumn: boolean;
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
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: "column" }, disabled: column.isLocked });

  const theme = useTheme();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const color = getColumnColor(column.statusName, theme);
  const visibleIssues = [...issues].sort((a, b) => b.id - a.id).slice(0, 10);

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(canManage && !column.isLocked ? listeners : {})}
      sx={{
        width: 240,
        minWidth: 240,
        bgcolor: "grey.50",
        borderRadius: 2,
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        maxHeight: "calc(100vh - 200px)",
        border: "1px solid",
        borderColor: theme.palette.divider,
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
          {issues.length > 10 && (
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
        <Box sx={{ flexGrow: 1, overflowY: "auto", minHeight: 60 }}>
          {visibleIssues.map((issue) => (
            <TrelloCard
              key={issue.id}
              issue={issue}
              canManage={canManage}
              canEdit={canEdit}
              canDelete={canDelete}
              canUnlockIssue={canUnlockIssue}
              onOpen={onOpenIssue}
              onEdit={onEditIssue}
              onDelete={onDeleteIssue}
              onViewActivity={onViewActivity}
              onUnlock={(iss) => onUnlockIssue(iss.id)}
            />
          ))}
          {issues.length === 0 && (
            <Box sx={{ py: 2, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary">ไม่มีการ์ด</Typography>
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
  onEdit,
  onDelete,
}: {
  issue: BoardIssue | null;
  open: boolean;
  onClose: () => void;
  columns: BoardColumn[];
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

  const canViewComments = can("comment.view");
  const canPostComment = can("comment.create");
  const canViewHistory = can("issue.detail.view");
  const canEditIssue = can("issue.all.update");
  const canDeleteIssue = can("issue.delete");

  useEffect(() => {
    if (!issue || !open) return;
    setLoading(true);
    setError(null);
    Promise.all([
      canViewComments ? fetchIssueComments(issue.id).then((r) => r.data) : Promise.resolve([] as Comment[]),
      canViewHistory ? fetchIssueActivity(issue.id) : Promise.resolve([] as ActivityLog[]),
    ])
      .then(([c, l]) => {
        setComments(c);
        setLogs(l);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [issue, open, canViewComments, canViewHistory]);

  const handlePost = async () => {
    const content = draft.trim();
    if (!content || !issue) return;
    setPosting(true);
    try {
      const comment = await createComment(issue.id, content);
      setComments((prev) => [...prev, comment]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งความคิดเห็นไม่สำเร็จ");
    } finally {
      setPosting(false);
    }
  };

  const theme = useTheme();
  const column = issue?.columnId ? columns.find((c) => c.id === issue.columnId) : null;
  const columnName = column ? (column.customName ?? column.statusName) : null;
  const columnColor = getColumnColor(columnName ?? "", theme);
  const categoryName = issue?.categoryName ?? issue?.customCategory ?? "—";

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
          {issue?.title}
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
              sx={{ whiteSpace: "pre-wrap", color: issue?.description ? "text.primary" : "text.secondary" }}
            >
              {issue?.description || "เพิ่มคำอธิบายโดยละเอียด..."}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>หมวดหมู่</Typography>
              <Typography variant="body2">{categoryName}</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>ความสำคัญ</Typography>
              {issue?.priorityName ? (
                <Chip
                  label={PRIORITY_LABELS[issue.priorityName.toLowerCase()] ?? issue.priorityName}
                  size="small"
                  color={PRIORITY_COLORS[issue.priorityName.toLowerCase()] ?? "default"}
                  sx={{ fontSize: "0.7rem", fontWeight: 600 }}
                />
              ) : (
                <Typography variant="body2">—</Typography>
              )}
            </Box>
            {issue?.labelName && (
              <Box sx={{ display: "flex", gap: 1.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>ป้ายกำกับ</Typography>
                <Chip
                  label={issue.labelName}
                  size="small"
                  sx={{
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    bgcolor: COLOR_MAP[issue.labelColor ?? "default"] ?? issue.labelColor ?? undefined,
                    color: theme.palette.getContrastText(COLOR_MAP[issue.labelColor ?? "default"] ?? issue.labelColor ?? theme.palette.grey[400]),
                  }}
                />
              </Box>
            )}
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>สมาชิก</Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Avatar
                  sx={{
                    width: 24,
                    height: 24,
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    bgcolor: issue?.programmerName ? "primary.main" : theme.palette.grey[300],
                    color: issue?.programmerName ? "primary.contrastText" : theme.palette.grey[600],
                  }}
                >
                  {issue?.programmerName ? issue.programmerName.charAt(0).toUpperCase() : <PersonIcon sx={{ fontSize: 15 }} />}
                </Avatar>
                <Typography variant="body2">{issue?.programmerName ?? "รอมอบหมาย"}</Typography>
              </Box>
            </Box>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>ผู้แจ้ง</Typography>
              <Typography variant="body2">{issue?.customerName ?? "—"}</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>สร้างเมื่อ</Typography>
              <Typography variant="body2">{issue ? formatDateTime(issue.createdAt) : "—"}</Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>อัปเดตล่าสุด</Typography>
              <Typography variant="body2">{issue ? formatDateTime(issue.updatedAt) : "—"}</Typography>
            </Box>
          </Box>
          <Box sx={{ display: "flex", gap: 1, mt: "auto", pt: 1 }}>
            {canEditIssue && (
              <Button size="small" variant="outlined" startIcon={<EditIcon />} onClick={() => issue && onEdit(issue)}>
                แก้ไข
              </Button>
            )}
            <Button size="small" variant="outlined" startIcon={<HistoryIcon />} onClick={() => setTab("history")}>
              ประวัติ
            </Button>
            {canDeleteIssue && (
              <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => issue && onDelete(issue)}>
                ลบ
              </Button>
            )}
          </Box>
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

function ReportIssueDialog({
  open,
  onClose,
  onSubmit,
  columns,
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
}) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoryText, setCategoryText] = useState("");
  const [columnId, setColumnId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [statuses, setStatuses] = useState<{ id: number; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const token = useAuthStore.getState().token;
    apiFetch<{ id: number; name: string }[]>("/categories", {}, token)
      .then(setCategories)
      .catch(() => setCategories([]));
    apiFetch<{ id: number; name: string }[]>("/issue-statuses", {}, token)
      .then(setStatuses)
      .catch(() => setStatuses([]));
    setColumnId(columns[0]?.id ?? "");
  }, [open, columns]);

  useEffect(() => {
    if (open) {
      setTitle("");
      setCategoryId(null);
      setCategoryText("");
      setDescription("");
      setFiles([]);
    }
  }, [open]);

  const selectedCategory = categories.find((c) => c.id === categoryId) ?? null;
  const canSubmit = columns.length > 0 && title.trim().length > 0 && categoryText.trim().length > 0 && columnId !== "";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      title: title.trim(),
      categoryId: selectedCategory?.id ?? null,
      customCategory: selectedCategory ? undefined : categoryText.trim(),
      columnId: columnId as number,
      description: description.trim(),
      files,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3, boxShadow: theme.custom.cardShadow } }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 3, pt: 2.5, pb: 1 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "sky.dark",
            color: "navy.main",
          }}
        >
          <ReportProblemOutlinedIcon />
        </Box>
        <Box>
          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            แจ้งปัญหาใหม่
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ระบุรายละเอียดปัญหา ทีมงานจะตรวจสอบโดยเร็วที่สุด
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ px: 3, pt: 1.5 }}>
        <TextField
          autoFocus
          margin="dense"
          label="หัวข้อ"
          fullWidth
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="เช่น ระบบเข้าสู่ระบบไม่ได้"
        />
        <Autocomplete
          fullWidth
          freeSolo
          options={categories}
          getOptionLabel={(option) => (typeof option === "string" ? option : option.name)}
          value={selectedCategory}
          inputValue={categoryText}
          onInputChange={(_, value) => setCategoryText(value)}
          onChange={(_, value) => {
            if (typeof value === "object" && value !== null) {
              setCategoryId(value.id);
              setCategoryText(value.name);
            } else {
              setCategoryId(null);
            }
          }}
          filterOptions={(options, params) => {
            const filtered = options.filter((o) =>
              o.name.toLowerCase().includes(params.inputValue.toLowerCase()),
            );
            if (
              params.inputValue &&
              !filtered.some((o) => o.name.toLowerCase() === params.inputValue.toLowerCase())
            ) {
              filtered.push({ id: -1, name: params.inputValue });
            }
            return filtered;
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              margin="dense"
              label="หมวดหมู่"
              placeholder="เลือกหรือพิมพ์หมวดหมู่"
              fullWidth
            />
          )}
        />
        {columns.length === 0 ? (
          <Alert severity="warning" sx={{ mt: 1 }}>
            ยังไม่มีคอลัมน์บนบอร์ด กรุณาเพิ่มคอลัมน์ก่อนแจ้งปัญหา
          </Alert>
        ) : (
          <FormControl fullWidth margin="dense">
            <InputLabel>สถานะ</InputLabel>
            <Select
              value={columnId}
              label="สถานะ"
              onChange={(e) => setColumnId(Number(e.target.value) || "")}
            >
              {columns.map((col) => (
                <MenuItem key={col.id} value={col.id}>
                  {col.customName ?? col.statusName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <TextField
          margin="dense"
          label="รายละเอียด"
          fullWidth
          multiline
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="อธิบายปัญหาที่พบ เช่น ขั้นตอนที่ทำ หรือ ข้อความแสดงข้อผิดพลาด"
        />
        <Box sx={{ mt: 1 }}>
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
            variant="outlined"
            startIcon={<AttachFileIcon />}
            onClick={() => fileInputRef.current?.click()}
          >
            แนบไฟล์ (รูปภาพ, PDF)
          </Button>
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
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} color="inherit">
          ยกเลิก
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canSubmit}
          startIcon={<SendIcon />}
        >
          ส่งปัญหา
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function StatusFilterDialog({
  open,
  statuses,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  onClose,
}: {
  open: boolean;
  statuses: IssueStatus[];
  selectedIds: number[];
  onToggle: (statusId: number) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>ตัวกรอง</DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          สถานะ
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {statuses.map((status) => (
            <FormControlLabel
              key={status.id}
              control={
                <Checkbox
                  checked={selectedIds.includes(status.id)}
                  onChange={() => onToggle(status.id)}
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
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between", px: 3, py: 1.5 }}>
        <Box>
          <Button size="small" onClick={onSelectAll} disabled={statuses.length === 0}>
            เลือกทั้งหมด
          </Button>
          <Button size="small" onClick={onClearAll} disabled={statuses.length === 0}>
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
  selectedStatusIds,
  onOpenFilter,
  canManage,
  canEdit,
  canDelete,
  canUnlockIssue,
  canUnlockColumn,
  onRefresh,
  toolbar,
}: {
  columns: BoardColumn[];
  issues: BoardIssue[];
  labels: Label[];
  statuses: IssueStatus[];
  selectedStatusIds: number[];
  onOpenFilter: () => void;
  canManage: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUnlockIssue: boolean;
  canUnlockColumn: boolean;
  onRefresh: () => void;
  toolbar: React.ReactNode;
}) {
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
    if (!over) return;

    const activeType = active.data.current?.type;
    if (activeType === "column") return;

    const activeId = active.id as number;
    const overId = over.id as number;

    const activeIssue = localIssues.find((i) => i.id === activeId);
    if (!activeIssue) return;

    const overIssue = localIssues.find((i) => i.id === overId);
    const targetColumnId = overIssue ? overIssue.columnId : overId;

    if (!targetColumnId || activeIssue.columnId === targetColumnId) return;

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
        setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
        onRefresh();
      }
      return;
    }

    const issueId = active.id as number;

    const issue = localIssues.find((i) => i.id === issueId);
    if (!issue || issue.isLocked || !issue.columnId) return;

    if (dragStartColumnId !== null && issue.columnId === dragStartColumnId) {
      setDragStartColumnId(null);
      return;
    }

    try {
      await moveIssue(issueId, issue.columnId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      onRefresh();
    } finally {
      setDragStartColumnId(null);
    }
  };

  const handleDragCancel = () => {
    setActiveIssue(null);
    setActiveColumn(null);
    setDragStartColumnId(null);
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
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleDeleteIssue = async () => {
    if (!issueToDelete) return;
    try {
      await deleteIssue(issueToDelete.id);
      setIssueToDelete(null);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleAddColumn = async (name: string, description: string) => {
    try {
      await createColumnWithStatus(name, description);
      setAddColumnOpen(false);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleDeleteColumn = async () => {
    if (!deleteColumnId) return;
    try {
      await deleteColumn(deleteColumnId);
      setDeleteColumnId(null);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleUnlockColumn = async (columnId: number) => {
    try {
      await unlockColumn(columnId);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleUnlockIssue = async (issueId: number) => {
    try {
      await unlockIssue(issueId);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={onOpenFilter}
            sx={{
              textTransform: "none",
              borderRadius: 2,
              borderColor: selectedStatusIds.length > 0 ? "primary.main" : "divider",
              color: selectedStatusIds.length > 0 ? "primary.main" : "text.secondary",
              bgcolor: selectedStatusIds.length > 0 ? "primary.50" : "transparent",
            }}
          >
            ตัวกรอง
            {selectedStatusIds.length > 0 && ` (${selectedStatusIds.length})`}
          </Button>
          <Box sx={{ flexGrow: 1, display: "flex", alignItems: "center", gap: 2 }}>
            {toolbar}
          </Box>
        </Box>
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
                issues={localIssues.filter((i) => i.columnId === column.id)}
                canManage={canManage}
                canEdit={canEdit}
                canDelete={canDelete}
                canUnlockIssue={canUnlockIssue}
                canUnlockColumn={canUnlockColumn}
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
                  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
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
            ต้องการลบงาน &quot;{issueToDelete?.title}&quot; ใช่หรือไม่?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueToDelete(null)}>ยกเลิก</Button>
          <Button onClick={handleDeleteIssue} color="error">
            ลบ
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={!!deleteColumnId} onClose={() => setDeleteColumnId(null)}>
        <DialogTitle>ยืนยันการลบคอลัมน์</DialogTitle>
        <DialogContent>
          <Typography>ต้องการลบคอลัมน์นี้ใช่หรือไม่?</Typography>
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
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleDeleteIssue = async () => {
    if (!issueToDelete) return;
    try {
      await deleteIssue(issueToDelete.id);
      setIssueToDelete(null);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
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
            ต้องการลบงาน &quot;{issueToDelete?.title}&quot; ใช่หรือไม่?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueToDelete(null)}>ยกเลิก</Button>
          <Button onClick={handleDeleteIssue} color="error">
            ลบ
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
  const [view, setView] = useState<"board" | "table">(
    isCustomer ? "table" : roleName === "programmer" ? "table" : "board"
  );
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [selectedStatusIds, setSelectedStatusIds] = useState<number[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cols, iss, lbls, sts] = await Promise.all([
        fetchColumns(),
        fetchIssues(),
        fetchLabels(),
        fetchStatuses(),
      ]);
      setColumns(cols.data);
      setIssues(iss.data);
      setLabels(lbls);
      setStatuses(sts.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      setReportOpen(false);
      loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "แจ้งปัญหาไม่สำเร็จ");
    }
  };

  return (
    <RequirePermission permission="board.view">
      <DashboardLayout>
        <Box sx={{ py: 2 }}>
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
                selectedStatusIds={selectedStatusIds}
                onOpenFilter={() => setFilterOpen(true)}
                canManage={canManage}
                canEdit={canEdit}
                canDelete={canDelete}
                canUnlockIssue={canUnlockIssue}
                canUnlockColumn={canUnlockColumn}
                onRefresh={loadData}
                toolbar={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        display: "inline-flex",
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 2,
                        bgcolor: "grey.50",
                        p: 0.25,
                      }}
                    >
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setView("board")}
                        startIcon={<ViewKanbanIcon />}
                        sx={{
                          textTransform: "none",
                          borderRadius: 1.5,
                          px: 1.5,
                          py: 0.5,
                          minHeight: 32,
                          ...(((view as "board" | "table") === "board")
                            ? { bgcolor: "background.paper", boxShadow: 1, color: "text.primary" }
                            : { color: "text.secondary" }),
                        }}
                      >
                        บอร์ด
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setView("table")}
                        startIcon={<TableChartIcon />}
                        sx={{
                          textTransform: "none",
                          borderRadius: 1.5,
                          px: 1.5,
                          py: 0.5,
                          minHeight: 32,
                          ...((view as "board" | "table") === "table"
                            ? { bgcolor: "background.paper", boxShadow: 1, color: "text.primary" }
                            : { color: "text.secondary" }),
                        }}
                      >
                        ตาราง
                      </Button>
                    </Box>
                    {canReport && (
                      <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setReportOpen(true)}
                        sx={{ ml: "auto" }}
                      >
                        แจ้งปัญหา
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
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box
                      sx={{
                        display: "inline-flex",
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 2,
                        bgcolor: "grey.50",
                        p: 0.25,
                      }}
                    >
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setView("board")}
                        startIcon={<ViewKanbanIcon />}
                        sx={{
                          textTransform: "none",
                          borderRadius: 1.5,
                          px: 1.5,
                          py: 0.5,
                          minHeight: 32,
                          ...((view as "board" | "table") === "board"
                            ? { bgcolor: "background.paper", boxShadow: 1, color: "text.primary" }
                            : { color: "text.secondary" }),
                        }}
                      >
                        บอร์ด
                      </Button>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setView("table")}
                        startIcon={<TableChartIcon />}
                        sx={{
                          textTransform: "none",
                          borderRadius: 1.5,
                          px: 1.5,
                          py: 0.5,
                          minHeight: 32,
                          ...((view as "board" | "table") === "table"
                            ? { bgcolor: "background.paper", boxShadow: 1, color: "text.primary" }
                            : { color: "text.secondary" }),
                        }}
                      >
                        ตาราง
                      </Button>
                    </Box>
                    {canReport && (
                      <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => setReportOpen(true)}
                        sx={{ ml: "auto" }}
                      >
                        แจ้งปัญหา
                      </Button>
                    )}
                  </Box>
                }
              />
            )
          )}

          <StatusFilterDialog
            open={filterOpen}
            statuses={statuses}
            selectedIds={selectedStatusIds}
            onToggle={handleToggleStatusFilter}
            onSelectAll={handleSelectAllStatuses}
            onClearAll={handleClearAllStatuses}
            onClose={() => setFilterOpen(false)}
          />
          <ReportIssueDialog
            open={reportOpen}
            onClose={() => setReportOpen(false)}
            onSubmit={handleReportIssue}
            columns={columns}
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
