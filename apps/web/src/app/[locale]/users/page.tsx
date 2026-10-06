"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Checkbox,
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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  CircularProgress,
  Switch,
  FormControlLabel,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import PersonIcon from "@mui/icons-material/Person";
import WorkIcon from "@mui/icons-material/Work";
import GroupIcon from "@mui/icons-material/Group";
import SecurityIcon from "@mui/icons-material/Security";
import CategoryIcon from "@mui/icons-material/Category";
import FlagIcon from "@mui/icons-material/Flag";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import ChatIcon from "@mui/icons-material/Chat";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AssessmentIcon from "@mui/icons-material/Assessment";
import LockIcon from "@mui/icons-material/Lock";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DataTable, { DataTableHead, DataTableBody, DataTableRow, DataTableCell } from "@/components/data-table";
import RequireAuth from "@/components/require-auth";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions, roleLabel } from "@/lib/permissions";
import { apiFetch, ApiError } from "@/lib/api";
import { PERMISSION_LABELS, ALL_PERMISSIONS, permissionsForRole } from "@kanban/shared";
import { useNotification } from "@/components/notification";

const CATEGORY_GROUPS = [
  { key: "board", icon: ViewColumnIcon, dbCategories: ["board", "issue", "time"] },
  { key: "user", icon: PersonIcon, dbCategories: ["user", "ผู้ใช้งาน"] },
  { key: "position", icon: WorkIcon, dbCategories: ["position"] },
  { key: "role", icon: GroupIcon, dbCategories: ["role"] },
  { key: "permission", icon: SecurityIcon, dbCategories: ["permission"] },
  { key: "category", icon: CategoryIcon, dbCategories: ["category"] },
  { key: "status", icon: FlagIcon, dbCategories: ["status"] },
  { key: "priority", icon: PriorityHighIcon, dbCategories: ["priority"] },
  { key: "comment", icon: ChatIcon, dbCategories: ["comment"] },
  { key: "dashboard", icon: DashboardIcon, dbCategories: ["dashboard"] },
  { key: "report", icon: AssessmentIcon, dbCategories: ["report"] },
  { key: "auth", icon: LockIcon, dbCategories: ["auth"] },
] as const;

function permissionBelongsToGroup(
  permission: string,
  group: (typeof CATEGORY_GROUPS)[number],
): boolean {
  return group.dbCategories.some((cat) =>
    cat === "ผู้ใช้งาน" ? permission === "user.status.update" : permission.startsWith(cat + "."),
  );
}

type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

interface User {
  id: string;
  email: string;
  name: string;
  roleId: number | null;
  roleName: string | null;
  positionId: number | null;
  positionName: string | null;
  isActive: boolean;
}

interface Role {
  id: number;
  name: string;
  isActive: boolean;
}

interface Position {
  id: number;
  name: string;
  roleId: number | null;
  roleName: string | null;
  isActive: boolean;
  userCount: number;
}

interface PositionUser {
  id: string;
  name: string;
  email: string;
}

export default function UsersPage() {
  const t = useTranslations("Users");
  const { can } = usePermissions();
  const token = useAuthStore((s) => s.token);
  const { notify } = useNotification();
  const [tab, setTab] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    email: "",
    name: "",
    roleId: null as number | null,
    positionId: null as number | null,
    password: "",
  });
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [positionForm, setPositionForm] = useState({ name: "", roleId: null as number | null, permissions: [] as string[] });
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({ name: "" });
  const [warningPosition, setWarningPosition] = useState<Position | null>(null);
  const [warningUsers, setWarningUsers] = useState<PositionUser[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "role" | "position"; id: number; name: string } | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<{ canDelete: boolean; userCount: number } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<User | null>(null);
  const [deleteUserLoading, setDeleteUserLoading] = useState(false);

  const canViewUsers = can("user.view");
  const canViewRoles = can("role.view");
  const canViewPositions = can("position.view");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!canViewUsers && !canViewPositions) return;
    const requests: Promise<any>[] = [];
    if (canViewUsers) {
      requests.push(apiFetch<User[]>("/users", {}, token));
      requests.push(apiFetch<Role[]>("/roles", {}, token));
    }
    if (canViewPositions) requests.push(apiFetch<Position[]>("/positions", {}, token));

    Promise.all(requests)
      .then((results) => {
        let idx = 0;
        if (canViewUsers) {
          setUsers(results[idx++]);
          setRoles(results[idx++]);
        }
        if (canViewPositions) setPositions(results[idx++]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canViewUsers, canViewPositions, token]);

  if (!canViewUsers && !canViewPositions) {
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
    setEditingUser(null);
    setForm({ email: "", name: "", roleId: null, positionId: null, password: "" });
    setDialogOpen(true);
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setForm({
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      positionId: user.positionId,
      password: "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    try {
      const payload = {
        ...form,
        positionId: form.roleId === 2 ? form.positionId : null,
      };
      if (editingUser) {
        await apiFetch(`/users/${editingUser.id}`, { method: "PATCH", body: JSON.stringify(payload) }, token);
        notify(t("userUpdated"));
      } else {
        await apiFetch("/users", { method: "POST", body: JSON.stringify(payload) }, token);
        notify(t("userCreated"));
      }
      const updated = await apiFetch<User[]>("/users", {}, token);
      setUsers(updated);
      setDialogOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  function confirmDeleteUser() {
    if (!deleteUserTarget) return;
    setDeleteUserLoading(true);
    apiFetch(`/users/${deleteUserTarget.id}`, { method: "DELETE" }, token)
      .then(() => {
        setUsers((prev) => prev.filter((u) => u.id !== deleteUserTarget.id));
        setDeleteUserTarget(null);
        notify(t("userDeleted"));
      })
      .catch((err) => {
        if (err instanceof ApiError) {
          notify(err.message, "error");
        } else {
          notify(t("genericError"), "error");
        }
      })
      .finally(() => setDeleteUserLoading(false));
  }

  function openAddPosition() {
    setEditingPosition(null);
    setPositionForm({ name: "", roleId: null, permissions: [...permissionsForRole("customer")] });
    setPositionDialogOpen(true);
  }

  async function openEditPosition(position: Position) {
    setEditingPosition(position);
    const isAdmin = position.roleName === "admin";
    setPositionForm({
      name: position.name,
      roleId: position.roleId,
      permissions: isAdmin ? [...permissionsForRole("admin")] : [...permissionsForRole("customer")],
    });
    setPositionDialogOpen(true);
    try {
      const data = await apiFetch<{ permissions: string[] }>(
        `/positions/${position.id}/permissions`,
        {},
        token,
      );
      setPositionForm((prev) => ({ ...prev, permissions: data.permissions }));
    } catch {
      // keep defaults if fetch fails
    }
  }

  async function handleSavePosition() {
    try {
      if (editingPosition) {
        await apiFetch(
          `/positions/${editingPosition.id}`,
          { method: "PATCH", body: JSON.stringify({ name: positionForm.name, roleId: positionForm.roleId }) },
          token,
        );
        await apiFetch(
          `/positions/${editingPosition.id}/permissions`,
          { method: "PUT", body: JSON.stringify({ permissions: positionForm.permissions }) },
          token,
        );
        notify(t("positionUpdated"));
      } else {
        const created = await apiFetch<{ id: number }>(
          "/positions",
          { method: "POST", body: JSON.stringify({ name: positionForm.name, roleId: positionForm.roleId }) },
          token,
        );
        await apiFetch(
          `/positions/${created.id}/permissions`,
          { method: "PUT", body: JSON.stringify({ permissions: positionForm.permissions }) },
          token,
        );
        notify(t("positionCreated"));
      }
      const updated = await apiFetch<Position[]>("/positions", {}, token);
      setPositions(updated);
      setPositionDialogOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleDeletePosition(id: number) {
    const position = positions.find((p) => p.id === id);
    if (!position) return;
    setDeleteTarget({ type: "position", id, name: position.name });
    setDeleteLoading(true);
    try {
      const result = await apiFetch<{ canDelete: boolean; userCount: number }>(
        `/positions/${id}/check`,
        {},
        token,
      );
      setDeleteCheck(result);
    } catch (err) {
      console.error(err);
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "position") {
        await apiFetch(`/positions/${deleteTarget.id}`, { method: "DELETE" }, token);
        setPositions((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        notify(t("positionDeleted"));
      } else {
        await handleDeleteRoleConfirm();
        return;
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

  async function handleToggleUserActive(user: User) {
    try {
      await apiFetch(`/users/${user.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !user.isActive }),
      }, token);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)),
      );
      notify(t("userToggled"));
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleTogglePositionActive(position: Position) {
    if (!position.isActive) {
      try {
        const users = await apiFetch<PositionUser[]>(`/positions/${position.id}/users`, {}, token);
        if (users.length > 0) {
          setWarningPosition(position);
          setWarningUsers(users);
          return;
        }
      } catch (err) {
        if (err instanceof ApiError) {
          notify(err.message, "error");
        } else {
          notify(t("genericError"), "error");
        }
        return;
      }
    }
    try {
      await apiFetch(`/positions/${position.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !position.isActive }),
      }, token);
      setPositions((prev) =>
        prev.map((p) => (p.id === position.id ? { ...p, isActive: !p.isActive } : p)),
      );
      notify(t("positionToggled"));
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  function openAddRole() {
    setEditingRole(null);
    setRoleForm({ name: "" });
    setRoleDialogOpen(true);
  }

  function openEditRole(role: Role) {
    setEditingRole(role);
    setRoleForm({ name: role.name });
    setRoleDialogOpen(true);
  }

  async function handleSaveRole() {
    try {
      if (editingRole) {
        await apiFetch(`/roles/${editingRole.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: roleForm.name }),
        }, token);
        notify(t("roleUpdated"));
      } else {
        await apiFetch("/roles", {
          method: "POST",
          body: JSON.stringify({ name: roleForm.name }),
        }, token);
        notify(t("roleCreated"));
      }
      const updated = await apiFetch<Role[]>("/roles", {}, token);
      setRoles(updated);
      setRoleDialogOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleDeleteRole(id: number) {
    const role = roles.find((r) => r.id === id);
    if (!role) return;
    setDeleteTarget({ type: "role", id, name: role.name });
    setDeleteLoading(true);
    try {
      const result = await apiFetch<{ canDelete: boolean; userCount: number }>(
        `/roles/${id}/check`,
        {},
        token,
      );
      setDeleteCheck(result);
    } catch (err) {
      console.error(err);
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleDeleteRoleConfirm() {
    if (!deleteTarget || deleteTarget.type !== "role") return;
    try {
      await apiFetch(`/roles/${deleteTarget.id}`, { method: "DELETE" }, token);
      const updated = await apiFetch<Role[]>("/roles", {}, token);
      setRoles(updated);
      setDeleteTarget(null);
      setDeleteCheck(null);
      notify(t("roleDeleted"));
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify(t("genericError"), "error");
      }
    }
  }

  async function handleToggleRoleActive(role: Role) {
    try {
      await apiFetch(`/roles/${role.id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !role.isActive }),
      }, token);
      const updated = await apiFetch<Role[]>("/roles", {}, token);
      setRoles(updated);
      notify(t("roleToggled"));
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
    ...(canViewUsers ? [{ label: t("tabUsers"), content: "users" }] : []),
    ...(canViewRoles ? [{ label: t("tabRoles"), content: "roles" }] : []),
    ...(canViewPositions ? [{ label: t("tabPositions"), content: "positions" }] : []),
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

        {tabs[tab]?.content === "users" && (
          <Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              {can("user.create") && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
                  {t("addUser")}
                </Button>
              )}
            </Box>
            <DataTable>
              <DataTableHead>
                <DataTableRow>
                  <DataTableCell>{t("columnName")}</DataTableCell>
                  <DataTableCell>{t("columnEmail")}</DataTableCell>
                  <DataTableCell>{t("columnRole")}</DataTableCell>
                  <DataTableCell>{t("columnPosition")}</DataTableCell>
                  <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                  <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {users.map((user) => (
                  <DataTableRow key={user.id}>
                    <DataTableCell>{user.name}</DataTableCell>
                    <DataTableCell>{user.email}</DataTableCell>
                    <DataTableCell>
                      <Typography sx={{ textTransform: "capitalize" }}>
                        {user.roleName}
                      </Typography>
                    </DataTableCell>
                    <DataTableCell>{user.positionName ?? "—"}</DataTableCell>
                    <DataTableCell align="center">
                      <Chip
                        label={user.isActive ? t("active") : t("inactive")}
                        color={user.isActive ? "success" : "error"}
                        size="small"
                        variant="outlined"
                      />
                    </DataTableCell>
                    <DataTableCell align="right">
                      {can("user.update") && (
                        <FormControlLabel
                          control={
                            <Switch
                              checked={user.isActive}
                              onChange={() => handleToggleUserActive(user)}
                              size="small"
                            />
                          }
                          label=""
                          sx={{ mr: 1 }}
                        />
                      )}
                      {can("user.update") && (
                        <IconButton size="small" onClick={() => openEdit(user)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      )}
                      {can("user.delete") && (
                        <IconButton size="small" onClick={() => setDeleteUserTarget(user)}>
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

        {tabs[tab]?.content === "roles" && (
          <Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              {can("role.create") && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={openAddRole}>
                  {t("addRole")}
                </Button>
              )}
            </Box>
            <DataTable>
              <DataTableHead>
                <DataTableRow>
                  <DataTableCell>{t("columnRoleName")}</DataTableCell>
                  <DataTableCell align="center">{t("columnUserCount")}</DataTableCell>
                  <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                  <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {roles.map((role) => (
                  <DataTableRow key={role.id}>
                    <DataTableCell>
                      <Typography sx={{ textTransform: "capitalize" }}>
                        {role.name}
                      </Typography>
                    </DataTableCell>
                    <DataTableCell align="center">
                      {users.filter((u) => u.roleName === role.name).length}
                    </DataTableCell>
                    <DataTableCell align="center">
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
                              onChange={() => handleToggleRoleActive(role)}
                              size="small"
                            />
                          }
                          label=""
                          sx={{ mr: 1 }}
                        />
                      )}
                      {can("role.update") && (
                        <IconButton size="small" onClick={() => openEditRole(role)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      )}
                      {can("role.delete") && (
                        <IconButton size="small" onClick={() => handleDeleteRole(role.id)}>
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

        {tabs[tab]?.content === "positions" && (
          <Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
              {can("position.create") && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={openAddPosition}>
                  {t("addPosition")}
                </Button>
              )}
            </Box>
            <DataTable>
              <DataTableHead>
                <DataTableRow>
                  <DataTableCell>{t("columnPosition")}</DataTableCell>
                  <DataTableCell align="center">{t("columnUserCount")}</DataTableCell>
                  <DataTableCell align="center">{t("columnStatus")}</DataTableCell>
                  <DataTableCell align="right">{t("columnActions")}</DataTableCell>
                </DataTableRow>
              </DataTableHead>
              <DataTableBody>
                {positions.map((position) => (
                  <DataTableRow key={position.id}>
                    <DataTableCell>{position.name}</DataTableCell>
                    <DataTableCell align="center">{position.userCount}</DataTableCell>
                    <DataTableCell align="center">
                      <Chip
                        label={position.isActive ? t("active") : t("inactive")}
                        color={position.isActive ? "success" : "error"}
                        size="small"
                        variant="outlined"
                      />
                    </DataTableCell>
                    <DataTableCell align="right">
                      {can("position.update") && (
                        <FormControlLabel
                          control={
                            <Switch
                              checked={position.isActive}
                              onChange={() => handleTogglePositionActive(position)}
                              size="small"
                            />
                          }
                          label=""
                          sx={{ mr: 1 }}
                        />
                      )}
                      {can("position.update") && (
                        <IconButton size="small" onClick={() => openEditPosition(position)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      )}
                      {can("position.delete") && (
                        <IconButton size="small" onClick={() => handleDeletePosition(position.id)}>
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



        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingUser ? t("editUser") : t("addUser")}</DialogTitle>
          <DialogContent>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
              <TextField
                label={t("columnName")}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                fullWidth
              />
              <TextField
                label={t("columnEmail")}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>{t("columnRole")}</InputLabel>
                <Select
                  value={form.roleId ?? ""}
                  label={t("columnRole")}
                  onChange={(e) => setForm({ ...form, roleId: e.target.value ? Number(e.target.value) : null, positionId: null })}
                >
                  {roles.filter(r => r.isActive).map((role) => (
                    <MenuItem key={role.id} value={role.id}>
                      {role.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {form.roleId === 2 && (
                <FormControl fullWidth>
                  <InputLabel>{t("columnPosition")}</InputLabel>
                  <Select
                    value={form.positionId ?? ""}
                    label={t("columnPosition")}
                    onChange={(e) => setForm({ ...form, positionId: e.target.value ? Number(e.target.value) : null })}
                  >
                    {positions.map((position) => (
                      <MenuItem key={position.id} value={position.id}>
                        {position.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <TextField
                label={t("columnPassword")}
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
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

        <Dialog open={positionDialogOpen} onClose={() => setPositionDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingPosition ? t("editPosition") : t("addPosition")}</DialogTitle>
          <DialogContent>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
              <TextField
                label={t("columnPosition")}
                value={positionForm.name}
                onChange={(e) => setPositionForm({ ...positionForm, name: e.target.value })}
                fullWidth
              />
              <FormControl fullWidth>
                <InputLabel>{t("columnRole")}</InputLabel>
                <Select
                  value={positionForm.roleId ?? ""}
                  label={t("columnRole")}
                  onChange={(e) => {
                    const newRoleId = e.target.value ? Number(e.target.value) : null;
                    const selectedRole = roles.find((r) => r.id === newRoleId);
                    const isAdmin = selectedRole?.name === "admin";
                    setPositionForm({
                      ...positionForm,
                      roleId: newRoleId,
                      permissions: isAdmin ? [...permissionsForRole("admin")] : [...permissionsForRole("customer")],
                    });
                  }}
                >
                  {roles.filter(r => r.isActive).map((role) => (
                    <MenuItem key={role.id} value={role.id}>
                      {role.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {t("positionPermissions")}
                </Typography>
                <DataTable>
                  <DataTableHead>
                    <DataTableRow>
                      <DataTableCell>{t("columnPermission")}</DataTableCell>
                      <DataTableCell align="center" sx={{ fontWeight: 600 }}>
                        <Checkbox
                          checked={positionForm.permissions.length === ALL_PERMISSIONS.length}
                          indeterminate={positionForm.permissions.length > 0 && positionForm.permissions.length < ALL_PERMISSIONS.length}
                          onChange={(e) => {
                            setPositionForm({
                              ...positionForm,
                              permissions: e.target.checked ? [...ALL_PERMISSIONS] : [],
                            });
                          }}
                          disabled={positionForm.roleId === null || roles.find((r) => r.id === positionForm.roleId)?.name === "admin"}
                          size="small"
                        />
                      </DataTableCell>
                    </DataTableRow>
                  </DataTableHead>
                  <DataTableBody>
                    {CATEGORY_GROUPS.map((group) => {
                      const groupPerms = ALL_PERMISSIONS.filter((p) => permissionBelongsToGroup(p, group));
                      if (groupPerms.length === 0) return null;
                      const Icon = group.icon;
                      const allChecked = groupPerms.every((p) => positionForm.permissions.includes(p));
                      const someChecked = groupPerms.some((p) => positionForm.permissions.includes(p));
                      const isDisabled = positionForm.roleId === null || roles.find((r) => r.id === positionForm.roleId)?.name === "admin";
                      return (
                        <Fragment key={group.key}>
                          <DataTableRow>
                            <DataTableCell colSpan={2}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
                                <Icon fontSize="small" color="primary" />
                                <Typography variant="caption" fontWeight={600}>
                                  {t(`categories.${group.key}`)}
                                </Typography>
                              </Box>
                            </DataTableCell>
                            <DataTableCell align="center">
                              <Checkbox
                                checked={allChecked}
                                indeterminate={!allChecked && someChecked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...new Set([...positionForm.permissions, ...groupPerms])]
                                    : positionForm.permissions.filter((p) => !(groupPerms as string[]).includes(p));
                                  setPositionForm({ ...positionForm, permissions: next });
                                }}
                                disabled={isDisabled}
                                size="small"
                              />
                            </DataTableCell>
                          </DataTableRow>
                          {groupPerms.map((permission) => (
                            <DataTableRow key={permission}>
                              <DataTableCell>
                                <Typography variant="body2">
                                  {PERMISSION_LABELS[permission as keyof typeof PERMISSION_LABELS] ?? permission}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                                  {permission}
                                </Typography>
                              </DataTableCell>
                              <DataTableCell align="center">
                                <Checkbox
                                  checked={positionForm.permissions.includes(permission)}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...positionForm.permissions, permission]
                                      : positionForm.permissions.filter((p) => p !== permission);
                                    setPositionForm({ ...positionForm, permissions: next });
                                  }}
                                  disabled={isDisabled}
                                  size="small"
                                />
                              </DataTableCell>
                            </DataTableRow>
                          ))}
                        </Fragment>
                      );
                    })}
                  </DataTableBody>
                </DataTable>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPositionDialogOpen(false)}>{t("cancel")}</Button>
            <Button variant="contained" onClick={handleSavePosition}>
              {t("save")}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={roleDialogOpen} onClose={() => setRoleDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingRole ? t("editRole") : t("addRole")}</DialogTitle>
          <DialogContent>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
              <TextField
                label={t("columnRoleName")}
                value={roleForm.name}
                onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                fullWidth
              />

            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRoleDialogOpen(false)}>{t("cancel")}</Button>
            <Button variant="contained" onClick={handleSaveRole}>
              {t("save")}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={!!warningPosition} onClose={() => setWarningPosition(null)} maxWidth="xs">
          <DialogTitle>{t("cannotDeactivateTitle")}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>
              {t("cannotDeactivateMessage", { position: warningPosition?.name ?? "", count: warningUsers.length })}
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
            <Button onClick={() => setWarningPosition(null)}>{t("ok")}</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteCheck(null); }} maxWidth="xs">
          <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          <DialogContent>
            {deleteLoading ? (
              <CircularProgress size={24} />
            ) : deleteCheck && !deleteCheck.canDelete && deleteTarget ? (
              <Typography variant="body2">
                {deleteTarget.type === "role"
                  ? t("deleteRoleInUse", { name: deleteTarget.name, count: deleteCheck.userCount })
                  : t("deletePositionInUse", { name: deleteTarget.name, count: deleteCheck.userCount })}
              </Typography>
            ) : deleteTarget ? (
              <Typography variant="body2">
                {t("deleteConfirmMessage", {
                  type: deleteTarget.type === "role" ? t("role") : t("position"),
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

        <Dialog open={!!deleteUserTarget} onClose={() => !deleteUserLoading && setDeleteUserTarget(null)} maxWidth="xs">
          <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          <DialogContent>
            {deleteUserLoading ? (
              <CircularProgress size={24} />
            ) : (
              <Typography variant="body2">
                {t("deleteUserConfirmMessage", {
                  name: deleteUserTarget?.name ?? "",
                  email: deleteUserTarget?.email ?? "",
                })}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteUserTarget(null)} disabled={deleteUserLoading}>
              {t("cancel")}
            </Button>
            <Button variant="contained" color="error" onClick={confirmDeleteUser} disabled={deleteUserLoading}>
              {t("delete")}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={!!errorAlert} onClose={() => setErrorAlert(null)} maxWidth="xs">
          <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">{errorAlert}</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setErrorAlert(null)}>{t("cancel")}</Button>
          </DialogActions>
        </Dialog>
        </Box>
      </DashboardLayout>
    </RequireAuth>
  );
}
