"use client";

import { Fragment, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
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
  Badge,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DnsIcon from "@mui/icons-material/Dns";
import { Pagination } from "@/components/pagination";
import { FilterPanel, type FilterSectionData } from "@/components/filter-panel";
import { PaginatedResponse } from "@kanban/shared";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import PersonIcon from "@mui/icons-material/Person";
import WorkIcon from "@mui/icons-material/Work";
import GroupIcon from "@mui/icons-material/Group";
import CategoryIcon from "@mui/icons-material/Category";
import FlagIcon from "@mui/icons-material/Flag";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import ChatIcon from "@mui/icons-material/Chat";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AssessmentIcon from "@mui/icons-material/Assessment";
import LockIcon from "@mui/icons-material/Lock";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import HistoryIcon from "@mui/icons-material/History";
import BusinessIcon from "@mui/icons-material/Business";
import FilterListIcon from "@mui/icons-material/FilterList";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DataTable, { DataTableHead, DataTableBody, DataTableRow, DataTableCell } from "@/components/data-table";
import RequirePermission from "@/components/require-permission";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions, roleLabel } from "@/lib/permissions";
import { apiFetch, ApiError } from "@/lib/api";
import { fetchCompanies, type Company } from "@/lib/apps-api";
import { PERMISSION_LABELS, ALL_PERMISSIONS, permissionsForRole, PERMISSION_DEPENDENCIES } from "@kanban/shared";
import { useNotification } from "@/components/notification";
import { useRouter } from "@/i18n/navigation";


/** จำนวนแถวต่อหน้า — ทุกแท็บดึง `?page=&limit=10` จาก API (แถบ pagination ซ่อนตัวเองเมื่อไม่เกิน 1 หน้า) */
const PAGE_SIZE = 10;

type TabKey = "users" | "roles" | "positions";

/** `total` / `totalPages` ที่เซิร์ฟเวอร์คืนมา — ใช้ป้อน `<Pagination>` */
interface PageInfo {
  total: number;
  totalPages: number;
}

const PERMISSION_GROUPS = [
  {
    key: "auth",
    icon: LockIcon,
    children: [
      { key: "auth", permissions: ["auth.login", "auth.logout"] },
    ],
  },
  {
    key: "dashboard",
    icon: DashboardIcon,
    children: [
      { key: "dashboard", permissions: ["dashboard.own.view", "dashboard.overview.view"] },
    ],
  },
  {
    key: "board",
    icon: ViewColumnIcon,
    children: [
      {
        key: "board",
        permissions: [
          "board.view", "board.column.create", "board.column.update", "board.column.delete",
          "issue.create", "issue.own.view", "issue.all.view", "issue.assigned.view", "issue.detail.view",
          "issue.own.update", "issue.all.update", "issue.assign", "issue.reassign",
          "issue.status.update", "issue.delete", "issue.trash.view", "issue.restore", "issue.lock",
          "issue.category.change", "issue.priority.change",
          "time.system.view", "time.system.edit", "time.actual.view", "time.actual.edit",
        ],
      },
    ],
  },
  {
    key: "comment",
    icon: ChatIcon,
    children: [
      {
        key: "comment",
        permissions: [
          "comment.view", "comment.create", "comment.own.update", "comment.own.delete", "comment.all.delete",
        ],
      },
    ],
  },
  {
    key: "user",
    icon: PersonIcon,
    children: [
      { key: "user", permissions: ["user.view", "user.create", "user.update", "user.delete"] },
      { key: "role", permissions: ["role.view", "role.create", "role.update", "role.delete", "role.permission.update"] },
      { key: "position", permissions: ["position.view", "position.create", "position.update", "position.delete"] },
    ],
  },
  {
    key: "settings",
    icon: SettingsOutlinedIcon,
    children: [
      {
        key: "app",
        permissions: ["app.view", "app.create", "app.update", "app.delete"],
      },
      {
        key: "company",
        permissions: ["company.view", "company.create", "company.update", "company.delete"],
      },
      {
        key: "category",
        permissions: [
          "category.view", "category.create", "category.update", "category.delete", "category.visibility.update",
        ],
      },
      {
        key: "status",
        permissions: ["status.view", "status.create", "status.update", "status.delete"],
      },
      {
        key: "priority",
        permissions: ["priority.view", "priority.create", "priority.update", "priority.delete"],
      },
      {
        key: "labels",
        permissions: ["label.view", "label.create", "label.update", "label.delete"],
      },
      {
        // กฎอัตโนมัติ = แท็บใน /master-data (ปุ่ม ⚡ ในแท็บสถานะเป็นทางลัด ขึ้นเมื่อมีสิทธิ์กฎ)
        key: "automation",
        permissions: ["automation.view", "automation.update"],
      },
    ],
  },
  {
    key: "systems",
    icon: DnsIcon,
    children: [
      { key: "systems", permissions: ["system.view", "system.create", "system.update", "system.delete"] },
    ],
  },
  {
    key: "report",
    icon: AssessmentIcon,
    children: [
      { key: "report", permissions: ["report.view", "report.export"] },
    ],
  },
  {
    key: "logs",
    icon: HistoryIcon,
    children: [
      { key: "logs", permissions: ["log.view", "log.export"] },
    ],
  },
] as const;

type PermissionGroup = (typeof PERMISSION_GROUPS)[number];
type PermissionChild = PermissionGroup["children"][number];

function getDependentPermissions(permission: string): string[] {
  return PERMISSION_DEPENDENCIES[permission] ?? [];
}

function getRequiredPermissions(permission: string): string[] {
  return Object.entries(PERMISSION_DEPENDENCIES)
    .filter(([, deps]) => deps.includes(permission))
    .map(([perm]) => perm);
}

function togglePermission(
  current: readonly string[],
  permission: string,
  checked: boolean,
): string[] {
  if (checked) {
    const deps = getDependentPermissions(permission);
    const next = new Set([...current, permission, ...deps]);
    return [...next];
  } else {
    const required = getRequiredPermissions(permission);
    const next = current.filter((p) => p !== permission && !required.includes(p));
    return next;
  }
}

function toggleGroup(current: readonly string[], permissions: readonly string[], checked: boolean): string[] {
  if (checked) {
    const next = new Set([...current]);
    permissions.forEach((p) => {
      next.add(p);
      getDependentPermissions(p).forEach((d) => next.add(d));
    });
    return [...next];
  } else {
    const toRemove = new Set(permissions);
    return current.filter((p) => !toRemove.has(p));
  }
}

interface User {
  id: string;
  email: string;
  name: string;
  roleId: number | null;
  roleName: string | null;
  positionId: number | null;
  positionName: string | null;
  /** บริษัทของลูกค้าคนนี้ (`users.company_id`) — บทบาทอื่นเป็น `null` เสมอ */
  companyId: number | null;
  companyName: string | null;
  isActive: boolean;
}

interface Role {
  userCount: number;
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
  /** chrome ของ popover ตัวกรอง (หัวข้อ/ปุ่มล้าง) อยู่ที่ namespace `Filters` แชร์ทุกหน้า */
  const tf = useTranslations("Filters");
  const { can } = usePermissions();
  const token = useAuthStore((s) => s.token);
  const router = useRouter();
  const { notify } = useNotification();
  const [tab, setTab] = useState(0);
  /** แถวของ "หน้าปัจจุบัน" แต่ละแท็บ — ดึงทีละหน้า (`?page=&limit=10`) ไม่เหมาทั้งตาราง */
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  /** แท็บไหนดึงข้อมูลมาแล้วบ้าง — ใช้โชว์ spinner แทนตารางเปล่าตอนสลับแท็บ */
  const [loaded, setLoaded] = useState<Record<TabKey, boolean>>({ users: false, roles: false, positions: false });
  /** total/totalPages ของแต่ละแท็บจากเซิร์ฟเวอร์ — แถบ pagination ซ่อนตัวเองเมื่อไม่เกิน 1 หน้า */
  const [meta, setMeta] = useState<Record<TabKey, PageInfo>>({
    users: { total: 0, totalPages: 1 },
    roles: { total: 0, totalPages: 1 },
    positions: { total: 0, totalPages: 1 },
  });
  /** ชุดข้อมูลเต็มให้ dropdown — ฟิวเตอร์บนแท็บผู้ใช้ + ฟอร์มเพิ่ม/แก้ (ตารางเหลือแค่ 10 แถว/หน้า จึงใช้แทนไม่ได้) */
  const [rolesAll, setRolesAll] = useState<Role[] | null>(null);
  const [positionsAll, setPositionsAll] = useState<Position[] | null>(null);
  /** รายการบริษัทให้ dropdown (ฟิวเตอร์ + ฟอร์มผู้ใช้) — โหลดตอนเปิดแท็บผู้ใช้ */
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({
    email: "",
    name: "",
    roleId: null as number | null,
    positionId: null as number | null,
    companyId: null as number | null,
    password: "",
  });
  /** ข้อความใต้ dropdown บริษัท — ลูกค้าบันทึกไม่ได้ถ้ายังไม่เลือก */
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [positionForm, setPositionForm] = useState({ name: "", roleId: null as number | null, permissions: [] as string[] });
  /** False while an edit dialog is still fetching its real permission set. */
  const [positionPermsReady, setPositionPermsReady] = useState(true);
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
  /** หน้าที่เปิดอยู่ของแต่ละแท็บ — เปลี่ยนหน้า = ยิง API หน้านั้นใหม่ทีละหน้า */
  const [pages, setPages] = useState<Record<TabKey, number>>({ users: 1, roles: 1, positions: 1 });
  /** bump ค่า = ให้ effect ของแท็บนั้นดึงข้อมูลใหม่ (หลังบันทึก/ลบ/สลับสถานะ) */
  const [reloadKeys, setReloadKeys] = useState<Record<TabKey, number>>({ users: 0, roles: 0, positions: 0 });
  /** ฟิวเตอร์บนแท็บผู้ใช้ — **server-side multi-select** (`GET /users?companyIds=1,2&roleIds=…&positionIds=…`) */
  const [userFilters, setUserFilters] = useState({
    companyIds: [] as number[],
    roleIds: [] as number[],
    positionIds: [] as number[],
  });
  /** anchor ของ popover ตัวกรอง (`components/filter-panel.tsx` — แชร์กับบอร์ด/รายงาน/systems) */
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const [usersError, setUsersError] = useState(false);
  const [rolesError, setRolesError] = useState(false);
  const [positionsError, setPositionsError] = useState(false);

  const canViewUsers = can("user.view");
  const canViewRoles = can("role.view");
  const canViewPositions = can("position.view");

  useEffect(() => {
    setUsersError(false);
    setRolesError(false);
    setPositionsError(false);
  }, [canViewUsers, canViewRoles, canViewPositions]);
  const effectiveCanViewUsers = canViewUsers && !usersError;
  const effectiveCanViewRoles = canViewRoles && !rolesError;
  const effectiveCanViewPositions = canViewPositions && !positionsError;
  const hasAnyViewPermission = effectiveCanViewUsers || effectiveCanViewRoles || effectiveCanViewPositions;
  const [mounted, setMounted] = useState(false);

  /** เนื้อหาของแท็บเรียงตามที่มีสิทธิ์ดู — `tab` ชี้ลงใน array นี้ (ค่าเป็น string จึงใช้เป็น dep ของ effect ได้ปลอดภัย) */
  const tabContents: TabKey[] = [
    ...(effectiveCanViewUsers ? ["users" as const] : []),
    ...(effectiveCanViewRoles ? ["roles" as const] : []),
    ...(effectiveCanViewPositions ? ["positions" as const] : []),
  ];
  const activeContent = tabContents[tab];

  useEffect(() => {
    if (mounted && !hasAnyViewPermission) {
      router.replace("/");
    }
  }, [mounted, hasAnyViewPermission, router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  /**
   * ชุดข้อมูลเต็มให้ dropdown — ฟิวเตอร์บนแท็บผู้ใช้ + ฟอร์มเพิ่ม/แก้ (บทบาท/
   * ตำแหน่ง/บริษัท) ดึง**ครั้งเดียว**ตอนแท็บแรกที่ต้องใช้เปิด เพราะตารางตอนนี้
   * เหลือแค่ 10 แถว/หน้า เอาไปใช้เป็นรายการเลือกแทนไม่ได้
   */
  function loadRolesAll() {
    return apiFetch<PaginatedResponse<Role>>("/roles?page=1&limit=100", {}, token)
      .then((r) => setRolesAll(r.data))
      .catch(() => {
        /* fail-open: dropdown อาจว่าง — ไม่ทำให้หน้าพัง */
      });
  }
  function loadPositionsAll() {
    return apiFetch<PaginatedResponse<Position>>("/positions?page=1&limit=100", {}, token)
      .then((r) => setPositionsAll(r.data))
      .catch(() => {
        /* fail-open */
      });
  }
  function loadCompanies() {
    // `GET /companies` ตั้งใจเปิดให้ทุกคนที่ล็อกอิน จึงไม่มี 403 ให้กังวล —
    // ถ้าล้มจริงก็แค่ dropdown โชว์ว่ายังไม่มีบริษัท
    return fetchCompanies()
      .then((r) => setCompanies(r.data))
      .catch(() => {
        /* fail-open: ฟอร์มยังเปิดแก้ข้อมูลอื่นได้ตามเดิม */
      });
  }

  /** สั่งให้แท็บนั้นดึงข้อมูลหน้าปัจจุบันใหม่ */
  function bumpReload(key: TabKey) {
    setReloadKeys((prev) => ({ ...prev, [key]: prev[key] + 1 }));
  }

  /**
   * หลัง "เพิ่ม" รายการใหม่ — ทุกตารางเรียง `id ASC` รายการใหม่จึงตกท้ายตาราง
   * = หน้าสุดท้าย: ปรับ total แล้วกระโดดไปหน้านั้นพร้อมดึงใหม่
   * เพื่อให้เห็นรายการที่เพิ่งบันทึกทันที (เคสกรองฟิวเตอร์ค้างอยู่แล้วรายการใหม่
   * ไม่เข้าเงื่อนไข = หน้าเกิน → effect จะถอยกลับหน้าให้เอง)
   */
  function jumpToNewRow(key: TabKey) {
    const total = meta[key].total + 1;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    setMeta((prev) => ({ ...prev, [key]: { total, totalPages } }));
    setPages((prev) => ({ ...prev, [key]: totalPages }));
    setReloadKeys((prev) => ({ ...prev, [key]: prev[key] + 1 }));
  }

  /**
   * หลัง "ลบ" แถว — ปรับ total ใหม่ และถ้าหน้าปัจจุบันว่าง (ลบแถวสุดท้ายของ
   * หน้าสุดท้าย) ให้ถอยกลับหน้า — `pages` เปลี่ยนเมื่อไหร่ effect ของแท็บจะดึง
   * ข้อมูลหน้านั้นให้เอง (ค่าไม่เปลี่ยน = ไม่ trigger → ไม่ยิง request ซ้ำ)
   */
  function afterDelete(key: TabKey) {
    const total = Math.max(0, meta[key].total - 1);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    setMeta((prev) => ({ ...prev, [key]: { total, totalPages } }));
    setPages((prev) => (prev[key] > totalPages ? { ...prev, [key]: totalPages } : prev));
  }

  /**
   * เปลี่ยนฟิวเตอร์ = กลับไปหน้า 1 แล้วให้ effect ดึงใหม่ (server-side filter) —
   * tick/untick 1 ตัวเลือกใน popover ตัวกรอง
   */
  function toggleUserFilter(key: keyof typeof userFilters, id: number) {
    setUserFilters((prev) => {
      const next = { ...prev };
      const list = next[key];
      next[key] = list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
      return next;
    });
    setPages((prev) => ({ ...prev, users: 1 }));
  }

  /** ปุ่ม "ล้างทั้งหมด" ใน popover ตัวกรอง */
  function clearUserFilters() {
    setUserFilters({ companyIds: [], roleIds: [], positionIds: [] });
    setPages((prev) => ({ ...prev, users: 1 }));
  }

  // ชุด dropdown — ดึงครั้งเดียวตอนแท็บแรกที่ต้องใช้เปิด (เช็ค `=== null` ก่อน
  // จึงเรียกซ้ำได้ไม่ลูป และ retry เองได้ตอนสลับแท็บถ้าดึงพลาด)
  useEffect(() => {
    if (!activeContent) return;
    if ((activeContent === "users" || activeContent === "positions") && rolesAll === null) void loadRolesAll();
    if (activeContent === "users" && positionsAll === null) void loadPositionsAll();
    if (activeContent === "users" && companies === null) void loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContent, rolesAll, positionsAll, companies]);

  /**
   * ดึงข้อมูล "แท็บที่เปิดอยู่เท่านั้น" — 1 request ต่อการเข้า/สลับแท็บ และดึงใหม่
   * ทุกครั้งที่เปลี่ยนหน้า / เปลี่ยนฟิวเตอร์ / bump `reloadKeys` (`?page=&limit=10`
   * = ดึงทีละหน้า ไม่เหมาทั้งตาราง)
   */
  useEffect(() => {
    if (!activeContent) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        if (activeContent === "users") {
          const qs = new URLSearchParams({ page: String(pages.users), limit: String(PAGE_SIZE) });
          if (userFilters.companyIds.length) qs.set("companyIds", userFilters.companyIds.join(","));
          if (userFilters.roleIds.length) qs.set("roleIds", userFilters.roleIds.join(","));
          if (userFilters.positionIds.length) qs.set("positionIds", userFilters.positionIds.join(","));
          const r = await apiFetch<PaginatedResponse<User>>(`/users?${qs.toString()}`, {}, token);
          if (cancelled) return;
          if (r.data.length === 0 && pages.users > 1) {
            // หน้าเกิน (เช่น เพิ่มรายการใหม่ตอนกรองฟิวเตอร์ค้างอยู่) → ถอยกลับหน้าหนึ่งแล้วดึงใหม่
            setPages((prev) => ({ ...prev, users: pages.users - 1 }));
            return;
          }
          setUsers(r.data);
          setMeta((prev) => ({ ...prev, users: { total: r.total, totalPages: r.totalPages } }));
          setLoaded((prev) => ({ ...prev, users: true }));
        } else if (activeContent === "roles") {
          const r = await apiFetch<PaginatedResponse<Role>>(
            `/roles?page=${pages.roles}&limit=${PAGE_SIZE}`,
            {},
            token,
          );
          if (cancelled) return;
          if (r.data.length === 0 && pages.roles > 1) {
            setPages((prev) => ({ ...prev, roles: pages.roles - 1 }));
            return;
          }
          setRoles(r.data);
          setMeta((prev) => ({ ...prev, roles: { total: r.total, totalPages: r.totalPages } }));
          setLoaded((prev) => ({ ...prev, roles: true }));
        } else {
          const r = await apiFetch<PaginatedResponse<Position>>(
            `/positions?page=${pages.positions}&limit=${PAGE_SIZE}`,
            {},
            token,
          );
          if (cancelled) return;
          if (r.data.length === 0 && pages.positions > 1) {
            setPages((prev) => ({ ...prev, positions: pages.positions - 1 }));
            return;
          }
          setPositions(r.data);
          setMeta((prev) => ({ ...prev, positions: { total: r.total, totalPages: r.totalPages } }));
          setLoaded((prev) => ({ ...prev, positions: true }));
        }
      } catch (err) {
        // 403 = สิทธิ์ใน DB ไม่ตรงกับ mirror ฝั่งเว็บ → ซ่อนแท็บนี้ทิ้ง (เหมือนเดิม)
        if (!cancelled && err instanceof ApiError && err.status === 403) {
          if (activeContent === "users") setUsersError(true);
          else if (activeContent === "roles") setRolesError(true);
          else setPositionsError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeContent, pages, userFilters, reloadKeys, token]);

  function openAdd() {
    setEditingUser(null);
    setForm({ email: "", name: "", roleId: null, positionId: null, companyId: null, password: "" });
    setCompanyError(null);
    setDialogOpen(true);
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setForm({
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      positionId: user.positionId,
      companyId: user.companyId,
      password: "",
    });
    setCompanyError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    // บริษัทเป็นข้อมูลของ "ลูกค้า" เท่านั้น — เทียบด้วยชื่อบทบาท (ไม่ใช่เลข id)
    // เหมือนที่หน้าบอร์ดเช็ก `roleName === "programmer"`
    const isCustomerRole =
      rolesAll?.find((r) => r.id === form.roleId)?.name === "customer";
    if (isCustomerRole && !form.companyId) {
      setCompanyError(t("companyRequired"));
      return;
    }
    try {
      const payload = {
        ...form,
        positionId: form.roleId === 2 ? form.positionId : null,
        // บทบาทอื่นถูกล้างเป็น null ที่เซิร์ฟเวอร์อยู่แล้ว ส่งตรงไปเลยจะได้
        // ฟอร์มกับ API ตรงกันตั้งแต่ฝั่งแรก
        companyId: isCustomerRole ? form.companyId : null,
      };
      if (editingUser) {
        await apiFetch(`/users/${editingUser.id}`, { method: "PATCH", body: JSON.stringify(payload) }, token);
        notify(t("userUpdated"));
      } else {
        await apiFetch("/users", { method: "POST", body: JSON.stringify(payload) }, token);
        notify(t("userCreated"));
      }
      setDialogOpen(false);
      // แก้ไข = จำนวนไม่เปลี่ยน → ดึงหน้าปัจจุบันซ้ำ · เพิ่มใหม่ = ตกท้ายตาราง → กระโดดไปหน้าสุดท้ายให้เห็นเลย
      if (editingUser) bumpReload("users");
      else jumpToNewRow("users");
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
        afterDelete("users");
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
    // new position: whatever is ticked from the start IS the set we send
    setPositionPermsReady(true);
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
    // Until the real set arrives the boxes below are placeholders — saving now
    // would overwrite the position's permissions with role defaults, so the
    // Save button stays disabled until this flips to true.
    setPositionPermsReady(false);
    setPositionDialogOpen(true);
    try {
      const data = await apiFetch<{ permissions: string[] }>(
        `/positions/${position.id}/permissions`,
        {},
        token,
      );
      setPositionForm((prev) => ({ ...prev, permissions: data.permissions }));
      setPositionPermsReady(true);
    } catch {
      // leave the save button disabled — a silent fallback would now revoke
      // everything the position actually had
      notify(t("positionPermsLoadError"), "error");
    }
  }

  async function handleSavePosition() {
    if (!positionPermsReady) return;
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
      setPositionDialogOpen(false);
      if (editingPosition) bumpReload("positions");
      else jumpToNewRow("positions");
      // dropdown ตำแหน่งในฟอร์มผู้ใช้ต้องเห็นรายการใหม่/ชื่อใหม่ด้วย
      if (positionsAll !== null) void loadPositionsAll();
      await useAuthStore.getState().refreshPermissions();
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
        afterDelete("positions");
        if (positionsAll !== null) void loadPositionsAll();
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
      setRoleDialogOpen(false);
      if (editingRole) bumpReload("roles");
      else jumpToNewRow("roles");
      // dropdown บทบาท (ฟิวเตอร์ + ฟอร์ม) ต้องเห็นชื่อใหม่/ isActive ใหม่ด้วย
      if (rolesAll !== null) void loadRolesAll();
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
      setRoles((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      afterDelete("roles");
      if (rolesAll !== null) void loadRolesAll();
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
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, isActive: !r.isActive } : r)));
      // dropdown กรอง `role.isActive` อยู่ → refresh ชุด dropdown ด้วย
      if (rolesAll !== null) void loadRolesAll();
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

  const tabLabels: Record<TabKey, string> = {
    users: t("tabUsers"),
    roles: t("tabRoles"),
    positions: t("tabPositions"),
  };
  const tabs = tabContents.map((content) => ({ label: tabLabels[content], content }));

  // "ลูกค้า" ตัวเดียวที่ฟอร์มผู้ใช้โชว์ dropdown บริษัท — เทียบด้วยชื่อบทบาท
  // (ไม่ใช่เลข id) แบบเดียวกับที่หน้าบอร์ดเช็ก `roleName === "programmer"`
  const isCustomerRole = rolesAll?.find((r) => r.id === form.roleId)?.name === "customer";

  /** จำนวน tick รวมทุก section — badge บนปุ่ม trigger + chip ที่หัว panel */
  const filterCount =
    userFilters.companyIds.length + userFilters.roleIds.length + userFilters.positionIds.length;
  const hasFilter = filterCount > 0;

  /**
   * section ของ popover ตัวกรอง — เรียงเอง + คำนวณ `initialOpen` เอง (เปิดอัตโนมัติ
   * เฉพาะ section ที่มีการเลือกไว้ หรือ section แรกเมื่อยังไม่เลือกอะไรเลย —
   * ตรงกติกาเดียวกับบอร์ด) · รายการมาจากชุดข้อมูลเต็ม `*All` ไม่ใช่ตาราง
   * เพราะตารางเหลือแค่ 10 แถว/หน้า
   */
  const filterSections: FilterSectionData[] = [
    {
      key: "company",
      title: t("filterCompany"),
      icon: <BusinessIcon sx={{ fontSize: 18 }} />,
      count: userFilters.companyIds.length,
      options: (companies ?? []).map((company) => ({
        id: company.id,
        label: company.name,
        checked: userFilters.companyIds.includes(company.id),
        onToggle: () => toggleUserFilter("companyIds", company.id),
      })),
      initialOpen: userFilters.companyIds.length > 0 || !hasFilter,
    },
    {
      key: "role",
      title: t("filterRole"),
      icon: <GroupIcon sx={{ fontSize: 18 }} />,
      count: userFilters.roleIds.length,
      options: (rolesAll ?? []).map((role) => ({
        id: role.id,
        label: roleLabel(role.name),
        checked: userFilters.roleIds.includes(role.id),
        onToggle: () => toggleUserFilter("roleIds", role.id),
      })),
      initialOpen: userFilters.roleIds.length > 0,
    },
    {
      key: "position",
      title: t("filterPosition"),
      icon: <WorkIcon sx={{ fontSize: 18 }} />,
      count: userFilters.positionIds.length,
      options: (positionsAll ?? []).map((position) => ({
        id: position.id,
        label: position.name,
        checked: userFilters.positionIds.includes(position.id),
        onToggle: () => toggleUserFilter("positionIds", position.id),
      })),
      initialOpen: userFilters.positionIds.length > 0,
    },
  ];

  return (
    <RequirePermission permissions={["user.view", "role.view", "position.view"]}>
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
            {/* แถวปุ่ม — ตัวกรอง (badge นับจำนวน) อยู่ซ้ายของปุ่มเพิ่ม ชิดขวาเหมือน /systems */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1, mb: 2 }}>
              <Tooltip title={tf("title")}>
                <Badge
                  badgeContent={filterCount}
                  max={99}
                  overlap="circular"
                  sx={{
                    "& .MuiBadge-badge": {
                      minWidth: 16,
                      height: 16,
                      px: 0.4,
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1,
                      bgcolor: "primary.contrastText",
                      color: "primary.main",
                      top: 4,
                      right: 4,
                    },
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={(event) => setFilterAnchor(event.currentTarget)}
                    aria-haspopup="dialog"
                    aria-expanded={Boolean(filterAnchor)}
                    aria-label={tf("title")}
                    sx={{
                      width: 36,
                      height: 36,
                      color: filterCount > 0 ? "primary.contrastText" : "text.secondary",
                      bgcolor: filterCount > 0 ? "primary.main" : "transparent",
                      "&:hover": {
                        bgcolor: filterCount > 0 ? "primary.dark" : "action.hover",
                      },
                    }}
                  >
                    <FilterListIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Badge>
              </Tooltip>
              {can("user.create") && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
                  {t("addUser")}
                </Button>
              )}
            </Box>

            {/* popover ตัวกรอง — chrome แชร์กับบอร์ด/รายงาน/systems (components/filter-panel.tsx) */}
            <FilterPanel
              open={Boolean(filterAnchor)}
              anchorEl={filterAnchor}
              onClose={() => setFilterAnchor(null)}
              sections={filterSections}
              onClearAll={clearUserFilters}
            />

            {!loaded.users ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
              </Box>
            ) : (
            <DataTable>
              <DataTableHead>
                <DataTableRow>
                  <DataTableCell>{t("columnName")}</DataTableCell>
                  <DataTableCell>{t("columnEmail")}</DataTableCell>
                  <DataTableCell>{t("columnRole")}</DataTableCell>
                  <DataTableCell>{t("columnPosition")}</DataTableCell>
                  <DataTableCell>{t("columnCompany")}</DataTableCell>
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
                      <Typography>{roleLabel(user.roleName)}</Typography>
                    </DataTableCell>
                    <DataTableCell>{user.positionName ?? "—"}</DataTableCell>
                    <DataTableCell>{user.companyName ?? "—"}</DataTableCell>
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
            )}
            <Pagination
              page={pages.users}
              totalPages={meta.users.totalPages}
              total={meta.users.total}
              limit={PAGE_SIZE}
              onPageChange={(p) => setPages((prev) => ({ ...prev, users: p }))}
            />
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
            {!loaded.roles ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
              </Box>
            ) : (
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
                      <Typography>{roleLabel(role.name)}</Typography>
                    </DataTableCell>
                    <DataTableCell align="center">
                      {role.userCount}
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
            )}
            <Pagination
              page={pages.roles}
              totalPages={meta.roles.totalPages}
              total={meta.roles.total}
              limit={PAGE_SIZE}
              onPageChange={(p) => setPages((prev) => ({ ...prev, roles: p }))}
            />
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
            {!loaded.positions ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
              </Box>
            ) : (
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
            )}
            <Pagination
              page={pages.positions}
              totalPages={meta.positions.totalPages}
              total={meta.positions.total}
              limit={PAGE_SIZE}
              onPageChange={(p) => setPages((prev) => ({ ...prev, positions: p }))}
            />
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
                  onChange={(e) => {
                    const nextRoleId = e.target.value ? Number(e.target.value) : null;
                    setForm({
                      ...form,
                      roleId: nextRoleId,
                      positionId: null,
                      // บริษัทเป็นของ "ลูกค้า" เท่านั้น — เปลี่ยนบทบาทแล้วค่าเดิม
                      // ใช้ไม่ได้ ล้างทิ้งเลยพร้อมกับข้อความ error
                      companyId: null,
                    });
                    setCompanyError(null);
                  }}
                >
                  {(rolesAll ?? []).filter(r => r.isActive).map((role) => (
                    <MenuItem key={role.id} value={role.id}>
                      {role.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {/* ลูกค้าต้องเลือกบริษัท — `users.company_id` คือตัวรู้ว่าคนนี้เป็นคน
                 ของบริษัทไหน บทบาทอื่นไม่โชว์ช่องนี้เลย (ค่าถูกบังคับเป็น null) */}
              {isCustomerRole && (
                <FormControl fullWidth error={!!companyError}>
                  <InputLabel>{t("columnCompany")}</InputLabel>
                  <Select
                    value={form.companyId ?? ""}
                    label={t("columnCompany")}
                    onChange={(e) => {
                      setForm({ ...form, companyId: e.target.value ? Number(e.target.value) : null });
                      setCompanyError(null);
                    }}
                  >
                    <MenuItem value="" disabled>
                      <em>{t("selectCompany")}</em>
                    </MenuItem>
                    {/* จงใจโชว์ครบทุกบริษัทรวมที่ถูกปิดสถานะ — กันเคสลูกค้าผูกอยู่กับ
                        บริษัทที่ admin เพิ่ง toggle ปิด แล้ว dropdown โชว์ช่องว่างทั้งที่มีค่า */}
                    {(companies ?? []).map((company) => (
                      <MenuItem key={company.id} value={company.id}>
                        {company.name}
                      </MenuItem>
                    ))}
                  </Select>
                  {companyError && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                      {companyError}
                    </Typography>
                  )}
                </FormControl>
              )}
              {form.roleId === 2 && (
                <FormControl fullWidth>
                  <InputLabel>{t("columnPosition")}</InputLabel>
                  <Select
                    value={form.positionId ?? ""}
                    label={t("columnPosition")}
                    onChange={(e) => setForm({ ...form, positionId: e.target.value ? Number(e.target.value) : null })}
                  >
                    {(positionsAll ?? []).map((position) => (
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
                    const selectedRole = rolesAll?.find((r) => r.id === newRoleId);
                    const isAdmin = selectedRole?.name === "admin";
                    setPositionForm({
                      ...positionForm,
                      roleId: newRoleId,
                      // Editing an existing position: keep the permission set
                      // already loaded — silently swapping in role defaults
                      // would wipe what an admin configured. Only a brand-new
                      // position (nothing to lose yet) seeds from the role.
                      permissions: editingPosition
                        ? positionForm.permissions
                        : isAdmin
                          ? [...permissionsForRole("admin")]
                          : [...permissionsForRole(selectedRole?.name ?? "customer")],
                    });
                  }}
                >
                  {(rolesAll ?? []).filter(r => r.isActive).map((role) => (
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
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  {t("positionPermissionsHint")}
                </Typography>

                <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={positionForm.permissions.length === ALL_PERMISSIONS.length}
                        indeterminate={positionForm.permissions.length > 0 && positionForm.permissions.length < ALL_PERMISSIONS.length}
                        onChange={(e) => {
                          setPositionForm({
                            ...positionForm,
                            permissions: e.target.checked ? [...ALL_PERMISSIONS] : [],
                          });
                        }}
                        disabled={positionForm.roleId === null || rolesAll?.find((r) => r.id === positionForm.roleId)?.name === "admin"}
                        size="small"
                      />
                    }
                    label={<Typography variant="body2">{t("selectAll")}</Typography>}
                  />
                </Box>

                <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {PERMISSION_GROUPS.map((group) => {
                    const groupPerms = group.children.flatMap((c) => c.permissions);
                    if (groupPerms.length === 0) return null;
                    const Icon = group.icon;
                    const allChecked = groupPerms.every((p) => positionForm.permissions.includes(p));
                    const someChecked = groupPerms.some((p) => positionForm.permissions.includes(p));
                    const isDisabled = positionForm.roleId === null || rolesAll?.find((r) => r.id === positionForm.roleId)?.name === "admin";
                    const hasMultipleChildren = group.children.length > 1;
                    return (
                      <Card key={group.key} variant="outlined" sx={{ overflow: "visible" }}>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", bgcolor: "grey.100", py: 1, px: 2, borderRadius: 1 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                            <Icon fontSize="small" color="primary" />
                            <Typography variant="subtitle1" fontWeight={700} color="text.primary">
                              {t(`Nav.${group.key}`)}
                            </Typography>
                          </Box>
                          <Checkbox
                            checked={allChecked}
                            indeterminate={!allChecked && someChecked}
                            onChange={(e) => {
                              const next = toggleGroup(positionForm.permissions, groupPerms, e.target.checked);
                              setPositionForm({ ...positionForm, permissions: next });
                            }}
                            disabled={isDisabled}
                            size="small"
                          />
                        </Box>
                        <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                          {group.children.map((child) => {
                            const childPerms = child.permissions;
                            const childAllChecked = childPerms.every((p) => positionForm.permissions.includes(p));
                            const childSomeChecked = childPerms.some((p) => positionForm.permissions.includes(p));
                            return (
                              <Box key={child.key} sx={{ mb: hasMultipleChildren ? 2 : 0 }}>
                                {hasMultipleChildren && (
                                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5, bgcolor: "grey.50", px: 1.5, py: 0.5, borderRadius: 1 }}>
                                    <Typography variant="body2" fontWeight={600} color="text.primary">
                                      {t(`Nav.${child.key}`)}
                                    </Typography>
                                    <Checkbox
                                      checked={childAllChecked}
                                      indeterminate={!childAllChecked && childSomeChecked}
                                      onChange={(e) => {
                                        const next = toggleGroup(positionForm.permissions, childPerms, e.target.checked);
                                        setPositionForm({ ...positionForm, permissions: next });
                                      }}
                                      disabled={isDisabled}
                                      size="small"
                                    />
                                  </Box>
                                )}
                                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, pl: hasMultipleChildren ? 2 : 0 }}>
                                  {childPerms.map((permission) => (
                                      <Box
                                        key={permission}
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          py: 0.5,
                                          borderRadius: 1,
                                          "&:hover": { bgcolor: "grey.50" },
                                        }}
                                      >
                                        <Typography variant="body2">
                                          {PERMISSION_LABELS[permission as keyof typeof PERMISSION_LABELS] ?? permission}
                                        </Typography>
                                        <Checkbox
                                          checked={positionForm.permissions.includes(permission)}
                                          onChange={(e) => {
                                            const next = togglePermission(positionForm.permissions, permission, e.target.checked);
                                            setPositionForm({ ...positionForm, permissions: next });
                                          }}
                                          disabled={isDisabled}
                                          size="small"
                                        />
                                      </Box>
                                    ))}
                                </Box>
                              </Box>
                            );
                          })}
                        </CardContent>
                      </Card>
                    );
                  })}
                </Box>
              </Box>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPositionDialogOpen(false)}>{t("cancel")}</Button>
            <Button
              variant="contained"
              onClick={handleSavePosition}
              disabled={!positionPermsReady}
            >
              {positionPermsReady ? t("save") : <CircularProgress size={18} />}
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
    </RequirePermission>
  );
}
