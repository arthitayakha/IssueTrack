"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DataTable, { DataTableHead, DataTableBody, DataTableRow, DataTableCell } from "@/components/data-table";
import RequireAuth from "@/components/require-auth";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions } from "@/lib/permissions";
import { apiFetch, ApiError } from "@/lib/api";
import { useNotification } from "@/components/notification";

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
  issueCount: number;
}

interface IssuePriority {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  issueCount: number;
}

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const { can } = usePermissions();
  const token = useAuthStore((s) => s.token);
  const { notify } = useNotification();
  const [tab, setTab] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [priorities, setPriorities] = useState<IssuePriority[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", position: "" });

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editingStatus, setEditingStatus] = useState<IssueStatus | null>(null);
  const [statusForm, setStatusForm] = useState({
    name: "",
    description: "",
  });

  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [editingPriority, setEditingPriority] = useState<IssuePriority | null>(null);
  const [priorityForm, setPriorityForm] = useState({
    name: "",
    description: "",
  });

  const [deleteTarget, setDeleteTarget] = useState<{ type: "category" | "status" | "priority"; id: number; name: string } | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<{ canDelete: boolean; issueCount: number } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canViewCategories = can("category.view");
  const canViewStatuses = can("status.view");
  const canViewPriorities = can("priority.view");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!canViewCategories && !canViewStatuses && !canViewPriorities) return;
    const requests: Promise<any>[] = [];
    if (canViewCategories) {
      requests.push(apiFetch<Category[]>("/categories", {}, token));
      requests.push(apiFetch<Position[]>("/positions", {}, token));
    }
    if (canViewStatuses) requests.push(apiFetch<IssueStatus[]>("/issue-statuses", {}, token));
    if (canViewPriorities) requests.push(apiFetch<IssuePriority[]>("/issue-priorities", {}, token));

    Promise.all(requests)
      .then((results) => {
        let idx = 0;
        if (canViewCategories) {
          setCategories(results[idx++]);
          setPositions(results[idx++]);
        }
        if (canViewStatuses) setStatuses(results[idx++]);
        if (canViewPriorities) setPriorities(results[idx++]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canViewCategories, canViewStatuses, canViewPriorities, token]);

  if (!canViewCategories && !canViewStatuses && !canViewPriorities) {
    return (
      <DashboardLayout>
        <Box sx={{ py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            {t("noPermission")}
          </Typography>
        </Box>
      </DashboardLayout>
    );
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
      const updated = await apiFetch<Category[]>("/categories", {}, token);
      setCategories(updated);
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
      setDeleteCheck(result);
    } catch (err) {
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  function openAddStatus() {
    setEditingStatus(null);
    setStatusForm({ name: "", description: "" });
    setStatusDialogOpen(true);
  }

  function openEditStatus(status: IssueStatus) {
    setEditingStatus(status);
    setStatusForm({
      name: status.name,
      description: status.description ?? "",
    });
    setStatusDialogOpen(true);
  }

  async function handleSaveStatus() {
    try {
      const payload = {
        name: statusForm.name,
        description: statusForm.description || undefined,
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
      const updated = await apiFetch<IssueStatus[]>("/issue-statuses", {}, token);
      setStatuses(updated);
      setStatusDialogOpen(false);
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
      const result = await apiFetch<{ canDelete: boolean; issueCount: number }>(
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
      const updated = await apiFetch<IssuePriority[]>("/issue-priorities", {}, token);
      setPriorities(updated);
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
      setDeleteCheck(result);
    } catch (err) {
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "category") {
        await apiFetch(`/categories/${deleteTarget.id}`, { method: "DELETE" }, token);
        setCategories((prev) => prev.filter((c) => c.id !== deleteTarget.id));
        notify(t("categoryDeleted"));
      } else if (deleteTarget.type === "status") {
        await apiFetch(`/issue-statuses/${deleteTarget.id}`, { method: "DELETE" }, token);
        setStatuses((prev) => prev.filter((s) => s.id !== deleteTarget.id));
        notify(t("statusDeleted"));
      } else {
        await apiFetch(`/issue-priorities/${deleteTarget.id}`, { method: "DELETE" }, token);
        setPriorities((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        notify(t("priorityDeleted"));
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
    ...(canViewCategories ? [{ label: t("tabCategories"), content: "categories" }] : []),
    ...(canViewStatuses ? [{ label: t("tabStatuses"), content: "statuses" }] : []),
    ...(canViewPriorities ? [{ label: t("tabPriorities"), content: "priorities" }] : []),
  ];

  return (
    <RequireAuth>
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
                    <DataTableCell align="center">{t("columnIssueCount")}</DataTableCell>
                    <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                    <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {categories.map((category) => (
                    <DataTableRow key={category.id}>
                      <DataTableCell>{category.name}</DataTableCell>
                      <DataTableCell>{category.position ?? "—"}</DataTableCell>
                      <DataTableCell align="center">{category.issueCount}</DataTableCell>
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
            </Box>
          )}

          {tabs[tab]?.content === "statuses" && (
            <Box>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                {can("status.create") && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openAddStatus}>
                    {t("addStatus")}
                  </Button>
                )}
              </Box>
              <DataTable>
                <DataTableHead>
                  <DataTableRow>
                    <DataTableCell>{t("columnName")}</DataTableCell>
                    <DataTableCell>{t("columnDescription")}</DataTableCell>
                    <DataTableCell align="center">{t("columnIssueCount")}</DataTableCell>
                    <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                    <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {statuses.map((status) => (
                    <DataTableRow key={status.id}>
                      <DataTableCell>{status.name}</DataTableCell>
                      <DataTableCell>{status.description ?? "—"}</DataTableCell>
                      <DataTableCell align="center">{status.issueCount}</DataTableCell>
                      <DataTableCell align="center">
                        <Chip
                          label={status.isActive ? t("active") : t("inactive")}
                          color={status.isActive ? "success" : "error"}
                          size="small"
                          variant="outlined"
                        />
                      </DataTableCell>
                      <DataTableCell align="right">
                        {can("status.update") && (
                          <FormControlLabel
                            control={
                              <Switch
                                checked={status.isActive}
                                onChange={() => handleToggleStatusActive(status)}
                                size="small"
                              />
                            }
                            label=""
                            sx={{ mr: 1 }}
                          />
                        )}
                        {can("status.update") && (
                          <IconButton size="small" onClick={() => openEditStatus(status)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                        {can("status.delete") && (
                          <IconButton size="small" onClick={() => handleDeleteStatus(status.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
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
                    <DataTableCell align="center">{t("columnIssueCount")}</DataTableCell>
                    <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                    <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                  </DataTableRow>
                </DataTableHead>
                <DataTableBody>
                  {priorities.map((priority) => (
                    <DataTableRow key={priority.id}>
                      <DataTableCell>{priority.name}</DataTableCell>
                      <DataTableCell>{priority.description ?? "—"}</DataTableCell>
                      <DataTableCell align="center">{priority.issueCount}</DataTableCell>
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
            </Box>
          )}

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

          <Dialog open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteCheck(null); }} maxWidth="xs">
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogContent>
              {deleteLoading ? (
                <CircularProgress size={24} />
              ) : deleteCheck && !deleteCheck.canDelete && deleteTarget ? (
                <Typography variant="body2">
                  {t("deleteInUse", { name: deleteTarget.name, count: deleteCheck.issueCount })}
                </Typography>
              ) : deleteTarget ? (
                <Typography variant="body2">
                  {t("deleteConfirmMessage", {
                    type: deleteTarget.type === "category" ? t("category") : deleteTarget.type === "status" ? t("status") : t("priority"),
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
    </RequireAuth>
  );
}
