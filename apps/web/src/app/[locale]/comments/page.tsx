"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  TextField,
  Button,
  MenuItem,
  CircularProgress,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from "@mui/material";
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon } from "@mui/icons-material";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DataTable, { DataTableHead, DataTableBody, DataTableRow, DataTableCell } from "@/components/data-table";
import RequirePermission from "@/components/require-permission";
import { usePermissions } from "@/lib/permissions";
import { useNotification } from "@/components/notification";
import { useAuthStore } from "@/lib/auth-store";
import { fetchIssues, type BoardIssue } from "@/lib/board-api";
import { Pagination } from "@/components/pagination";
import {
  fetchComments,
  createComment,
  updateComment,
  deleteComment,
  type Comment,
} from "@/lib/comments-api";

export default function CommentsPage() {
  const t = useTranslations("Comments");
  const { can } = usePermissions();
  const { notify } = useNotification();
  const currentUser = useAuthStore((s) => s.user);

  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<number | "">("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [formContent, setFormContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageComments = comments.slice((page - 1) * 10, page * 10);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetchIssues()
      .then((data) => {
        setIssues(data.data);
        if (data.data.length > 0) {
          setSelectedIssueId(data.data[0].id);
        }
      })
      .catch(() => {
        notify(t("loadError"), "error");
      });
  }, [notify, t]);

  const loadComments = useCallback(() => {
    if (!selectedIssueId) {
      setComments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchComments(selectedIssueId as number, 1, 100)
      .then((res) => {
        setComments(res.data);
        setTotalPages(res.totalPages);
      })
      .catch(() => {
        notify(t("loadError"), "error");
      })
      .finally(() => setLoading(false));
  }, [selectedIssueId, notify, t]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  function openAdd() {
    setEditingComment(null);
    setFormContent("");
    setDialogOpen(true);
  }

  function openEdit(comment: Comment) {
    setEditingComment(comment);
    setFormContent(comment.content);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      if (editingComment) {
        await updateComment(editingComment.id, formContent.trim());
        notify(t("commentUpdated"));
      } else if (selectedIssueId) {
        await createComment(selectedIssueId as number, formContent.trim());
        notify(t("commentCreated"));
      }
      setDialogOpen(false);
      loadComments();
    } catch {
      notify(t("genericError"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    deleteComment(deleteTarget.id)
      .then(() => {
        setComments((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        setDeleteTarget(null);
        notify(t("commentDeleted"));
      })
      .catch(() => {
        notify(t("genericError"), "error");
      })
      .finally(() => setDeleteLoading(false));
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

  return (
    <RequirePermission permission="comment.view">
      <DashboardLayout>
        <Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 3 }}>
            {can("comment.create") && selectedIssueId && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
                {t("addComment")}
              </Button>
            )}
          </Box>

          <Box sx={{ display: "flex", gap: 2, mb: 3, alignItems: "center" }}>
            <TextField
              select
              label={t("selectIssue")}
              value={selectedIssueId}
              onChange={(e) =>
                setSelectedIssueId(e.target.value ? Number(e.target.value) : "")
              }
              sx={{ minWidth: 240 }}
            >
              {issues.map((issue) => (
                <MenuItem key={issue.id} value={issue.id}>
                  {issue.title}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <DataTable>
            <DataTableHead>
              <DataTableRow>
                <DataTableCell align="center" sx={{ width: 50 }}>
                  #
                </DataTableCell>
                <DataTableCell>{t("columnContent")}</DataTableCell>
                <DataTableCell>{t("columnAuthor")}</DataTableCell>
                <DataTableCell>{t("columnCreatedAt")}</DataTableCell>
                <DataTableCell align="right">{t("columnActions")}</DataTableCell>
              </DataTableRow>
            </DataTableHead>
            <DataTableBody>
              {comments.length === 0 ? (
                <DataTableRow>
                  <DataTableCell colSpan={5} align="center">
                    <Typography color="text.secondary" sx={{ py: 3 }}>
                      {t("noComments")}
                    </Typography>
                  </DataTableCell>
                </DataTableRow>
              ) : (
                pageComments.map((comment, index) => {
                  const isOwner = currentUser && comment.authorId === Number(currentUser.id);
                  const canEdit = isOwner;
                  const canDelete = isOwner || can("comment.all.delete");
                  return (
                    <DataTableRow key={comment.id}>
                      <DataTableCell align="center">{index + 1}</DataTableCell>
                      <DataTableCell>
                        <Typography sx={{ whiteSpace: "pre-wrap" }}>
                          {comment.content}
                        </Typography>
                      </DataTableCell>
                      <DataTableCell>{comment.authorName ?? "—"}</DataTableCell>
                      <DataTableCell>
                        {new Date(comment.createdAt).toLocaleString()}
                      </DataTableCell>
                      <DataTableCell align="right">
                        {canEdit && (
                          <IconButton size="small" onClick={() => openEdit(comment)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                        {canDelete && (
                          <IconButton size="small" color="error" onClick={() => setDeleteTarget(comment)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  );
                })
              )}
            </DataTableBody>
          </DataTable>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={comments.length}
            limit={10}
            onPageChange={setPage}
          />

          <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>
              {editingComment ? t("editComment") : t("addComment")}
            </DialogTitle>
            <DialogContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                <TextField
                  label={t("commentContent")}
                  fullWidth
                  multiline
                  minRows={3}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
                {t("cancel")}
              </Button>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={submitting || !formContent.trim()}
              >
                {t("save")}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog
            open={!!deleteTarget}
            onClose={() => !deleteLoading && setDeleteTarget(null)}
            maxWidth="xs"
          >
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogContent>
              {deleteLoading ? (
                <CircularProgress size={24} />
              ) : (
                <Typography variant="body2">
                  {t("deleteCommentConfirmMessage")}
                </Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
                {t("cancel")}
              </Button>
              <Button variant="contained" color="error" onClick={confirmDelete} disabled={deleteLoading}>
                {t("delete")}
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      </DashboardLayout>
    </RequirePermission>
  );
}
