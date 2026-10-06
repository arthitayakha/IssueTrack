"use client";

import { useState, useEffect, useCallback } from "react";
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
import { useTranslations } from "next-intl";
import { usePermissions } from "@/lib/permissions";
import { useAuthStore } from "@/lib/auth-store";
import { apiFetch } from "@/lib/api";
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

function SortableCard({
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
      }}
    >
      <Typography variant="subtitle2" fontWeight={600} noWrap>
        {issue.title}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap>
        #{issue.id}
      </Typography>
      {canManage && (
        <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
          <IconButton size="small" onClick={() => onEdit(issue)}>
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => onViewActivity(issue)}>
            <HistoryIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => onDelete(issue)} color="error">
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
    </Paper>
  );
}

function Column({
  column,
  issues,
  canManage,
  onAddIssue,
  onEditIssue,
  onDeleteIssue,
  onViewActivity,
}: {
  column: BoardColumn;
  issues: BoardIssue[];
  canManage: boolean;
  onAddIssue: (columnId: number) => void;
  onEditIssue: (issue: BoardIssue) => void;
  onDeleteIssue: (issue: BoardIssue) => void;
  onViewActivity: (issue: BoardIssue) => void;
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
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {column.customName ?? column.status}
        </Typography>
        <Chip label={issues.length} size="small" />
      </Box>
      <SortableContext items={issues.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <Box sx={{ flexGrow: 1, overflowY: "auto", minHeight: 100 }}>
          {issues.map((issue) => (
            <SortableCard
              key={issue.id}
              issue={issue}
              canManage={canManage}
              onEdit={onEditIssue}
              onDelete={onDeleteIssue}
              onViewActivity={onViewActivity}
            />
          ))}
        </Box>
      </SortableContext>
      {canManage && (
        <Button
          size="small"
          startIcon={<AddIcon />}
          onClick={() => onAddIssue(column.id)}
          sx={{ mt: 1 }}
        >
          เพิ่มการ์ด
        </Button>
      )}
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

function AddColumnDialog({
  boardId,
  open,
  onClose,
  onSave,
}: {
  boardId: number;
  open: boolean;
  onClose: () => void;
  onSave: (status: string, customName?: string) => void;
}) {
  const [status, setStatus] = useState("");
  const [customName, setCustomName] = useState("");
  const [statuses, setStatuses] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    apiFetch<{ id: number; name: string }[]>("/issue-statuses", {})
      .then(setStatuses)
      .catch(() => setStatuses([]));
  }, [open]);

  const handleSave = () => {
    if (!status) return;
    onSave(status, customName.trim() || undefined);
    setStatus("");
    setCustomName("");
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>เพิ่มคอลัมน์</DialogTitle>
      <DialogContent>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>สถานะ</InputLabel>
          <Select
            value={status}
            label="สถานะ"
            onChange={(e) => setStatus(e.target.value as string)}
          >
            {statuses.map((s) => (
              <MenuItem key={s.id} value={s.name}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          fullWidth
          label="ชื่อแสดง (ไม่บังคับ)"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="ค่าเริ่มต้น = ชื่อสถานะ"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ยกเลิก</Button>
        <Button onClick={handleSave} variant="contained" disabled={!status}>
          เพิ่ม
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function BoardView({
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
        await createIssue(board.id, { ...data, title: data.title, description: data.description, columnId: editIssue.columnId ?? data.columnId });
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
              <Column
                key={column.id}
                column={column}
                issues={board.issues.filter((i) => i.columnId === column.id)}
                canManage={canManage}
                onAddIssue={(colId) => setAddIssueColumnId(colId)}
                onEditIssue={(issue) => setEditIssue(issue)}
                onDeleteIssue={(issue) => setIssueToDelete(issue)}
                onViewActivity={(issue) => setActivityIssue(issue)}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeIssue ? (
              <Paper elevation={3} sx={{ p: 1.5, width: 260 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  {activeIssue.title}
                </Typography>
              </Paper>
            ) : null}
          </DragOverlay>
        </DndContext>
        {canManage && (
          <Box>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setAddColumnOpen(true)}
              sx={{ minWidth: 200 }}
            >
              เพิ่มคอลัมน์
            </Button>
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
      <AddColumnDialog
        boardId={board.id}
        open={addColumnOpen}
        onClose={() => setAddColumnOpen(false)}
        onSave={handleAddColumn}
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
      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        <Box sx={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f5f5f5" }}>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>หัวข้อ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>สถานะ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>ความสำคัญ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>ผู้รับผิดชอบ</th>
                <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>สร้างเมื่อ</th>
                {canManage && (
                  <th style={{ padding: "12px", textAlign: "left", fontWeight: 600 }}>จัดการ</th>
                )}
              </tr>
            </thead>
            <tbody>
              {board.issues.map((issue) => (
                <tr key={issue.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "12px" }}>{issue.title}</td>
                  <td style={{ padding: "12px" }}>{getColumnName(issue.columnId)}</td>
                  <td style={{ padding: "12px" }}>—</td>
                  <td style={{ padding: "12px" }}>—</td>
                  <td style={{ padding: "12px" }}>
                    {new Date(issue.createdAt).toLocaleString("th-TH")}
                  </td>
                  {canManage && (
                    <td style={{ padding: "12px" }}>
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
  const { can } = usePermissions();
  const [view, setView] = useState<"board" | "table">("board");
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [boardDetail, setBoardDetail] = useState<BoardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardDesc, setNewBoardDesc] = useState("");

  const canManage = can("board.column.create");

  const loadBoards = useCallback(async () => {
    try {
      const data = await fetchBoards();
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

  const handleCreateBoard = async () => {
    if (!newBoardName.trim()) return;
    try {
      await createBoard(newBoardName.trim(), newBoardDesc.trim() || undefined);
      setCreateOpen(false);
      setNewBoardName("");
      setNewBoardDesc("");
      loadBoards();
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างบอร์ดไม่สำเร็จ");
    }
  };

  if (boards.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: "center" }}>
        <Typography variant="h6" gutterBottom>
          ยังไม่มีบอร์ด
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          สร้างบอร์ดแรก
        </Button>
        <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>สร้างบอร์ดใหม่</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="ชื่อบอร์ด"
              fullWidth
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
            />
            <TextField
              margin="dense"
              label="คำอธิบาย"
              fullWidth
              multiline
              rows={2}
              value={newBoardDesc}
              onChange={(e) => setNewBoardDesc(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)}>ยกเลิก</Button>
            <Button onClick={handleCreateBoard} variant="contained" disabled={!newBoardName.trim()}>
              สร้าง
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  return (
    <Box sx={{ py: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <Select
              value={selectedBoardId ?? ""}
              onChange={(e) => setSelectedBoardId(Number(e.target.value))}
            >
              {boards.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {canManage && (
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              สร้างบอร์ด
            </Button>
          )}
        </Box>
        <Tabs value={view} onChange={(_, v) => setView(v)}>
          <Tab icon={<ViewKanbanIcon />} label="บอร์ด" value="board" />
          <Tab icon={<TableChartIcon />} label="ตาราง" value="table" />
        </Tabs>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : boardDetail ? (
        view === "board" ? (
          <BoardView board={boardDetail} canManage={canManage} onRefresh={() => loadBoardDetail(boardDetail.id)} />
        ) : (
          <TableView board={boardDetail} canManage={canManage} onRefresh={() => loadBoardDetail(boardDetail.id)} />
        )
      ) : null}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>สร้างบอร์ดใหม่</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="ชื่อบอร์ด"
            fullWidth
            value={newBoardName}
            onChange={(e) => setNewBoardName(e.target.value)}
          />
          <TextField
            margin="dense"
            label="คำอธิบาย"
            fullWidth
            multiline
            rows={2}
            value={newBoardDesc}
            onChange={(e) => setNewBoardDesc(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>ยกเลิก</Button>
          <Button onClick={handleCreateBoard} variant="contained" disabled={!newBoardName.trim()}>
            สร้าง
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
