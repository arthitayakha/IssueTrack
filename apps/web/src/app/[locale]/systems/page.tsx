"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Badge,
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
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import BusinessIcon from "@mui/icons-material/Business";
import FilterListIcon from "@mui/icons-material/FilterList";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SearchIcon from "@mui/icons-material/Search";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DataTable, {
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/data-table";
import RequirePermission from "@/components/require-permission";
import { Pagination } from "@/components/pagination";
import {
  FilterPanel,
  type FilterOption,
  type FilterSectionData,
} from "@/components/filter-panel";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { usePermissions } from "@/lib/permissions";
import { useNotification } from "@/components/notification";
import AppActions from "@/components/app-actions";
import AppFormDialog, { type EditingRecord } from "@/components/app-form-dialog";
import {
  deleteAppRecord,
  fetchCompanies,
  fetchSystemsApps,
  type App,
  type AppCompanyLink,
  type Company,
} from "@/lib/apps-api";
import {
  daysLeftIso,
  expiryChipLabel,
  expiryColor,
  formatDay,
  type ExpiryLabelKey,
  type ExpiryStatus,
} from "@/lib/app-expiry";
import { fetchAppUsageAllTime } from "@/lib/reports-api";

/**
 * 1 แถวในตาราง = **1 รายการข้อมูล (1 ช่วงเวลาของคู่ แอป×บริษัท)** — แอปที่ยัง
 * ไม่มีรายการเลย**ไม่มีแถว** (ไปจัดการชื่อได้ที่แท็บแอปใน `/master-data`)
 */
interface SystemRow {
  app: App;
  link: AppCompanyLink;
}

/** ปัดเศษ 1 ตำแหน่ง — เหมือน `round1` ของ reports (วินาที → ชม. อาจมีเศษทศนิยม) */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** จำนวนแถวต่อหน้า — แถบ pagination ซ่อนตัวเองเมื่อไม่เกินนี้ (`totalPages <= 1`) */
const PAGE_SIZE = 10;

/**
 * ค่าของตัวกรอง "สถานะอายุ" — **`near` รวม `expiring_soon` + `critical`** เพราะ
 * chip ในตารางขึ้นข้อความ**ตามจำนวนวัน** สองสถานะนี้จึงโชว์ "เหลือ N วัน ใกล้หมดอายุ"
 * เหมือนกัน ผู้ใช้จึงต้องเห็นทั้งคู่เมื่อ tick "ใกล้หมดอายุ" (เลือกหลายค่า = OR)
 */
type ExpiryFilterValue = "normal" | "near" | "expired" | "none";

/** ตัวเลือกใน section (เรียงตามที่โชว์ใน popover) */
const EXPIRY_FILTERS: ExpiryFilterValue[] = ["normal", "near", "expired", "none"];

/** label ของแต่ละตัวกรอง — ยืม key ที่มีอยู่แล้วใน `Settings` (ไม่ต้องเพิ่ม key ใหม่) */
const EXPIRY_FILTER_LABEL: Record<ExpiryFilterValue, ExpiryLabelKey> = {
  normal: "expiryNormal",
  near: "expiryExpiringSoon",
  expired: "expiryExpired",
  none: "expiryNone",
};

/** สีไอคอนหน้าตัวเลือก — ไล่ตามความรุนแรงเหมือนชิปในตาราง */
const EXPIRY_FILTER_COLOR: Record<ExpiryFilterValue, string> = {
  normal: "success.main",
  near: "warning.main",
  expired: "error.main",
  none: "text.disabled",
};

/** แถวผ่านตัวกรองสถานะอายุหรือไม่ — เงื่อนไขเดียวที่ต้องแตก branch คือ `near` */
function matchesExpiryFilter(status: ExpiryStatus, filter: ExpiryFilterValue): boolean {
  if (filter === "near") return status === "expiring_soon" || status === "critical";
  return status === filter;
}

/**
 * หน้า **ข้อมูลระบบ** — ตารางรายการข้อมูล (**1 แถวต่อ 1 ช่วงเวลา** ของคู่
 * แอป×บริษัท: บริษัท / วันที่เริ่มใช้งาน / วันที่หมดอายุ / ชั่วโมง MA /
 * **คงเหลือ** / สถานะอายุ) + ฟอร์มเพิ่ม/แก้ไข/ลบ **เฉพาะรายการนั้น**
 * (คอลัมน์ "การใช้งาน" กับสวิตช์เปิด/ปิด ถูกเอาออกแล้ว — การเปิด/ปิดแอปทำที่แท็บแอปใน `/master-data`)
 *
 * แยกจากแท็บ "แอป" ใน `/master-data` คนละเรื่องกัน — แท็บแอป = ชื่อ + สถานะ
 * (ข้อมูลหลัก) · หน้านี้ = ข้อมูลที่ผูกคู่ แอป×บริษัท แอปที่ยังไม่มีรายการ
 * จึง**ไม่มีแถว**ที่นี่ · หน้ากันด้วย `system.view`
 */
export default function SystemsPage() {
  const t = useTranslations("Settings");
  /** ข้อความ chrome ของ popover ตัวกรอง (หัวเรื่อง / ปุ่มล้าง) — namespace แชร์ */
  const tf = useTranslations("Filters");
  const locale = useLocale();
  const { can } = usePermissions();
  const token = useAuthStore((s) => s.token);
  const { notify } = useNotification();

  const [apps, setApps] = useState<App[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [mounted, setMounted] = useState(false);

  /**
   * ตัวกรอง 3 ตัว — **ทั้งหมดฝั่ง client** เพราะหน้านี้โหลดทุกแถวมาครบอยู่แล้ว
   * (`fetchSystemsApps` limit=100 = `MAX_PAGE_SIZE`) จึงไม่ต้องยิง request ใหม่
   *
   * สองตัวหลังเป็น **array (multi-select)** แบบ popover ตัวกรองของบอร์ด —
   * เลือกหลายค่าใน section เดียวกัน = OR, ข้าม section = AND ·  array ว่าง = ไม่กรอง
   */
  const [search, setSearch] = useState("");
  /** ค่าคือ `company_id` (ฟิลด์ `link.id`) */
  const [companyIds, setCompanyIds] = useState<number[]>([]);
  const [expiryFilters, setExpiryFilters] = useState<ExpiryFilterValue[]>([]);
  /** anchor ของ popover ตัวกรอง */
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);

  /**
   * ตัวเลข "ใช้ไป" ต่อแอป (ชม.) — ดึงคู่กับ `loadApps()` ตอนเปิดหน้า ผ่าน
   * `fetchAppUsageAllTime()` จุดเดียวกับที่ `/reports` ใช้ (กติกาหัก MA
   * จะได้ไม่ต่างกันระหว่างสองหน้า)
   *
   * `error` ต้องแยกจาก `ready` เพราะถ้าดึงไม่ได้แล้วปล่อยให้เหลือ 0
   * ตัวเลข "คงเหลือ" จะเท่ากับ MA ทั้งก้อนซึ่ง**ผิด**
   *
   * (`MA_DEDUCTION_PAUSED = false` → ฟังก์ชันนั้นยิง request จริง; ถ้าปิด
   * กลับเป็น `true` จะคืน map ว่างทันที → "คงเหลือ" = MA เต็มก้อน)
   */
  const [usedByApp, setUsedByApp] = useState<Map<number, number>>(new Map());
  const [usageStatus, setUsageStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    setMounted(true);
  }, []);

  const [appDialogOpen, setAppDialogOpen] = useState(false);
  /** แถวกำลังแก้ไข (null = เพิ่มข้อมูลใหม่) — ส่งเข้า `AppFormDialog` ตรง ๆ */
  const [editingRecord, setEditingRecord] = useState<EditingRecord | null>(null);

  /** แถวกำลังลบ — ลบได้เฉพาะรายการนั้น ตัวแอปไม่หาย (อยู่ที่แท็บแอป) */
  const [deleteTarget, setDeleteTarget] = useState<{
    appId: number;
    recordId: number;
    label: string;
  } | null>(null);

  const canUpdate = can("system.update");
  const canDelete = can("system.delete");

  async function loadApps() {
    try {
      const result = await fetchSystemsApps();
      // แอปที่ยังไม่มีข้อมูล**ไม่มีแถว**ในหน้านี้ — ไปเพิ่ม/แก้ชื่อได้ที่แท็บแอป
      setApps(result.data.filter((a) => a.companies.length > 0));
    } catch {
      // รายการเดิมยังอยู่บนจอ — ห้ามเคลียร์ทิ้งเพราะดึงไม่สำเร็จ
    }
  }

  async function loadCompanies() {
    try {
      const result = await fetchCompanies();
      setCompanies(result.data);
    } catch {
      // ฟอร์มจะโชว์ helper "ยังไม่มีบริษัทในระบบ" แทน
    }
  }

  useEffect(() => {
    // หน้า spinner ผูกกับ apps/companies เท่านั้น — ตัวเลข "ใช้ไป" ดึงแยก
    // เพื่อไม่ให้การช้าของ endpoint รายงานมาค้างหน้าทั้งใบ (ถ้าปิดหัก MA
    // กลับเป็น `true` จะไม่มี request ให้รออยู่แล้ว — ข้อความนี้ไม่กระทบ)
    Promise.all([loadApps(), loadCompanies()]).finally(() => setLoading(false));
    void loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /**
   * ดึง "ชั่วโมงที่ใช้ไป" ต่อแอป — `fetchAppUsageAllTime()` (ตัวเดียวกับที่
   * หน้ารายงานใช้, นับเฉพาะงาน type feature/requirement)
   * ล้มเหลวเองได้: คอลัมน์ "คงเหลือ" จะกลายเป็น `—` พร้อมปุ่มลองใหม่
   */
  async function loadUsage() {
    setUsageStatus("loading");
    try {
      setUsedByApp(await fetchAppUsageAllTime());
      setUsageStatus("ready");
    } catch {
      setUsedByApp(new Map());
      setUsageStatus("error");
    }
  }

  /**
   * ปุ่ม "ลองใหม่" ใต้ตาราง — ยิง `loadUsage()` ซ้ำโดยไม่แตะตารางอื่น
   * (ใช้ได้จริงตอนนี้ เพราะ `MA_DEDUCTION_PAUSED = false` มี request ให้พัง)
   */
  function retryUsage() {
    void loadUsage();
  }

  /** ล้างตัวกรองทั้ง 3 แล้วกลับไปหน้าแรก — เรียกจากปุ่ม "ล้างทั้งหมด" ใน popover */
  function resetFilters() {
    setSearch("");
    setCompanyIds([]);
    setExpiryFilters([]);
    setPage(1);
  }

  function openAddApp() {
    setEditingRecord(null);
    setAppDialogOpen(true);
  }

  /** แก้ไข **แถวนั้น** — ส่งทั้งแอป (ให้ dropdown) และรายการ (ให้ prefill) */
  function openEditRecord(row: SystemRow) {
    setEditingRecord(row);
    setAppDialogOpen(true);
  }

  /**
   * เปิดกล่องยืนยันเพื่อ **ลบรายการนั้น** — ไม่ใช่ลบแอป (การลบแอปเป็นหน้าที่
   * แท็บแอปใน `/master-data`) `label` โชว์ "แอป — บริษัท" กันลบผิดแถว
   */
  function handleDeleteRecord(row: SystemRow) {
    setDeleteTarget({
      appId: row.app.id,
      recordId: row.link.recordId,
      label: `${row.app.name} — ${row.link.name}`,
    });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteAppRecord(deleteTarget.appId, deleteTarget.recordId);
      notify(t("dataDeleted"));
      setDeleteTarget(null);
      // แถวสุดท้ายของแอปถูกลบ → แอปนั้นจะหายจากตารางเองหลังดึงใหม่
      await loadApps();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    }
  }

  /**
   * ตาราง = **1 แถวต่อ 1 ช่วงเวลา** ของคู่ แอป×บริษัท — flatten ออกมาก่อน
   * แล้วค่อยกรอง/แบ่งหน้า (ของเดิม render ทุกแถวผ่าน `flatMap` ทำให้
   * pagination ที่มีอยู่ไม่เคยมีผลจริง)
   */
  const rows = useMemo<SystemRow[]>(
    () => apps.flatMap((app) => app.companies.map((link) => ({ app, link }))),
    [apps],
  );

  /**
   * รายชื่อบริษัทที่**มีข้อมูลจริง**ในตาราง (distinct จากแถวที่โหลดมา) — ไม่ยิง
   * API เพิ่ม และกันไม่ให้ section "บริษัท" มีตัวเลือกที่กดแล้วได้ตารางว่าง
   */
  const companyList = useMemo(() => {
    const seen = new Map<number, string>();
    for (const { link } of rows) if (!seen.has(link.id)) seen.set(link.id, link.name);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  /** กรองแบบ AND ทั้ง 3 เงื่อนไข — ค้นหาชื่อแอป**หรือ**ชื่อบริษัท (ไม่สนตัวพิมพ์) */
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(({ app, link }) => {
      const matchesSearch =
        !query ||
        app.name.toLowerCase().includes(query) ||
        link.name.toLowerCase().includes(query);
      if (!matchesSearch) return false;
      if (companyIds.length > 0 && !companyIds.includes(link.id)) return false;
      if (
        expiryFilters.length > 0 &&
        !expiryFilters.some((value) => matchesExpiryFilter(link.expiryStatus, value))
      ) {
        return false;
      }
      return true;
    });
  }, [rows, search, companyIds, expiryFilters]);

  /**
   * แบ่งหน้าแบบ `safePage` — รูปแบบเดียวกับหน้า `/labels` กัน pagination ชี้เกิน
   * หน้าหลังลบแถวสุดท้ายหรือหลังตัวกรองแคบลง
   *
   * `totalPages = 1` เมื่อข้อมูลไม่เกิน `PAGE_SIZE` → แถบ pagination ซ่อนตัวเอง
   * (กติกาอยู่ใน `components/pagination.tsx`: `if (totalPages <= 1) return null`)
   */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /**
   * จำนวน filter ที่เปิดใช้งาน — **ตัวเลขเดียว**ใช้ทั้ง badge บนปุ่ม trigger และ
   * chip ที่หัว popover (ส่งเข้า `selectedCount` ให้สองจุดตรงกันเป๊ะ) · ค้นหา = นับ 1
   * เหมือนที่ `activeFilterCount()` ของ `/reports` ทำ
   */
  const totalSelected =
    companyIds.length + expiryFilters.length + (search.trim() ? 1 : 0);

  function toggleCompany(id: number) {
    setCompanyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setPage(1);
  }

  function toggleExpiry(value: ExpiryFilterValue) {
    setExpiryFilters((prev) =>
      prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value],
    );
    setPage(1);
  }

  /** ตัวเลือกของทั้ง 2 section — สร้างจาก state ปัจจุบัน (`checked` = tick ไว้) */
  const companyFilterOptions: FilterOption[] = companyList.map((company) => ({
    id: company.id,
    label: company.name,
    checked: companyIds.includes(company.id),
    onToggle: () => toggleCompany(company.id),
    start: <BusinessIcon sx={{ fontSize: 16, flexShrink: 0, color: "warning.main" }} />,
  }));

  const expiryFilterOptions: FilterOption[] = EXPIRY_FILTERS.map((value) => ({
    id: value,
    label: t(EXPIRY_FILTER_LABEL[value]),
    checked: expiryFilters.includes(value),
    onToggle: () => toggleExpiry(value),
    start: (
      <ScheduleIcon sx={{ fontSize: 16, flexShrink: 0, color: EXPIRY_FILTER_COLOR[value] }} />
    ),
  }));

  /**
   * section ที่ส่งเข้า popover — เรียง "บริษัท" ก่อน "สถานะอายุ"
   *
   * `initialOpen`: section แรกเปิดค้างไว้เหมือนบอร์ด · แต่ถ้ามี filter ค้างอยู่
   * แล้วให้เปิด**เฉพาะ** section ที่มีการเลือก (กัน panel ยาวฟรี)
   */
  const filterSections: FilterSectionData[] = [
    {
      key: "company",
      title: t("columnCompany"),
      icon: <BusinessIcon sx={{ fontSize: 18 }} />,
      count: companyIds.length,
      options: companyFilterOptions,
      initialOpen: totalSelected > 0 ? companyIds.length > 0 : true,
    },
    {
      key: "expiry",
      title: t("columnExpiryStatus"),
      icon: <ScheduleIcon sx={{ fontSize: 18 }} />,
      count: expiryFilters.length,
      options: expiryFilterOptions,
      initialOpen: totalSelected > 0 ? expiryFilters.length > 0 : false,
    },
  ];

  // render nothing on the server: DashboardLayout reads the auth store, which
  // only the client can fill — matching it later would break hydration
  // (the pattern used by the labels / users / master-data pages).
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

  /**
   * label ของ chip "สถานะอายุ" — กฎทั้งหมดอยู่ที่ `expiryChipLabel()` ใน
   * `lib/app-expiry.ts` (ใช้ร่วมกับ `AppFormDialog`) ที่นี่มีหน้าที่แปลเป็น
   * ข้อความเท่านั้น สีชิปยังเป็นตัวบอกความรุนแรง
   */
  function expiryChipText(status: ExpiryStatus, expiresAt: string | null) {
    const chip = expiryChipLabel(status, daysLeftIso(expiresAt ?? ""));
    return t(chip.key, { n: chip.n ?? 0 });
  }

  /**
   * คอลัมน์ **"คงเหลือ"** = `MA ของแถวนั้น − ใช้ไป`
   *
   * แยก 4 กรณีให้ชัด เพราะข้อความต้องไม่ปนกัน:
   * - ยังดึง "ใช้ไป" ไม่สำเร็จ → spinner ระหว่างโหลด / `—` ตอนผิดพลาด
   *   (**ไม่ใช่** "ยังไม่กรอก" เพราะ MA อาจกรอกไปแล้ว)
   * - ยังไม่กรอก MA → "ยังไม่กรอก" (key เดิม)
   * - อย่างอื่น → ตัวเลขปัด 1 ตำแหน่ง
   *
   * (`MA_DEDUCTION_PAUSED = false` → "ใช้ไป" มาจริง; ถ้าปิดกลับเป็น `true`
   * จะเหลือ MA เต็มก้อน — สองกรณีแรกยังแยกไว้เผื่อปิดหักกลับ)
   *
   * "ใช้ไป" เป็น**ระดับแอป** (`issues` ไม่มี `company_id` — งานระบุบริษัทไม่ได้)
   * ทุกแถวของแอปเดียวกันจึงหักค่าเดียวกัน และนับเฉพาะ type
   * `feature`/`requirement` (bug/NULL ไม่หัก — ดูกติกาใน `reports-api.ts`)
   */
  function remainingCell(row: SystemRow) {
    const caption = (text: string) => (
      <Typography variant="caption" color="text.disabled">
        {text}
      </Typography>
    );

    if (usageStatus === "loading") return <CircularProgress size={16} />;
    if (usageStatus === "error") return caption("—");

    const ma = row.link.maHours;
    if (ma == null) return caption(t("notSetYet"));
    return round1(ma - (usedByApp.get(row.app.id) ?? 0));
  }

  return (
    <RequirePermission permission="system.view">
      <DashboardLayout>
        <Box>
          {/* ค้นหา (ซ้าย) + ปุ่มเปิด popover ตัวกรอง / ปุ่มเพิ่มข้อมูล (ขวา) */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1.5,
              mb: 2,
              flexWrap: "wrap",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <TextField
                size="small"
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                sx={{ minWidth: 240 }}
                inputProps={{ "aria-label": t("searchPlaceholder") }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              {/* ปุ่ม trigger แบบเดียวกับบอร์ด — ปกติโปร่งใส เติมสีเมื่อมี filter ค้าง */}
              <Tooltip title={tf("title")}>
                <Badge
                  badgeContent={totalSelected}
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
                      color: totalSelected > 0 ? "primary.contrastText" : "text.secondary",
                      bgcolor: totalSelected > 0 ? "primary.main" : "transparent",
                      "&:hover": {
                        bgcolor: totalSelected > 0 ? "primary.dark" : "action.hover",
                      },
                    }}
                  >
                    <FilterListIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Badge>
              </Tooltip>
            </Box>

            {can("system.create") && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openAddApp}>
                {t("addData")}
              </Button>
            )}
          </Box>

          {/* popover ตัวกรอง — chrome แชร์กับบอร์ดและ /reports (components/filter-panel.tsx) */}
          <FilterPanel
            open={Boolean(filterAnchor)}
            anchorEl={filterAnchor}
            onClose={() => setFilterAnchor(null)}
            sections={filterSections}
            onClearAll={resetFilters}
            selectedCount={totalSelected}
          />

          <DataTable>
            <DataTableHead>
              <DataTableRow>
                <DataTableCell>{t("columnName")}</DataTableCell>
                <DataTableCell>{t("columnCompany")}</DataTableCell>
                <DataTableCell>{t("columnStartedAt")}</DataTableCell>
                <DataTableCell>{t("columnExpiresAt")}</DataTableCell>
                <DataTableCell align="center">{t("columnMaHours")}</DataTableCell>
                <DataTableCell align="center">{t("columnRemaining")}</DataTableCell>
                <DataTableCell align="center">{t("columnExpiryStatus")}</DataTableCell>
                <DataTableCell align="right">{t("columnActions")}</DataTableCell>
              </DataTableRow>
            </DataTableHead>
            <DataTableBody>
              {/* 1 แถวต่อ 1 รายการ — แอปที่มี 2 ช่วงเวลา (หรือ 2 บริษัท) จึงมี 2 แถว
                  รายการใหม่ถูกต่อ**ใต้** รายการเดิม (API เรียง `recordId ASC`)
                  โชว์เฉพาะ `pageRows` = หน้าปัจจุบันหลังกรองแล้ว (ไม่ใช่ทุกแถว) */}
              {pageRows.map(({ app, link }) => {
                const row: SystemRow = { app, link };
                const empty = (text: string) => (
                  <Typography variant="caption" color="text.disabled">
                    {text}
                  </Typography>
                );
                return (
                  <DataTableRow key={link.recordId}>
                    <DataTableCell>{app.name}</DataTableCell>
                    {/* คอลัมน์บริษัท = ชื่อเดียว (แถว = 1 คู่ 1 ช่วงเวลา) */}
                    <DataTableCell>
                      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                        {link.name}
                      </Typography>
                    </DataTableCell>
                    <DataTableCell>
                      {link.startedAt ? formatDay(link.startedAt, locale) : empty(t("notSetYet"))}
                    </DataTableCell>
                    <DataTableCell>
                      {link.expiresAt ? formatDay(link.expiresAt, locale) : empty(t("expiryNone"))}
                    </DataTableCell>
                    {/* ชั่วโมง MA ของช่วงนี้ — ตัวเลขล้วน หัวตารางมีหน่วย "ชม." อยู่แล้ว */}
                    <DataTableCell align="center">
                      {link.maHours != null ? link.maHours : empty(t("notSetYet"))}
                    </DataTableCell>
                    {/* คงเหลือ = MA ของแถวนั้น − ใช้ไป — กฎทั้งหมดอยู่ที่ `remainingCell()` */}
                    <DataTableCell align="center">{remainingCell(row)}</DataTableCell>
                    {/* สถานะอายุของ **แถวนั้น** (เก็บไว้รายช่วงเวลา) */}
                    <DataTableCell align="center">
                      <Chip
                        label={expiryChipText(link.expiryStatus, link.expiresAt)}
                        color={expiryColor(link.expiryStatus)}
                        size="small"
                        variant="outlined"
                      />
                    </DataTableCell>
                    <DataTableCell align="right">
                      {/* ปุ่มแก้/ลบ = **ของแถวนั้น** — ไม่ส่ง `onToggle` → ไม่มีสวิตช์ (เปิด/ปิดแอปที่แท็บแอปใน /master-data) */}
                      <AppActions
                        app={app}
                        canUpdate={canUpdate}
                        canDelete={canDelete}
                        onEdit={() => openEditRecord(row)}
                        onDelete={() => handleDeleteRecord(row)}
                      />
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
              {/* ว่าง 2 กรณี — ไม่มีข้อมูลเลย vs กรอง/ค้นจนไม่เหลือ (คนละข้อความ) */}
              {pageRows.length === 0 && (
                <DataTableRow>
                  <DataTableCell colSpan={8}>
                    <Typography variant="caption" color="text.disabled">
                      {apps.length === 0 ? t("noRows") : t("noMatch")}
                    </Typography>
                  </DataTableCell>
                </DataTableRow>
              )}
            </DataTableBody>
          </DataTable>

          {/* ดึง "ใช้ไป" ไม่สำเร็จ → บอกใต้ตาราง (ไม่ใช่ Alert ไม่บังตาราง) */}
          {usageStatus === "error" && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}>
              <Typography variant="caption" color="text.disabled">
                {t("usageError")}
              </Typography>
              <Button
                size="small"
                onClick={retryUsage}
                sx={{ textTransform: "none", fontSize: "0.75rem", minHeight: 24, py: 0 }}
              >
                {t("retry")}
              </Button>
            </Box>
          )}

          {/* ข้อมูลไม่เกิน 1 หน้า (≤ 10 แถวหลังกรอง) → component คืน `null` เอง
              จึงไม่มีแถบ pagination ให้เห็น — แบบเดียวกับหน้า /labels */}
          <Pagination
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        </Box>

        <AppFormDialog
          open={appDialogOpen}
          record={editingRecord}
          companies={companies}
          onClose={() => setAppDialogOpen(false)}
          onSaved={loadApps}
        />

        {/* ยืนยันการ **ลบรายการ** — ไม่ต้องเช็ก "งานค้าง" แล้ว เพราะไม่ได้ลบแอป */}
        <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs">
          <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          <DialogContent>
            {deleteTarget && (
              <Typography variant="body2">
                {t("deleteConfirmMessage", { type: t("data"), name: deleteTarget.label })}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteTarget(null)}>{t("cancel")}</Button>
            <Button variant="contained" color="error" onClick={confirmDelete}>
              {t("delete")}
            </Button>
          </DialogActions>
        </Dialog>
      </DashboardLayout>
    </RequirePermission>
  );
}
