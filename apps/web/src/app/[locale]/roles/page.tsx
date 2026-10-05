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
  CircularProgress,
  Switch,
  FormControlLabel,
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

interface Role {
  id: number;
  name: string;
  isActive: boolean;
}

interface RoleUser {
  id: string;
  name: string;
  email: string;
}

export default function RolesPage() {
  const t = useTranslations("Roles");
  const { can } = usePermissions();
  const token = useAuthStore((s) => s.token);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [form, setForm] = useState({ name: "" });
  const [mounted, setMounted] = useState(false);
  const [warningRole, setWarningRole] = useState<Role | null>(null);
  const [warningUsers, setWarningUsers] = useState<RoleUser[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!can("role.view")) return;
    apiFetch<Role[]>("/roles", {}, token)
      .then(setRoles)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [can, token]);

  if (!can("role.view")) {
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

  function openAdd() {
    setEditingRole(null);
    setForm({ name: "" });
    setDialogOpen(true);
  }

  function openEdit(role: Role) {
    setEditingRole(role);
    setForm({ name: role.name });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      if (editingRole) {
        await apiFetch(`/roles/${editingRole.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: form.name }),
        }, token);
      } else {
        await apiFetch("/roles", {
          method: "POST",
          body: JSON.stringify({ name: form.name }),
        }, token);
      }
      const updated = await apiFetch<Role[]>("/roles", {}, token);
      setRoles(updated);
      setDialogOpen(false);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/roles/${id}`, { method: "DELETE" }, token);
      setRoles((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleToggleActive(role: Role) {
    if (!role.isActive) {
      try {
        const users = await apiFetch<RoleUser[]>(`/roles/${role.id}/users`, {}, token);
        if (users.length > 0) {
          setWarningRole(role);
          setWarningUsers(users);
          return;
        }
      } catch (err) {
        console.error(err);
      }
    }
    try {
      await apiFetch(`/roles/${role.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !role.isActive }),
      }, token);
      setRoles((prev) =>
        prev.map((r) => (r.id === role.id ? { ...r, isActive: !r.isActive } : r)),
      );
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      } else {
        console.error(err);
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

  return (
    <RequireAuth>
      <DashboardLayout>
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
            <Typography variant="h5" fontWeight={700}>
              {t("title")}
            </Typography>
            {can("role.create") && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
                {t("addRole")}
              </Button>
            )}
          </Box>

          <DataTable>
            <DataTableHead>
              <DataTableRow>
                <DataTableCell>{t("columnName")}</DataTableCell>
                <DataTableCell>{t("columnStatus")}</DataTableCell>
                <DataTableCell align="right">{t("columnActions")}</DataTableCell>
              </DataTableRow>
            </DataTableHead>
            <DataTableBody>
              {roles.map((role) => (
                <DataTableRow key={role.id}>
                  <DataTableCell>
                    <Typography sx={{ textTransform: "capitalize", fontWeight: 500 }}>
                      {role.name}
                    </Typography>
                  </DataTableCell>
                  <DataTableCell>
                    <Chip
                      label={role.isActive ? t("active") : t("inactive")}
                      color={role.isActive ? "success" : "error"}
                      size="small"
                      variant="outlined"
                    />
                  </DataTableCell>
                  <DataTableCell align="right">
                    {can("role.update") && (
                      <FormControlLabel
                        control={
                          <Switch
                            checked={role.isActive}
                            onChange={() => handleToggleActive(role)}
                            disabled={role.name === "admin"}
                            size="small"
                          />
                        }
                        label=""
                        sx={{ mr: 1 }}
                      />
                    )}
                    {can("role.update") && (
                      <IconButton size="small" onClick={() => openEdit(role)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                    {can("role.delete") && (
                      <IconButton size="small" onClick={() => handleDelete(role.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>

          <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>{editingRole ? t("editRole") : t("addRole")}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                <TextField
                  label={t("columnName")}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  fullWidth
                />

              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
              <Button variant="contained" onClick={handleSave}>
                {t("save")}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={!!warningRole} onClose={() => setWarningRole(null)} maxWidth="xs">
            <DialogTitle>{t("cannotDeactivateTitle")}</DialogTitle>
            <DialogContent>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {t("cannotDeactivateMessage", { role: warningRole?.name ?? "", count: warningUsers.length })}
              </Typography>
              <Box component="ul" sx={{ pl: 2, m: 0 }}>
                {warningUsers.map((u) => (
                  <li key={u.id}>
                    <Typography variant="body2">
                      {u.name} ({u.email})
                    </Typography>
                  </li>
                ))}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setWarningRole(null)}>{t("ok")}</Button>
            </DialogActions>
          </Dialog>
        </Box>
      </DashboardLayout>
    </RequireAuth>
  );
}
