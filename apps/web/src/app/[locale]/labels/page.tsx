"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Switch,
  TextField,
  Typography,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import type { Theme } from "@mui/material/styles";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DataTable, {
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/data-table";
import RequirePermission from "@/components/require-permission";
import { Pagination } from "@/components/pagination";
import { useNotification } from "@/components/notification";
import { usePermissions } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import {
  checkLabel,
  createLabel,
  deleteLabel,
  fetchLabels,
  toggleLabelActive,
  updateLabel,
  type Label,
} from "@/lib/labels-api";

const PAGE_SIZE = 10;

/** Resolves a stored colour name (e.g. "pink") to a theme colour — no hex here. */
function labelColorValue(color: string | null | undefined, theme: Theme): string {
  const map = theme.custom.labelColors as Record<string, string>;
  return map[color ?? "default"] ?? color ?? theme.palette.grey[400];
}

/** Swatch keys offered in the colour picker ("default" is the fallback only). */
function labelColorKeys(theme: Theme): string[] {
  const map = theme.custom.labelColors as Record<string, string>;
  return Object.keys(map).filter((key) => key !== "default");
}

export default function LabelsPage() {
  const t = useTranslations("Labels");
  const theme = useTheme();
  const { can } = usePermissions();
  const { notify } = useNotification();

  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Label | null>(null);
  const [form, setForm] = useState({ name: "", color: "default" });
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Label | null>(null);
  /** Set instead of `pendingDelete` when cards still use the label. */
  const [inUse, setInUse] = useState<{ label: Label; issueCount: number } | null>(null);
  const [checking, setChecking] = useState(false);

  async function load() {
    try {
      const result = await fetchLabels(1, 100);
      setLabels(result.data);
    } catch {
      notify(t("loadError"), "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return labels;
    return labels.filter((label) => label.name.toLowerCase().includes(query));
  }, [labels, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageLabels = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function openAdd() {
    setEditing(null);
    setForm({ name: "", color: "default" });
    setDialogOpen(true);
  }

  function openEdit(label: Label) {
    setEditing(label);
    setForm({ name: label.name, color: label.color });
    setDialogOpen(true);
  }

  async function handleSave() {
    const name = form.name.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      if (editing) {
        await updateLabel(editing.id, { name, color: form.color });
        notify(t("labelUpdated"));
      } else {
        await createLabel({ name, color: form.color });
        notify(t("labelCreated"));
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(label: Label) {
    try {
      const updated = await toggleLabelActive(label.id, !label.isActive);
      setLabels((prev) =>
        prev.map((item) => (item.id === label.id ? { ...item, isActive: updated.isActive } : item)),
      );
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    }
  }

  /** Ask the API first: a label still used by cards cannot be deleted. */
  async function requestDelete(label: Label) {
    if (checking) return;
    setChecking(true);
    try {
      const result = await checkLabel(label.id);
      if (result.canDelete) {
        setPendingDelete(label);
      } else {
        setInUse({ label, issueCount: result.issueCount });
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    } finally {
      setChecking(false);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteLabel(pendingDelete.id);
      notify(t("labelDeleted"));
      setPendingDelete(null);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    }
  }

  // render nothing on the server: DashboardLayout reads the auth store, which
  // only the client can fill — matching it later would break hydration
  // (the pattern used by the roles / users / settings pages).
  if (!mounted) return null;

  if (loading) {
    return (
      <RequirePermission permission="label.view">
        <DashboardLayout>
          <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
            <CircularProgress />
          </Box>
        </DashboardLayout>
      </RequirePermission>
    );
  }

  return (
    <RequirePermission permission="label.view">
      <DashboardLayout>
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
            <Typography variant="h5" fontWeight={700}>
              {t("title")}
            </Typography>
            {can("label.create") && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
                {t("addLabel")}
              </Button>
            )}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {t("subtitle")}
          </Typography>

          <TextField
            size="small"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            sx={{ mb: 2, maxWidth: 360 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
          />

          <DataTable>
            <DataTableHead>
              <DataTableRow>
                <DataTableCell>{t("columnName")}</DataTableCell>
                <DataTableCell>{t("columnIssues")}</DataTableCell>
                <DataTableCell>{t("columnStatus")}</DataTableCell>
                <DataTableCell align="right">{t("columnActions")}</DataTableCell>
              </DataTableRow>
            </DataTableHead>
            <DataTableBody>
              {pageLabels.map((label) => (
                <DataTableRow key={label.id}>
                  <DataTableCell>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box
                        aria-hidden
                        sx={{
                          width: 16,
                          height: 16,
                          borderRadius: "50%",
                          bgcolor: labelColorValue(label.color, theme),
                          border: "1px solid",
                          borderColor: "divider",
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body2" fontWeight={500}>
                        {label.name}
                      </Typography>
                    </Box>
                  </DataTableCell>
                  <DataTableCell>
                    <Typography variant="body2" color="text.secondary">
                      {label.issueCount}
                    </Typography>
                  </DataTableCell>
                  <DataTableCell>
                    <Chip
                      label={label.isActive ? t("active") : t("inactive")}
                      color={label.isActive ? "success" : "default"}
                      size="small"
                      variant="outlined"
                    />
                  </DataTableCell>
                  <DataTableCell align="right">
                    {can("label.update") && (
                      <Switch
                        checked={label.isActive}
                        onChange={() => handleToggle(label)}
                        size="small"
                        sx={{ mr: 1, verticalAlign: "middle" }}
                      />
                    )}
                    {can("label.update") && (
                      <IconButton size="small" onClick={() => openEdit(label)} aria-label={t("edit")}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                    {can("label.delete") && (
                      <IconButton
                        size="small"
                        onClick={() => requestDelete(label)}
                        aria-label={t("delete")}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </DataTableCell>
                </DataTableRow>
              ))}
              {pageLabels.length === 0 && (
                <DataTableRow hover={false}>
                  <DataTableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                      {search.trim() ? t("noResults") : t("empty")}
                    </Typography>
                  </DataTableCell>
                </DataTableRow>
              )}
            </DataTableBody>
          </DataTable>

          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />

          {/* add / edit */}
          <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>{editing ? t("editLabel") : t("addLabel")}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                <TextField
                  label={t("nameLabel")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  fullWidth
                  required
                  autoFocus
                />
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {t("colorLabel")}
                  </Typography>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <LabelSwatches
                      value={form.color}
                      onChange={(color) => setForm({ ...form, color })}
                    />
                  </Box>
                </Box>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
              <Button variant="contained" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {t("save")}
              </Button>
            </DialogActions>
          </Dialog>

          {/* delete confirmation */}
          <Dialog open={!!pendingDelete} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogContent>
              <Typography variant="body2">
                {t("deleteConfirmMessage", { name: pendingDelete?.name ?? "" })}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPendingDelete(null)}>{t("cancel")}</Button>
              <Button variant="contained" color="error" onClick={handleDelete}>
                {t("delete")}
              </Button>
            </DialogActions>
          </Dialog>

          {/* still used by cards */}
          <Dialog open={!!inUse} onClose={() => setInUse(null)} maxWidth="xs" fullWidth>
            <DialogTitle>{t("inUseTitle")}</DialogTitle>
            <DialogContent>
              <Typography variant="body2">
                {t("inUseMessage", {
                  name: inUse?.label.name ?? "",
                  count: inUse?.issueCount ?? 0,
                })}
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setInUse(null)}>{t("ok")}</Button>
            </DialogActions>
          </Dialog>
        </Box>
      </DashboardLayout>
    </RequirePermission>
  );
}

/** Colour swatches for the add/edit dialog, reading the theme palette. */
function LabelSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const theme = useTheme();
  return (
    <>
      {labelColorKeys(theme).map((key) => (
        <Box
          key={key}
          component="button"
          type="button"
          aria-label={key}
          onClick={() => onChange(key)}
          sx={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            p: 0,
            border: "2px solid",
            borderColor: value === key ? "primary.main" : "divider",
            bgcolor: labelColorValue(key, theme),
            cursor: "pointer",
          }}
        />
      ))}
    </>
  );
}
