"use client";

import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
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
  Grid,
  useMediaQuery,
  useTheme,
  type Theme,
  Checkbox,
  InputAdornment,
  Popover,
  ListItemButton,
  List,
  ListItem,
} from "@mui/material";
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
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import HistoryIcon from "@mui/icons-material/History";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import SearchIcon from "@mui/icons-material/Search";
import CategoryIcon from "@mui/icons-material/Category";
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
import DeleteIcon from "@mui/icons-material/Delete";
import RestoreFromTrashIcon from "@mui/icons-material/RestoreFromTrash";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SendIcon from "@mui/icons-material/Send";

import LinkIcon from "@mui/icons-material/Link";
import FlagIcon from "@mui/icons-material/Flag";
import LabelIcon from "@mui/icons-material/Label";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { alpha } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import { usePermissions } from "@/lib/permissions";
import { useAuthStore } from "@/lib/auth-store";
import { isApiError } from "@/lib/api";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import {
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
  createStatus,
  updateStatus,
  reorderStatuses,
  fetchPriorities,
  fetchUsers,
  fetchCategories,
  createComment,
  updateComment,
  deleteComment,
  uploadAttachment,
  fetchAttachments,
  deleteAttachment,
  type BoardIssue,
  type ActivityLog,
  type Comment,
  type IssueStatus,
  type IssuePriority,
  type UserSummary,
  type TrashedIssue,
  type Attachment,
  type Category,
  fetchTrashedIssues,
  restoreIssue,
} from "@/lib/board-api";
import { fetchLabels, createLabel, updateLabel, type Label } from "@/lib/labels-api";
import { Pagination } from "@/components/pagination";
import AttachmentPreviewDialog from "@/components/attachment-preview-dialog";

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

function TrelloCardContent({ issue, actions }: { issue: BoardIssue; actions?: ReactNode }) {
  const theme = useTheme();
  const priorityColor = issue.priorityName
    ? PRIORITY_COLORS[issue.priorityName.toLowerCase()] ?? "default"
    : "default";
  const avatarChar = issue.programmerName
    ? issue.programmerName.charAt(0).toUpperCase()
    : null;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.25 }}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.4, flex: 1, mr: 0.5 }}>
          {issue.title}
        </Typography>
        {actions}
      </Box>
      {(issue.priorityName || (issue.labels && issue.labels.length > 0)) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25, flexWrap: "wrap" }}>
          {issue.priorityName && (
            <Chip
              label={PRIORITY_LABELS[issue.priorityName.toLowerCase()] ?? issue.priorityName}
              size="small"
              variant="outlined"
              color={priorityColor}
              sx={{ height: 18, fontSize: "0.65rem", fontWeight: 600 }}
            />
          )}
          {issue.labels?.slice(0, 2).map((lbl) => (
            <Chip
              key={lbl.id}
              label={lbl.name}
              size="small"
              sx={{
                ...labelChipSx(lbl.color, theme),
                height: 20,
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            />
          ))}
        </Box>
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
    </Box>
  );
}

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
        border: "none",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
      }}
    >
      <TrelloCardContent
        issue={issue}
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
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
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
  roleName,
  onOpenIssue,
  onEditIssue,
  onDeleteIssue,
  onViewActivity,
  onUnlockIssue,
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
  roleName: string;
  onOpenIssue: (issue: BoardIssue) => void;
  onEditIssue: (issue: BoardIssue) => void;
  onDeleteIssue: (issue: BoardIssue) => void;
  onViewActivity: (issue: BoardIssue) => void;
  onUnlockIssue: (issueId: number) => void;
}) {
  const { setNodeRef: setDroppableNodeRef, isOver: isColumnOver } = useDroppable({
    id: `status-drop-${status.id}`,
    data: { type: "status-drop", statusId: status.id },
  });

  const theme = useTheme();

  const color = getColumnColor(status.name, theme);
  const visibleIssues = [...items].sort((a, b) => b.id - a.id);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (hasMore && !loading && el.scrollTop + el.clientHeight >= el.scrollHeight - 48) {
      onLoadMore(status.id);
    }
  };

  return (
    <Box
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
      <SortableContext items={visibleIssues.map((i) => `issue-${i.id}`)} strategy={verticalListSortingStrategy}>
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
          {visibleIssues.map((issue) => (
            <TrelloCard
              key={issue.id}
              issue={issue}
              canManage={canManage}
              canEdit={canEdit}
              canDelete={canDelete && (roleName !== "customer" || status.name.toLowerCase() === "backlog")}
              canUnlockIssue={canUnlockIssue}
              onOpen={onOpenIssue}
              onEdit={onEditIssue}
              onDelete={onDeleteIssue}
              onViewActivity={onViewActivity}
              onUnlock={(iss) => onUnlockIssue(iss.id)}
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
        <RestoreFromTrashIcon color="error" />
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
  const [tab, setTab] = useState<"comments" | "history">(initialTab);
  const [comments, setComments] = useState<Comment[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localIssue, setLocalIssue] = useState<BoardIssue | null>(null);
  const [draftPriorityId, setDraftPriorityId] = useState<number | null>(null);
  const [draftProgrammerId, setDraftProgrammerId] = useState<number | null>(null);
  const [draftLabelIds, setDraftLabelIds] = useState<number[]>([]);
  const [priorities, setPriorities] = useState<IssuePriority[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const currentUser = useAuthStore((s) => s.user) ?? null;
  const currentUserId = currentUser?.id ?? null;
  const t = useTranslations("Boards");

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
  const canAssign = can("user.view") && can("issue.assign");
  const canViewAttachments = can("board.view");
  const canUploadAttachment = can("issue.create") && !readOnly;
  const canDeleteAttachment = can("issue.all.update") && !readOnly;

  useEffect(() => {
    setLocalIssue(issue);
    setDraftPriorityId(issue?.priorityId ?? null);
    setDraftProgrammerId(issue?.programmerId ?? null);
    setDraftLabelIds(issue?.labelIds ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue?.id]);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!issue || !open) return;
    setLoading(true);
    setError(null);
    Promise.all([
      canViewComments ? fetchIssueComments(issue.id).then((r) => r.data) : Promise.resolve([] as Comment[]),
      canViewHistory ? fetchIssueActivity(issue.id) : Promise.resolve([] as ActivityLog[]),
      canViewAttachments ? fetchAttachments(issue.id) : Promise.resolve([] as Attachment[]),
      canSetPriority
        ? fetchPriorities().then((r) => r.data)
        : Promise.resolve([] as IssuePriority[]),
      canAssign
        ? fetchUsers().then((r) => r.data)
        : Promise.resolve([] as UserSummary[]),
    ])
      .then(([c, l, a, p, u]) => {
        setComments(c);
        setLogs(l);
        setAttachments(a);
        setPriorities(p);
        setUsers(u);
      })
      .catch((e) => setError(getErrorMessage(e, "โหลดข้อมูลไม่สำเร็จ")))
      .finally(() => setLoading(false));
  }, [issue, open, canViewComments, canViewHistory, canViewAttachments, canSetPriority, canAssign]);

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
      setError(getErrorMessage(e, "ส่งความคิดเห็นไม่สำเร็จ"));
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
      setError(getErrorMessage(e, "แก้ไขความคิดเห็นไม่สำเร็จ"));
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
      setError(getErrorMessage(e, "ลบความคิดเห็นไม่สำเร็จ"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleSetPriority = (priorityId: number | null) => {
    setPriorityAnchor(null);
    setDraftPriorityId(priorityId);
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
      setError(getErrorMessage(e, "สร้ายป้ายไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  const sortedEqual = (a: number[], b: number[]) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

  const hasDraftChanges =
    (localIssue?.priorityId ?? null) !== draftPriorityId ||
    (localIssue?.programmerId ?? null) !== draftProgrammerId ||
    !sortedEqual(localIssue?.labelIds ?? [], draftLabelIds);

  const resetDrafts = () => {
    setDraftPriorityId(localIssue?.priorityId ?? null);
    setDraftProgrammerId(localIssue?.programmerId ?? null);
    setDraftLabelIds(localIssue?.labelIds ?? []);
  };

  const handleCancel = () => {
    resetDrafts();
    onClose();
  };

  const handleSave = async () => {
    if (!localIssue || saving) return;
    setSaving(true);
    try {
      const data: { priorityId?: number | null; labelIds?: number[] } = {};
      if ((localIssue.priorityId ?? null) !== draftPriorityId) {
        data.priorityId = draftPriorityId;
      }
      if (!sortedEqual(localIssue.labelIds ?? [], draftLabelIds)) {
        data.labelIds = draftLabelIds;
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
      setError(getErrorMessage(e, "บันทึกไม่สำเร็จ"));
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

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !localIssue) return;
    setAttachmentUploading(true);
    try {
      const uploaded = await uploadAttachment(localIssue.id, file);
      setAttachments((prev) => [...prev, uploaded]);
      onRefresh();
    } catch (err) {
      setError(getErrorMessage(err, "อัปโหลดไฟล์ไม่สำเร็จ"));
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
      setError(getErrorMessage(err, "ลบไฟล์ไม่สำเร็จ"));
    }
  };

  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down("md"));
  const current = localIssue;
  const status = current?.statusId ? statuses.find((s) => s.id === current.statusId) : null;
  const statusName = status ? (status.customName ?? status.name) : null;
  const categoryName = current ? getCategoryLabel(current) : "—";
  const draftPriority = priorities.find((p) => p.id === draftPriorityId) ?? null;
  const draftPriorityName = draftPriority?.name ?? null;
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
                {t("detail.category")}
              </Typography>
              <Chip
                icon={<CategoryIcon sx={{ fontSize: 16 }} />}
                label={categoryName}
                size="small"
                sx={{ mt: 0.5, fontSize: "0.75rem", fontWeight: 600 }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t("detail.priority")}
              </Typography>
              {canSetPriority ? (
                <Chip
                  size="small"
                  label={
                    draftPriorityName
                      ? PRIORITY_LABELS[draftPriorityName.toLowerCase()] ?? draftPriorityName
                      : t("detail.selectPriority")
                  }
                  color={PRIORITY_COLORS[draftPriorityName?.toLowerCase() ?? ""] ?? "default"}
                  variant="outlined"
                  disabled={saving}
                  onClick={(e) => setPriorityAnchor(e.currentTarget)}
                  sx={{ fontWeight: 600, fontSize: "0.7rem", mt: 0.5 }}
                />
              ) : draftPriorityName ? (
                <Chip
                  label={PRIORITY_LABELS[draftPriorityName.toLowerCase()] ?? draftPriorityName}
                  size="small"
                  variant="outlined"
                  color={PRIORITY_COLORS[draftPriorityName.toLowerCase()] ?? "default"}
                  sx={{ fontSize: "0.7rem", fontWeight: 600, mt: 0.5 }}
                />
              ) : (
                <Typography variant="body2" sx={{ mt: 0.5 }}>—</Typography>
              )}
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t("detail.status")}
              </Typography>
              <Chip
                label={statusName ?? "—"}
                size="small"
                sx={{
                  mt: 0.5,
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  bgcolor: statusName ? `${getColumnColor(statusName, theme)}20` : undefined,
                  color: statusName ? getColumnColor(statusName, theme) : undefined,
                  border: statusName ? `1px solid ${getColumnColor(statusName, theme)}` : undefined,
                }}
              />
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
                <Typography variant="body2">{current?.customerName ?? "—"}</Typography>
              </Box>
            </Grid>
            <Grid item xs={12} sm={4}>
              <Typography variant="caption" color="text.secondary" display="block">
                {t("detail.assignee")}
              </Typography>
              {canAssign ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5 }}>
                  {member ? (
                    <Chip
                      size="small"
                      disabled={saving}
                      avatar={
                        <Avatar
                          sx={{
                            width: 24,
                            height: 24,
                            fontSize: "0.7rem",
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
                    <Chip label={t("detail.unassigned")} size="small" variant="outlined" />
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
                  variant={draftPriorityId === p.id ? "filled" : "outlined"}
                  disabled={saving}
                  onClick={() => handleSetPriority(p.id)}
                  sx={{ fontWeight: 600 }}
                />
              ))}
            {draftPriorityId && (
              <Button size="small" disabled={saving} onClick={() => handleSetPriority(null)}>
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
            PaperProps={{ sx: { width: 300, p: 1.5, display: "flex", flexDirection: "column", gap: 1 } }}
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
            PaperProps={{ sx: { width: 280, p: 1.5, display: "flex", flexDirection: "column", gap: 1 } }}
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
          {error && (
            <Alert severity="error" sx={{ m: 2, mt: 0 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
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
        {!readOnly && (
          <Button size="small" variant="outlined" onClick={handleCancel} disabled={saving}>
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

function FilterSectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.5 }}>
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          borderRadius: "8px",
          bgcolor: "action.selected",
          color: "primary.main",
        }}
      >
        {icon}
      </Box>
      <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
        {title}
      </Typography>
      {count > 0 && (
        <Chip
          size="small"
          label={count}
          sx={{ height: 22, minWidth: 22, fontSize: 11, fontWeight: 700 }}
        />
      )}
    </Box>
  );
}

function FilterChip({
  label,
  selected,
  onClick,
  color,
  avatar,
  icon,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  color?: string;
  avatar?: React.ReactElement;
  icon?: React.ReactElement;
}) {
  const theme = useTheme();
  const active = color ?? theme.palette.primary.main;
  const contrast = theme.palette.getContrastText(active);
  return (
    <Chip
      label={label}
      onClick={onClick}
      avatar={avatar}
      icon={icon}
      variant={selected ? "filled" : "outlined"}
      sx={{
        borderRadius: "9px",
        fontWeight: selected ? 600 : 400,
        borderColor: selected ? active : "divider",
        backgroundColor: selected ? active : "background.paper",
        color: selected ? contrast : "text.primary",
        transition: "all 0.15s ease",
        "&:hover": {
          borderColor: active,
          backgroundColor: selected ? active : alpha(active, 0.08),
        },
        ...(icon
          ? {
              "& .MuiChip-icon": {
                color: selected ? contrast : active,
                marginLeft: "10px",
              },
            }
          : {}),
        ...(avatar
          ? {
              "& .MuiChip-avatar": {
                bgcolor: selected ? alpha("#ffffff", 0.28) : theme.palette.grey[300],
                color: selected ? "#ffffff" : "text.primary",
              },
            }
          : {}),
      }}
    />
  );
}

function StatusFilterDialog({
  open,
  statuses,
  priorities,
  categories,
  users,
  selectedStatusIds,
  selectedPriorityIds,
  selectedCategoryIds,
  selectedAssigneeIds,
  selectedReporterIds,
  searchQuery,
  isCustomer,
  onToggleStatus,
  onTogglePriority,
  onToggleCategory,
  onToggleAssignee,
  onToggleReporter,
  onSearchChange,
  onSelectAllStatuses,
  onClearAll,
  onClose,
}: {
  open: boolean;
  statuses: IssueStatus[];
  priorities: IssuePriority[];
  categories: Category[];
  users: UserSummary[];
  selectedStatusIds: number[];
  selectedPriorityIds: number[];
  selectedCategoryIds: number[];
  selectedAssigneeIds: string[];
  selectedReporterIds: string[];
  searchQuery: string;
  isCustomer: boolean;
  onToggleStatus: (statusId: number) => void;
  onTogglePriority: (priorityId: number) => void;
  onToggleCategory: (categoryId: number) => void;
  onToggleAssignee: (userId: string) => void;
  onToggleReporter: (userId: string) => void;
  onSearchChange: (query: string) => void;
  onSelectAllStatuses: () => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const programmers = users.filter((u) => u.isActive && u.roleName === "programmer");
  const customers = users.filter((u) => u.isActive && u.roleName === "customer");
  const totalSelected =
    selectedStatusIds.length +
    selectedPriorityIds.length +
    selectedCategoryIds.length +
    selectedAssigneeIds.length +
    selectedReporterIds.length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 2.5,
          py: 1.75,
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
          ตัวกรอง
        </Typography>
        {totalSelected > 0 && (
          <Chip
            size="small"
            label={`${totalSelected} รายการ`}
            color="primary"
            sx={{ height: 22, fontSize: 11, fontWeight: 700 }}
          />
        )}
        <IconButton size="small" onClick={onClose} aria-label="close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ p: 2.5, maxHeight: "62vh", overflowY: "auto" }}>
          <TextField
            fullWidth
            size="small"
            placeholder="ค้นหาชื่องาน..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => onSearchChange("")} aria-label="clear">
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: "10px",
                bgcolor: "background.paper",
              },
            }}
          />

          <Box sx={{ mt: 2.5 }}>
            <FilterSectionHeader
              icon={<ViewKanbanIcon sx={{ fontSize: 18 }} />}
              title="สถานะ"
              count={selectedStatusIds.length}
            />
            {statuses.length > 0 ? (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                {statuses.map((status) => {
                  const selected = selectedStatusIds.includes(status.id);
                  const color = getStatusColor(theme, status.name);
                  return (
                    <FilterChip
                      key={status.id}
                      label={status.name}
                      selected={selected}
                      onClick={() => onToggleStatus(status.id)}
                      color={color}
                      icon={
                        <Box
                          component="span"
                          sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }}
                        />
                      }
                    />
                  );
                })}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                ไม่พบสถานะ
              </Typography>
            )}
          </Box>

          <Divider sx={{ my: 2.5 }} />

          <FilterSectionHeader
            icon={<FlagIcon sx={{ fontSize: 18 }} />}
            title="ความสำคัญ"
            count={selectedPriorityIds.length}
          />
          {priorities.length > 0 ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {priorities.map((priority) => {
                const selected = selectedPriorityIds.includes(priority.id);
                return (
                  <FilterChip
                    key={priority.id}
                    label={priority.name}
                    selected={selected}
                    onClick={() => onTogglePriority(priority.id)}
                    color={getPriorityColor(theme, priority.name)}
                    icon={<FlagIcon sx={{ fontSize: 16 }} />}
                  />
                );
              })}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              ไม่พบความสำคัญ
            </Typography>
          )}

          <Divider sx={{ my: 2.5 }} />

          <FilterSectionHeader
            icon={<CategoryIcon sx={{ fontSize: 18 }} />}
            title="หมวดหมู่"
            count={selectedCategoryIds.length}
          />
          {categories.length > 0 ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {categories.map((cat) => {
                const selected = selectedCategoryIds.includes(cat.id);
                return (
                  <FilterChip
                    key={cat.id}
                    label={cat.name}
                    selected={selected}
                    onClick={() => onToggleCategory(cat.id)}
                    color={theme.palette.secondary.main}
                    icon={<CategoryIcon sx={{ fontSize: 16 }} />}
                  />
                );
              })}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              ไม่พบหมวดหมู่
            </Typography>
          )}

          <Divider sx={{ my: 2.5 }} />

          <FilterSectionHeader
            icon={<PersonIcon sx={{ fontSize: 18 }} />}
            title="ผู้รับผิดชอบ"
            count={selectedAssigneeIds.length}
          />
          {programmers.length > 0 ? (
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
              {programmers.map((user) => {
                const selected = selectedAssigneeIds.includes(user.id);
                return (
                  <FilterChip
                    key={user.id}
                    label={user.name}
                    selected={selected}
                    onClick={() => onToggleAssignee(user.id)}
                    avatar={
                      <Avatar sx={{ width: 22, height: 22, fontSize: 11 }}>
                        {getInitials(user.name)}
                      </Avatar>
                    }
                  />
                );
              })}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              ไม่พบโปรแกรมเมอร์
            </Typography>
          )}

          {!isCustomer && (
            <>
              <Divider sx={{ my: 2.5 }} />

              <FilterSectionHeader
                icon={<ChatBubbleOutlineIcon sx={{ fontSize: 18 }} />}
                title="ผู้แจ้ง"
                count={selectedReporterIds.length}
              />
              {customers.length > 0 ? (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                  {customers.map((user) => {
                    const selected = selectedReporterIds.includes(user.id);
                    return (
                      <FilterChip
                        key={user.id}
                        label={user.name}
                        selected={selected}
                        onClick={() => onToggleReporter(user.id)}
                        avatar={
                          <Avatar sx={{ width: 22, height: 22, fontSize: 11 }}>
                            {getInitials(user.name)}
                          </Avatar>
                        }
                      />
                    );
                  })}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  ไม่พบลูกค้า
                </Typography>
              )}
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Button
          size="small"
          onClick={onSelectAllStatuses}
          disabled={statuses.length === 0}
          startIcon={<CheckIcon fontSize="small" />}
        >
          เลือกทั้งหมด
        </Button>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            size="small"
            onClick={onClearAll}
            startIcon={<DeleteOutlineIcon fontSize="small" />}
            disabled={totalSelected === 0 && searchQuery === ""}
          >
            ล้างทั้งหมด
          </Button>
          <Button variant="contained" size="small" onClick={onClose}>
            ปิด
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
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

function KanbanView({
  statuses,
  labels,
  priorities,
  categories,
  users,
  selectedStatusIds,
  selectedPriorityIds,
  selectedCategoryIds,
  selectedAssigneeIds,
  selectedReporterIds,
  searchQuery,
  canManage,
  canEdit,
  canDelete,
  canUnlockIssue,
  onRefresh,
  toolbar,
  roleName,
}: {
  statuses: IssueStatus[];
  labels: Label[];
  priorities: IssuePriority[];
  categories: Category[];
  users: UserSummary[];
  selectedStatusIds: number[];
  selectedPriorityIds: number[];
  selectedCategoryIds: number[];
  selectedAssigneeIds: string[];
  selectedReporterIds: string[];
  searchQuery: string;
  canManage: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canUnlockIssue: boolean;
  onRefresh: () => void;
  toolbar: React.ReactNode;
  roleName: string;
}) {
  const t = useTranslations("Boards");
  const theme = useTheme();
  const [activeIssue, setActiveIssue] = useState<BoardIssue | null>(null);
  const [activeStatus, setActiveStatus] = useState<IssueStatus | null>(null);
  const [detailIssue, setDetailIssue] = useState<BoardIssue | null>(null);
  const [editIssue, setEditIssue] = useState<BoardIssue | null>(null);
  const [detailTab, setDetailTab] = useState<"comments" | "history">("comments");
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [issueToDelete, setIssueToDelete] = useState<BoardIssue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localStatuses, setLocalStatuses] = useState<IssueStatus[]>(statuses);
  const [columns, setColumns] = useState<Record<number, KanbanColumnState>>({});
  const [dragStartStatusId, setDragStartStatusId] = useState<number | null>(null);
  const [hoverStatusId, setHoverStatusId] = useState<number | null>(null);
  const dragTargetStatusId = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const requestSeqRef = useRef<Record<number, number>>({});

  const debouncedSearch = useDebouncedValue(searchQuery);

  const visibleStatuses = useMemo(
    () =>
      selectedStatusIds.length === 0
        ? localStatuses
        : localStatuses.filter((s) => selectedStatusIds.includes(s.id)),
    [localStatuses, selectedStatusIds],
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
            assigneeIds: selectedAssigneeIds,
            reporterIds: selectedReporterIds,
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
        setError(getErrorMessage(e, "โหลดข้อมูลไม่สำเร็จ"));
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
      selectedPriorityIds,
      selectedCategoryIds,
      selectedAssigneeIds,
      selectedReporterIds,
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

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    isDraggingRef.current = true;
    dragTargetStatusId.current = null;
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
      return;
    }
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

    if (!targetStatusId || activeIssue.statusId === targetStatusId) {
      return;
    }

    dragTargetStatusId.current = targetStatusId;
    setHoverStatusId(targetStatusId);
    setColumns((prev) => {
      const sourceId = activeIssue.statusId ?? 0;
      const source = prev[sourceId];
      if (!source) return prev;
      const moved = { ...activeIssue, statusId: targetStatusId };
      const next = { ...prev };
      next[sourceId] = { ...source, items: source.items.filter((i) => i.id !== activeId) };
      const target = next[targetStatusId] ?? { items: [], page: 1, total: 0, loading: false };
      next[targetStatusId] = { ...target, items: [...target.items, moved] };
      return next;
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveIssue(null);
    setActiveStatus(null);
    setHoverStatusId(null);
    isDraggingRef.current = false;

    if (!over) {
      if (dragStartStatusId !== null) reloadColumns([dragStartStatusId]);
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

      const oldIndex = localStatuses.findIndex((s) => s.id === activeStatusId);
      const newIndex = localStatuses.findIndex((s) => s.id === overStatusId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(localStatuses, oldIndex, newIndex);
      setLocalStatuses(reordered);
      try {
        await reorderStatuses(
          reordered.map((s, idx) => ({ id: s.id, sortOrder: idx + 1 }))
        );
      } catch (e) {
        setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
        onRefresh();
      }
      return;
    }

    const issueId = Number(String(active.id).replace("issue-", ""));

    const issue = issueMap.get(issueId);
    if (!issue || issue.isLocked) {
      if (dragStartStatusId !== null) reloadColumns([dragStartStatusId]);
      setDragStartStatusId(null);
      return;
    }

    const sourceStatusId = dragStartStatusId;
    const targetStatusId = dragTargetStatusId.current;
    dragTargetStatusId.current = null;

    if (targetStatusId === null) {
      if (sourceStatusId !== null) reloadColumns([sourceStatusId]);
      setDragStartStatusId(null);
      return;
    }
    if (sourceStatusId !== null && targetStatusId === sourceStatusId) {
      setDragStartStatusId(null);
      reloadColumns([sourceStatusId]);
      return;
    }

    try {
      await moveIssue(issueId, targetStatusId);
      reloadColumns(sourceStatusId !== null ? [sourceStatusId, targetStatusId] : [targetStatusId]);
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
      onRefresh();
    } finally {
      setDragStartStatusId(null);
    }
  };

  const handleDragCancel = () => {
    setActiveIssue(null);
    setActiveStatus(null);
    if (dragStartStatusId !== null) reloadColumns([dragStartStatusId]);
    setDragStartStatusId(null);
    setHoverStatusId(null);
    isDraggingRef.current = false;
    dragTargetStatusId.current = null;
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
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
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
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleAddColumn = async (name: string, description: string) => {
    try {
      await createStatus(name, description);
      setAddColumnOpen(false);
      onRefresh();
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const handleUnlockIssue = async (issueId: number) => {
    try {
      await unlockIssue(issueId);
      reloadColumns();
    } catch (e) {
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  return (
    <Box sx={{ width: "100%", minWidth: 0 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
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
                roleName={roleName}
                onOpenIssue={(issue) => { setDetailIssue(issue); setDetailTab("comments"); }}
                onEditIssue={(issue) => { setDetailIssue(issue); setDetailTab("comments"); }}
                onDeleteIssue={(issue) => { setDetailIssue(null); setIssueToDelete(issue); }}
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
                <TrelloCardContent issue={activeIssue} />
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
  selectedAssigneeIds,
  selectedReporterIds,
  searchQuery,
  canManage,
  canSeeReporter,
  canViewOwnHistory,
  currentUserId,
  onRefresh,
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
  selectedAssigneeIds: string[];
  selectedReporterIds: string[];
  searchQuery: string;
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
  const [detailTab, setDetailTab] = useState<"comments" | "history">("comments");
  const [issueToDelete, setIssueToDelete] = useState<BoardIssue | null>(null);
  const [actionAnchor, setActionAnchor] = useState<{
    el: HTMLElement;
    issue: BoardIssue;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const hasActiveFilters =
    selectedStatusIds.length > 0 ||
    selectedPriorityIds.length > 0 ||
    selectedCategoryIds.length > 0 ||
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
  }, [issues, statuses, categories, selectedStatusIds, selectedPriorityIds, selectedCategoryIds, selectedAssigneeIds, selectedReporterIds, searchQuery, hasActiveFilters]);
  const pageIssues = filteredIssues.slice((page - 1) * 10, page * 10);

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
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
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
      setError(getErrorMessage(e, "เกิดข้อผิดพลาด"));
    }
  };

  const getStatusName = (statusId: number | null): string => {
    if (!statusId) return "—";
    const s = statuses.find((st) => st.id === statusId);
    return s ? (s.customName ?? s.name) : "—";
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
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden", border: "1px solid", borderColor: "divider", minWidth: 0 }}>
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: theme.custom.tableStripe }}>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>ID</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>หัวข้อ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>หมวดหมู่</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>ความสำคัญ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>สถานะ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>ผู้รับผิดชอบ</th>
                {canSeeReporter && (
                  <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>ผู้แจ้ง</th>
                )}
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>สร้างเมื่อ</th>
                {(canManage || canViewOwnHistory) && (
                  <th style={{ padding: "12px", textAlign: "right", fontWeight: 600, fontSize: "0.8rem", width: "1%", whiteSpace: "nowrap" }}>จัดการ</th>
                )}
              </tr>
            </thead>
            <tbody>
              {pageIssues.map((issue) => (
                <tr
                  key={issue.id}
                  onClick={() => { setDetailIssue(issue); setDetailTab("comments"); }}
                  style={{
                    borderBottom: `1px solid ${theme.custom.tableBorder}`,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.palette.action.hover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "";
                  }}
                >
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    <Typography variant="caption" color="common.black" fontWeight={700}>{issue.issueNumber}</Typography>
                  </td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    <Typography variant="body2" fontWeight={600}>
                      {issue.title}
                    </Typography>
                  </td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>{getCategoryLabel(issue)}</td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    {issue.priorityName ? (
                      <Chip
                        label={PRIORITY_LABELS[issue.priorityName.toLowerCase()] ?? issue.priorityName}
                        size="small"
                        variant="outlined"
                        color={PRIORITY_COLORS[issue.priorityName.toLowerCase()] ?? "default"}
                        sx={{ fontSize: "0.7rem", fontWeight: 600 }}
                      />
                    ) : "—"}
                  </td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    <Chip
                      label={getStatusName(issue.statusId)}
                      size="small"
                      sx={{
                        bgcolor: `${getColumnColor(getStatusName(issue.statusId), theme)}20`,
                        color: getColumnColor(getStatusName(issue.statusId), theme),
                        border: `1px solid ${getColumnColor(getStatusName(issue.statusId), theme)}`,
                        fontWeight: 600,
                        fontSize: "0.7rem",
                      }}
                    />
                  </td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>{issue.programmerName ?? "รอมอบหมาย"}</td>
                  {canSeeReporter && (
                    <td style={{ padding: "12px", fontSize: "0.8rem" }}>{issue.customerName ?? "—"}</td>
                  )}
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    {new Date(issue.createdAt).toLocaleDateString("th-TH")}
                  </td>
                  {(canManage || canViewOwnHistory) && (
                    <td style={{ padding: "12px", fontSize: "0.8rem", textAlign: "right", width: "1%", whiteSpace: "nowrap" }}>
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
  const isBoardView = view === "board";
  const isTableView = view === "table";
  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [priorities, setPriorities] = useState<IssuePriority[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedStatusIds, setSelectedStatusIds] = useState<number[]>([]);
  const [selectedPriorityIds, setSelectedPriorityIds] = useState<number[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [selectedReporterIds, setSelectedReporterIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [recycleBinOpen, setRecycleBinOpen] = useState(false);
  const [trashedIssues, setTrashedIssues] = useState<TrashedIssue[]>([]);
  const [trashDetailIssue, setTrashDetailIssue] = useState<TrashedIssue | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = can("issue.all.update");
  const canDelete = can("issue.delete");
  const canAssign = can("issue.assign");
  const canUnlockIssue = can("issue.all.update");
  const canManage = canEdit || canDelete || canAssign;
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

  const handleClearAllFilters = () => {
    setSelectedStatusIds([]);
    setSelectedPriorityIds([]);
    setSelectedCategoryIds([]);
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
        fetchUsers(),
      ]);
      const [iss, lbls, sts, pri, cats, usr] = results;
      if (iss.status === "fulfilled") setIssues(iss.value.data);
      if (lbls.status === "fulfilled") setLabels(lbls.value.data);
      if (sts.status === "fulfilled") setStatuses(sts.value.data);
      if (pri.status === "fulfilled") setPriorities(pri.value.data);
      if (cats.status === "fulfilled") setCategories(cats.value.data);
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
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <RequirePermission permission="board.view">
      <DashboardLayout>
        <Box sx={{ pb: 2 }}>
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
            isBoardView ? (
              <KanbanView
                statuses={statuses}
                labels={labels}
                priorities={priorities}
                categories={categories}
                users={users}
                selectedStatusIds={selectedStatusIds}
                selectedPriorityIds={selectedPriorityIds}
                selectedCategoryIds={selectedCategoryIds}
                selectedAssigneeIds={selectedAssigneeIds}
                selectedReporterIds={selectedReporterIds}
                searchQuery={searchQuery}
                canManage={canManage}
                canEdit={canEdit}
                canDelete={canDelete}
                canUnlockIssue={canUnlockIssue}
                onRefresh={() => loadData(false)}
                roleName={roleName}
                toolbar={
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
                    />
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: "auto" }}>
                      {!isCustomer && (
                        <>
                          <Tooltip title={t("board")}>
                            <IconButton
                              size="small"
                              onClick={() => setView("board")}
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
                              onClick={() => setView("table")}
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
                        </>
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
                      <Tooltip title={t("filter")}>
                        <IconButton
                          size="small"
                          onClick={() => setFilterOpen(true)}
                          sx={{ width: 36, height: 36 }}
                        >
                          <FilterListIcon sx={{ fontSize: 20, color: "text.secondary" }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                }
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
                selectedAssigneeIds={selectedAssigneeIds}
                selectedReporterIds={selectedReporterIds}
                searchQuery={searchQuery}
                canManage={canManage}
                canSeeReporter={canSeeReporter}
                canViewOwnHistory={canViewOwnHistory}
                currentUserId={currentUserId}
                onRefresh={() => loadData(false)}
                toolbar={
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
                    />
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: "auto" }}>
                      {!isCustomer && (
                        <>
                          <Tooltip title={t("board")}>
                            <IconButton
                              size="small"
                              onClick={() => setView("board")}
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
                              onClick={() => setView("table")}
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
                        </>
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
                      <Tooltip title={t("filter")}>
                        <IconButton
                          size="small"
                          onClick={() => setFilterOpen(true)}
                          sx={{ width: 36, height: 36 }}
                        >
                          <FilterListIcon sx={{ fontSize: 20, color: "text.secondary" }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
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
            selectedStatusIds={selectedStatusIds}
            selectedPriorityIds={selectedPriorityIds}
            selectedCategoryIds={selectedCategoryIds}
            selectedAssigneeIds={selectedAssigneeIds}
            selectedReporterIds={selectedReporterIds}
            searchQuery={searchQuery}
            isCustomer={isCustomer}
            onToggleStatus={handleToggleStatusFilter}
            onTogglePriority={handleTogglePriorityFilter}
            onToggleCategory={handleToggleCategoryFilter}
            onToggleAssignee={handleToggleAssigneeFilter}
            onToggleReporter={handleToggleReporterFilter}
            onSearchChange={setSearchQuery}
            onSelectAllStatuses={handleSelectAllStatuses}
            onClearAll={handleClearAllFilters}
            onClose={() => setFilterOpen(false)}
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
        </Box>

      </DashboardLayout>
    </RequirePermission>
  );
}
