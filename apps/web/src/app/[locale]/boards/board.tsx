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
  Tabs,
  Tab,
  Paper,
  Avatar,
  Tooltip,
  Divider,
} from "@mui/material";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
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
import { useTranslations } from "next-intl";
import { usePermissions } from "@/lib/permissions";
import { useAuthStore } from "@/lib/auth-store";
import { apiFetch } from "@/lib/api";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequireAuth from "@/components/require-auth";
import {
  fetchBoards,
  fetchBoard,
  createBoard,
  createColumn,
  deleteColumn,
  createIssue,
  moveIssue,
  assignIssue,
  deleteIssue,
  fetchIssueActivity,
  type Board,
  type BoardDetail,
  type BoardColumn,
  type BoardIssue,
  type ActivityLog,
} from "@/lib/board-api";

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

const COLUMN_COLORS: Record<string, string> = {
  backlog: "#9e9e9e",
  todo: "#42a5f5",
  doing: "#ffa726",
  done: "#66bb6a",
  review: "#ab47bc",
};

function getColumnColor(status: string): string {
  const key = status.toLowerCase();
  return COLUMN_COLORS[key] ?? "#78909c";
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

function TrelloCard({
  issue,
  canManage,
  onEdit,
  onDelete,
  onViewActivity,
}: {
  issue: BoardIssue;
  canManage: boolean;
  onEdit: (issue: BoardIssue) => void;
  onDelete: (issue: BoardIssue) => void;
  onViewActivity: (issue: BoardIssue) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const priorityColor = issue.priorityName
    ? PRIORITY_COLORS[issue.priorityName.toLowerCase()] ?? "default"
    : "default";

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(canManage ? listeners : {})}
      elevation={1}
      sx={{
        p: 1.5,
        mb: 1,
        cursor: canManage ? "grab" : "default",
        "&:hover": { boxShadow: 3 },
        bgcolor: "background.paper",
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={500}>
          ISS-{String(issue.id).padStart(3, "0")}
        </Typography>
        {issue.priorityName && (
          <Chip
            label={PRIORITY_LABELS[issue.priorityName.toLowerCase()] ?? issue.priorityName}
            size="small"
            color={priorityColor}
            sx={{ height: 20, fontSize: "0.65rem", fontWeight: 600 }}
          />
        )}
      </Box>
      <Typography variant="body2" fontWeight={600} sx={{ mb: 0.5, lineHeight: 1.3 }}>
        {issue.title}
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 0.5 }}>
        {issue.attachmentCount > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.3 }}>
            <AttachFileIcon sx={{ fontSize: 14, color: "text.secondary" }} />
            <Typography variant="caption" color="text.secondary">{issue.attachmentCount}</Typography>
          </Box>
        )}
        {issue.commentCount > 0 && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.3 }}>
            <HistoryIcon sx={{ fontSize: 14, color: "text.secondary" }} />
            <Typography variant="caption" color="text.secondary">{issue.commentCount}</Typography>
          </Box>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
          {formatDate(issue.createdAt)}
        </Typography>
      </Box>
      {canManage && (
        <Box sx={{ display: "flex", gap: 0.5, mt: 0.5, justifyContent: "flex-end" }}>
          <Tooltip title="แก้ไข">
            <IconButton size="small" onClick={() => onEdit(issue)} sx={{ p: 0.3 }}>
              <EditIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="ประวัติ">
            <IconButton size="small" onClick={() => onViewActivity(issue)} sx={{ p: 0.3 }}>
              <HistoryIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="ลบ">
            <IconButton size="small" onClick={() => onDelete(issue)} color="error" sx={{ p: 0.3 }}>
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Paper>
  );
}

function KanbanColumn({
  column,
  issues,
  canManage,
  onAddIssue,
  onEditIssue,
  onDeleteIssue,
  onViewActivity,
  onDeleteColumn,
}: {
  column: BoardColumn;
  issues: BoardIssue[];
  canManage: boolean;
  onAddIssue: (columnId: number) => void;
  onEditIssue: (issue: BoardIssue) => void;
  onDeleteIssue: (issue: BoardIssue) => void;
  onViewActivity: (issue: BoardIssue) => void;
  onDeleteColumn: (columnId: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: "column" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const color = getColumnColor(column.status);

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(canManage ? listeners : {})}
      sx={{
        width: 280,
        minWidth: 280,
        bgcolor: "grey.50",
        borderRadius: 2,
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        maxHeight: "calc(100vh - 200px)",
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }} />
          <Typography variant="subtitle2" fontWeight={700}>
            {column.customName ?? column.status}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Chip
            label={issues.length}
            size="small"
            sx={{
              height: 22,
              minWidth: 22,
              borderRadius: 11,
              bgcolor: "background.paper",
              fontWeight: 600,
            }}
          />
          {canManage && (
            <IconButton size="small" onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ p: 0.3 }}>
              <MoreHorizIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>
      </Box>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem onClick={() => { setMenuAnchor(null); onAddIssue(column.id); }}>
          <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
          <ListItemText>เพิ่มการ์ด</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setMenuAnchor(null); onDeleteColumn(column.id); }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText sx={{ color: "error.main" }}>ลบคอลัมน์</ListItemText>
        </MenuItem>
      </Menu>
      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <Box sx={{ flexGrow: 1, overflowY: "auto", minHeight: 60 }}>
          {issues.map((issue) => (
            <TrelloCard
              key={issue.id}
              issue={issue}
              canManage={canManage}
              onEdit={onEditIssue}
              onDelete={onDeleteIssue}
              onViewActivity={onViewActivity}
            />
          ))}
          {issues.length === 0 && (
            <Box sx={{ py: 2, textAlign: "center" }}>
              <Typography variant="caption" color="text.secondary">ไม่มีการ์ด</Typography>
            </Box>
          )}
        </Box>
      </SortableContext>
      {canManage && (
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => onAddIssue(column.id)}
          sx={{ mt: 1, justifyContent: "flex-start", color: "text.secondary" }}
        >
          เพิ่มการ์ด
        </Button>
      )}
    </Box>
  );
}

function AddColumnInline({
  onAdd,
  onCancel,
}: {
  onAdd: (status: string, customName?: string) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState("");
  const [customName, setCustomName] = useState("");
  const [statuses, setStatuses] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    apiFetch<{ id: number; name: string }[]>("/issue-statuses", {})
      .then(setStatuses)
      .catch(() => setStatuses([]));
  }, []);

  const handleAdd = () => {
    if (!status) return;
    onAdd(status, customName.trim() || undefined);
  };

  return (
    <Box
      sx={{
        width: 280,
        minWidth: 280,
        p: 1.5,
        bgcolor: "grey.50",
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
        <InputLabel>สถานะ</InputLabel>
        <Select
          value={status}
          label="สถานะ"
          onChange={(e) => setStatus(e.target.value as string)}
        >
          {statuses.map((s) => (
            <MenuItem key={s.id} value={s.name}>{s.name}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        fullWidth
        size="small"
        label="ชื่อ (ไม่บังคับ)"
        value={customName}
        onChange={(e) => setCustomName(e.target.value)}
        placeholder="ค่าเริ่มต้น = ชื่อสถานะ"
        sx={{ mb: 1.5 }}
      />
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button size="small" variant="contained" onClick={handleAdd} disabled={!status}>
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

  const formatAction = (log: ActivityLog): string => {
    try {
      const detail = log.detail ? JSON.parse(log.detail) : {};
      switch (log.action) {
        case "card.created":
          return `${log.actorName ?? "ระบบ"} สร้างงาน`;
        case "card.moved":
          return `${log.actorName ?? "ระบบ"} ลาก: ${detail.from ?? "—"} → ${detail.to ?? "—"}`;
        case "card.assigned":
          return `${log.actorName ?? "ระบบ"} มอบหมายให้ ${detail.to ?? "—"}`;
        case "card.edited":
          return `${log.actorName ?? "ระบบ"} แก้ไข: ${(detail.fields ?? []).join(", ")}`;
        case "card.deleted":
          return `${log.actorName ?? "ระบบ"} ลบงาน`;
        default:
          return log.action;
      }
    } catch {
      return log.action;
    }
  };

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
                <Typography variant="body2">{formatAction(log)}</Typography>
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
}: {
  issue: BoardIssue | null;
  columnId: number | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: { title: string; description: string; columnId: number }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [colId, setColId] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(issue?.title ?? "");
      setDescription(issue?.description ?? "");
      setColId(issue?.columnId ?? columnId);
    }
  }, [open, issue, columnId]);

  const handleSave = () => {
    if (!title.trim() || !colId) return;
    onSave({ title: title.trim(), description: description.trim(), columnId: colId });
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

function ReportIssueDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; categoryId: number; description: string; files: File[] }) => void;
}) {
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch<{ id: number; name: string }[]>("/categories", {})
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [open]);

  useEffect(() => {
    if (open) {
      setTitle("");
      setCategoryId("");
      setDescription("");
      setFiles([]);
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!title.trim() || !categoryId) return;
    onSubmit({ title: title.trim(), categoryId: categoryId as number, description: description.trim(), files });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>แจ้งปัญหาใหม่</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="หัวข้อ"
          fullWidth
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <FormControl fullWidth margin="dense">
          <InputLabel>หมวดหมู่</InputLabel>
          <Select
            value={categoryId}
            label="หมวดหมู่"
            onChange={(e) => setCategoryId(e.target.value as number)}
          >
            {categories.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          margin="dense"
          label="รายละเอียด"
          fullWidth
          multiline
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
                    p: 0.5,
                    bgcolor: "grey.50",
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="caption" sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
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
      <DialogActions>
        <Button onClick={onClose}>ยกเลิก</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={!title.trim() || !categoryId}>
          ส่ง
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function KanbanView({
  board,
  canManage,
  onRefresh,
}: {
  board: BoardDetail;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [activeIssue, setActiveIssue] = useState<BoardIssue | null>(null);
  const [editIssue, setEditIssue] = useState<BoardIssue | null>(null);
  const [addIssueColumnId, setAddIssueColumnId] = useState<number | null>(null);
  const [activityIssue, setActivityIssue] = useState<BoardIssue | null>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [deleteColumnId, setDeleteColumnId] = useState<number | null>(null);
  const [issueToDelete, setIssueToDelete] = useState<BoardIssue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const issue = board.issues.find((i) => i.id === active.id);
    setActiveIssue(issue ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveIssue(null);

    if (!over || !canManage) return;

    const issueId = active.id as number;
    const targetColumnId = over.id as number;

    const issue = board.issues.find((i) => i.id === issueId);
    if (!issue || issue.columnId === targetColumnId) return;

    try {
      await moveIssue(issueId, targetColumnId);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    }
  };

  const handleSaveIssue = async (data: { title: string; description: string; columnId: number }) => {
    try {
      if (editIssue) {
        await createIssue(board.id, { ...data, columnId: editIssue.columnId ?? data.columnId });
      } else {
        await createIssue(board.id, data);
      }
      setEditIssue(null);
      setAddIssueColumnId(null);
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

  const handleAddColumn = async (status: string, customName?: string) => {
    try {
      await createColumn(board.id, status, customName);
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

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 2 }}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={board.columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                issues={board.issues.filter((i) => i.columnId === column.id)}
                canManage={canManage}
                onAddIssue={(colId) => setAddIssueColumnId(colId)}
                onEditIssue={(issue) => setEditIssue(issue)}
                onDeleteIssue={(issue) => setIssueToDelete(issue)}
                onViewActivity={(issue) => setActivityIssue(issue)}
                onDeleteColumn={(colId) => setDeleteColumnId(colId)}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeIssue ? (
              <Paper elevation={3} sx={{ p: 1.5, width: 260, borderRadius: 1.5 }}>
                <Typography variant="body2" fontWeight={600}>
                  {activeIssue.title}
                </Typography>
              </Paper>
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
      <IssueDialog
        issue={editIssue}
        columnId={addIssueColumnId}
        open={!!editIssue || !!addIssueColumnId}
        onClose={() => {
          setEditIssue(null);
          setAddIssueColumnId(null);
        }}
        onSave={handleSaveIssue}
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
  board,
  canManage,
  onRefresh,
}: {
  board: BoardDetail;
  canManage: boolean;
  onRefresh: () => void;
}) {
  const [editIssue, setEditIssue] = useState<BoardIssue | null>(null);
  const [addIssueColumnId, setAddIssueColumnId] = useState<number | null>(null);
  const [activityIssue, setActivityIssue] = useState<BoardIssue | null>(null);
  const [issueToDelete, setIssueToDelete] = useState<BoardIssue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSaveIssue = async (data: { title: string; description: string; columnId: number }) => {
    try {
      if (editIssue) {
        await createIssue(board.id, { ...data, columnId: editIssue.columnId ?? data.columnId });
      } else {
        await createIssue(board.id, data);
      }
      setEditIssue(null);
      setAddIssueColumnId(null);
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
    const col = board.columns.find((c) => c.id === columnId);
    return col ? (col.customName ?? col.status) : "—";
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "hidden", border: "1px solid", borderColor: "divider" }}>
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>ID</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>หัวข้อ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>สถานะ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>ความสำคัญ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>หมวดหมู่</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>ผู้รับผิดชอบ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>สร้างเมื่อ</th>
                {canManage && (
                  <th style={{ padding: "12px", textAlign: "left", fontWeight: 600, fontSize: "0.8rem" }}>จัดการ</th>
                )}
              </tr>
            </thead>
            <tbody>
              {board.issues.map((issue) => (
                <tr key={issue.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    <Typography variant="caption" fontWeight={500}>ISS-{String(issue.id).padStart(3, "0")}</Typography>
                  </td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>{issue.title}</td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    <Chip
                      label={getColumnName(issue.columnId)}
                      size="small"
                      sx={{
                        bgcolor: `${getColumnColor(getColumnName(issue.columnId))}20`,
                        color: getColumnColor(getColumnName(issue.columnId)),
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
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>{issue.programmerName ?? "—"}</td>
                  <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                    {new Date(issue.createdAt).toLocaleDateString("th-TH")}
                  </td>
                  {canManage && (
                    <td style={{ padding: "12px", fontSize: "0.8rem" }}>
                      <Box sx={{ display: "flex", gap: 0.5 }}>
                        <IconButton size="small" onClick={() => setEditIssue(issue)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => setActivityIssue(issue)}>
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => setIssueToDelete(issue)} color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Paper>

      <ActivityLogDialog
        issue={activityIssue}
        open={!!activityIssue}
        onClose={() => setActivityIssue(null)}
      />
      <IssueDialog
        issue={editIssue}
        columnId={addIssueColumnId}
        open={!!editIssue || !!addIssueColumnId}
        onClose={() => {
          setEditIssue(null);
          setAddIssueColumnId(null);
        }}
        onSave={handleSaveIssue}
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
  const [view, setView] = useState<"board" | "table">(roleName === "programmer" ? "table" : "board");
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [boardDetail, setBoardDetail] = useState<BoardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const canManage = can("board.column.create");
  const canReport = can("issue.create");

  const loadBoards = useCallback(async () => {
    try {
      let data = await fetchBoards();
      if (data.length === 0) {
        await createBoard("บอร์ดหลัก");
        data = await fetchBoards();
      }
      setBoards(data);
      if (data.length > 0 && !selectedBoardId) {
        setSelectedBoardId(data[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดบอร์ดไม่สำเร็จ");
    }
  }, [selectedBoardId]);

  const loadBoardDetail = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const data = await fetchBoard(id);
      setBoardDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดบอร์ดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    if (selectedBoardId) {
      loadBoardDetail(selectedBoardId);
    }
  }, [selectedBoardId, loadBoardDetail]);

  const handleReportIssue = async (data: { title: string; categoryId: number; description: string; files: File[] }) => {
    if (!selectedBoardId) return;
    try {
      await createIssue(selectedBoardId, {
        title: data.title,
        description: data.description,
        columnId: boardDetail?.columns[0]?.id ?? 0,
        categoryId: data.categoryId,
      });
      setReportOpen(false);
      loadBoardDetail(selectedBoardId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "แจ้งปัญหาไม่สำเร็จ");
    }
  };

  return (
    <RequireAuth>
      <DashboardLayout>
        {boards.length === 0 ? (
          <Box sx={{ py: 4, textAlign: "center" }}>
            <Typography variant="h6" gutterBottom>
              ยังไม่มีบอร์ด
            </Typography>
          </Box>
        ) : (
          <Box sx={{ py: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Typography variant="h6" fontWeight={700}>
                {boardDetail?.name ?? "บอร์ด"}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                {canReport && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setReportOpen(true)}>
                    แจ้งปัญหา
                  </Button>
                )}
                <Tabs value={view} onChange={(_, v) => setView(v)} sx={{ minHeight: 36 }}>
                  <Tab icon={<ViewKanbanIcon />} label="บอร์ด" value="board" sx={{ minHeight: 36, textTransform: "none" }} />
                  <Tab icon={<TableChartIcon />} label="ตาราง" value="table" sx={{ minHeight: 36, textTransform: "none" }} />
                </Tabs>
              </Box>
            </Box>

            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
              </Box>
            ) : boardDetail ? (
              view === "board" ? (
                <KanbanView board={boardDetail} canManage={canManage} onRefresh={() => loadBoardDetail(boardDetail.id)} />
              ) : (
                <TableView board={boardDetail} canManage={canManage} onRefresh={() => loadBoardDetail(boardDetail.id)} />
              )
            ) : null}

            <ReportIssueDialog
              open={reportOpen}
              onClose={() => setReportOpen(false)}
              onSubmit={handleReportIssue}
            />
          </Box>
        )}
      </DashboardLayout>
    </RequireAuth>
  );
}
