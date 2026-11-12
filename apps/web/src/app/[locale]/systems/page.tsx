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
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import BusinessIcon from "@mui/icons-material/Business";
import FilterListIcon from "@mui/icons-material/FilterList";
import HistoryIcon from "@mui/icons-material/History";
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
import RenewFormDialog, { type RenewingRecord } from "@/components/renew-form-dialog";
import BuyHoursDialog, { type BuyingRecord } from "@/components/buy-hours-dialog";
import SystemDetailDialog from "@/components/system-detail-dialog";
import {
  deleteAppPeriod,
  deleteAppRecord,
  fetchCompanies,
  fetchSystemsApps,
  fetchUsageCounts,
  type App,
  type AppCompanyLink,
  type Company,
  type UsageCount,
} from "@/lib/apps-api";
import {
  daysLeftIso,
  expiryChipLabel,
  expiryColor,
  formatDay,
  type ExpiryLabelKey,
  type ExpiryStatus,
} from "@/lib/app-expiry";
import { MA_DEDUCTION_PAUSED, pairKey, periodUsedOf } from "@/lib/reports-api";

/**
 * 1 แถวในตาราง = **1 คู่ แอป×บริษัท** — โชว์เฉพาะ **ช่วงเวลาล่าสุด** ของคู่นั้น
 * (ช่วงเก่าๆ ไปอยู่ในป๊อปอัพ "ประวัติการต่ออายุ" ซึ่งอ่านจาก `app.companies`
 * ของแถวเดียวกัน ไม่ต้องยิง API เพิ่ม) · แอปที่ยังไม่มีรายการเลย**ไม่มีแถว**
 * (ไปจัดการชื่อได้ที่แท็บแอปใน `/master-data`)
 */
interface SystemRow {
  app: App;
  link: AppCompanyLink;
}

/** ปัดเศษ 1 ตำแหน่ง — เหมือน `round1` ของ reports (วินาที → ชม. อาจมีเศษทศนิยม) */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * `recordId` ของ**ช่วงล่าสุดของทุกคู่** — รายการที่ต้องถาม "ใช้ไป" รายรอบ
 * (`GET /apps/usage-counts`) เพราะตารางโชว์เฉพาะช่วงล่าสุดอยู่แล้ว · กฎเดียวกับ
 * `rows` memo ด้านล่าง (คู่ = `pairKey(appId, companyId)`, ช่วงใหม่ = `recordId` มากสุด)
 */
function latestRecordIds(list: App[]): number[] {
  const latest = new Map<string, number>();
  for (const app of list) {
    for (const link of app.companies) {
      const key = pairKey(app.id, link.id);
      const prev = latest.get(key);
      if (prev === undefined || link.recordId > prev) latest.set(key, link.recordId);
    }
  }
  return [...latest.values()];
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
   * ตัวเลข "ใช้ไป" **รายรอบ** (ชม.) คีย์ด้วย `recordId` — ดึงผ่าน
   * `GET /apps/usage-counts` (`periodUsedHours`) ทันทีที่ `loadApps()` ได้แถวมา
   * (ต้องรู้ `recordId` ของช่วงล่าสุดก่อนจึงยิงได้)
   *
   * **รายรอบ ไม่ใช่ระดับคู่** (ข้อสรุปจากผู้ใช้: "ยังไม่ได้ใช้เลยทำไมมีใช้ไป") —
   * แถวที่เพิ่งซื้อชั่วโม์จะใช้ไป = 0 → คงเหลือ = เต็มจำนวนที่ซื้อ · คีย์ด้วย
   * `recordId` เพราะแถวบนตารางคือ **ช่วงล่าสุดของคู่** ต้องอ่านค่าของช่วงนั้น
   *
   * `error` ต้องแยกจาก `ready` เพราะถ้าดึงไม่ได้แล้วปล่อยให้เหลือ 0
   * ตัวเลข "คงเหลือ" จะเท่ากับ MA ทั้งก้อนซึ่ง**ผิด** → โชว์ `—`
   *
   * (`MA_DEDUCTION_PAUSED` ยังปิดหักได้ที่จุดเดียว — `periodUsedOf()` คืน 0 ให้เอง)
   */
  const [usedByRecord, setUsedByRecord] = useState<Map<number, UsageCount>>(new Map());
  const [usageStatus, setUsageStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    setMounted(true);
  }, []);

  const [appDialogOpen, setAppDialogOpen] = useState(false);
  /** แถวกำลังแก้ไข (null = เพิ่มข้อมูลใหม่) — ส่งเข้า `AppFormDialog` ตรง ๆ */
  const [editingRecord, setEditingRecord] = useState<EditingRecord | null>(null);

  /**
   * แถวกำลังลบ — **ลบทั้งคู่** (ทุกช่วง/ทุกการซื้อของ แอป×บริษัท) ไม่ใช่แค่
   * แถวล่าสุด · ตัวแอปไม่หาย (อยู่ที่แท็บแอปใน `/master-data`) · `count` =
   * จำนวนแถวของคู่นั้น ใช้ในข้อความยืนยัน ("พร้อมประวัติทั้งหมด {n} รายการ")
   */
  const [deleteTarget, setDeleteTarget] = useState<{
    appId: number;
    recordId: number;
    label: string;
    count: number;
  } | null>(null);

  /**
   * ช่วงที่กำลัง**ย้อนกลับ** (null = ปิดกล่อง) — ต่างจาก `deleteTarget` ตรงที่
   * ลบ**แถวนั้นแถบเดียว** (ช่วงใหม่สุดของคู่) ไม่ใช่ทั้งคู่ · `n` = ลำดับ "รายการ
   * ที่ N" ของแถวนั้น เอาไว้โชว์ในข้อความยืนยันให้รู้ว่ากำลังย้อนรายการไหน
   */
  const [undoTarget, setUndoTarget] = useState<{
    appId: number;
    recordId: number;
    label: string;
    n: number;
  } | null>(null);

  /** แถวกำลัง**ต่ออายุ** (null = ปิดฟอร์ม) — ปุ่มขึ้นเฉพาะช่วงที่หมดอายุแล้ว (ดู `canRenew()`) */
  const [renewingRecord, setRenewingRecord] = useState<RenewingRecord | null>(null);
  /**
   * แถวกำลัง**ซื้อชั่วโมง** (null = ปิดฟอร์ม) — ปุ่มขึ้นเฉพาะแถวที่คงเหลือ ≤ 0
   * (ดู `canBuyHours()`) · ต่างจากต่ออายุตรงที่กรอกมาแค่จำนวนชม. วันที่คงเดิม
   */
  const [buyingRecord, setBuyingRecord] = useState<BuyingRecord | null>(null);
  /**
   * แถวที่เปิดป๊อปอัพรายละเอียดอยู่ — เก็บเป็น **key (appId + companyId)**
   * ไม่ใช่ snapshot ของแถว: หลังต่ออายุ/แก้ไข `loadApps()` ดึง `apps` ใหม่ ถ้า
   * เก็บ snapshot อยู่ ป๊อปอัพจะค้างข้อมูลเก่า (ไม่เห็นช่วงใหม่ในประวัติ)
   * จึง derive ออกจาก `apps` ทุกครั้งที่โหลด — ดู `detailRow` ด้านล่าง
   */
  const [detailKey, setDetailKey] = useState<{ appId: number; companyId: number } | null>(null);

  const canUpdate = can("system.update");
  const canDelete = can("system.delete");

  async function loadApps() {
    try {
      const result = await fetchSystemsApps();
      // แอปที่ยังไม่มีข้อมูล**ไม่มีแถว**ในหน้านี้ — ไปเพิ่ม/แก้ชื่อได้ที่แท็บแอป
      const list = result.data.filter((a) => a.companies.length > 0);
      setApps(list);
      // "ใช้ไป" รายรอบต้องรู้ `recordId` ของช่วงล่าสุดก่อน → ยิงตามหลังทันที
      // (ปุ่มลองใหม่/หลังต่ออายุ-ซื้อ-ลบ ก็มาจากตรงนี้ เพราะทุกทางเรียก `loadApps`)
      void loadUsage(latestRecordIds(list));
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
    // หน้า spinner ผูกกับ apps/companies เท่านั้น — ตัวเลข "ใช้ไป" ดึงตามหลัง
    // (`loadApps()` ยิง `loadUsage()` เองทันทีที่รู้ `recordId` ของช่วงล่าสุด)
    Promise.all([loadApps(), loadCompanies()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /**
   * ดึง "ชั่วโมงที่ใช้ไป" **รายรอบ** ของช่วงล่าสุดทุกคู่ — `GET /apps/usage-counts`
   * (`periodUsedHours`) ยิงครั้งเดียวต่อการโหลด ไม่ใช่ต่อแถว · ล้มเหลวเองได้:
   * คอลัมน์ "คงเหลือ" จะกลายเป็น `—` พร้อมปุ่มลองใหม่
   */
  async function loadUsage(recordIds: number[]) {
    setUsageStatus("loading");
    if (MA_DEDUCTION_PAUSED) {
      // ปิดหัก → ไม่ยิง request เปล่า ๆ (`periodUsedOf()` คืน 0 ให้เอง)
      setUsedByRecord(new Map());
      setUsageStatus("ready");
      return;
    }
    try {
      const list = await fetchUsageCounts(recordIds);
      setUsedByRecord(new Map(list.map((item) => [item.recordId, item])));
      setUsageStatus("ready");
    } catch {
      setUsedByRecord(new Map());
      setUsageStatus("error");
    }
  }

  /**
   * ปุ่ม "ลองใหม่" ใต้ตาราง — ยิง `loadUsage()` ซ้ำโดยไม่แตะตารางอื่น
   * (ใช้ได้จริงตอนนี้ เพราะ `MA_DEDUCTION_PAUSED = false` มี request ให้พัง)
   */
  function retryUsage() {
    void loadUsage(latestRecordIds(apps));
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
   * เปิดฟอร์ม**ต่ออายุ**ของแถวนั้น — ฟอร์มล็อกคู่ แอป×บริษัท ไว้แล้ว
   * (เหลือแค่วันที่ 2 + จำนวน MA) ไม่มีช่องหมายเหตุ
   */
  function openRenewRecord(row: SystemRow) {
    setRenewingRecord({ app: row.app, link: row.link });
  }

  /** เปิดฟอร์ม**ซื้อชั่วโมง**ของแถวนั้น — ล็อกคู่ แอป×บริษัท ไว้แล้วเหมือนต่ออายุ */
  function openBuyRecord(row: SystemRow) {
    setBuyingRecord({ app: row.app, link: row.link });
  }

  /**
   * เปิดป๊อปอัพรายละเอียดของแถวที่กด — เก็บ key ไว้แล้วค่อยหาแถวจริงจาก
   * `apps` (derive) เพื่อให้ข้อมูลในป๊อปอัพตามหลัง `loadApps()` เสมอ
   */
  function openDetailRecord(row: SystemRow) {
    setDetailKey({ appId: row.app.id, companyId: row.link.id });
  }

  /**
   * ปุ่ม "ต่ออายุ" โชว์**เฉพาะช่วงที่หมดอายุแล้ว** — แถวยังไม่หมดอายุ
   * (ปกติ/ใกล้หมดอายุ ≤30 วัน) ไม่ขึ้นปุ่มเลย (ข้อสรุปจากผู้ใช้: "ถ้ามันยังไม่
   * หมดอายุ จะขึ้นทำไม") · สองเงื่อนไขนี้ต้อง OR กัน: `expired` = สถานะที่
   * เซิร์ฟเวอร์เก็บ (วันที่ผ่านไปแล้ว) และ `daysLeft <= 0` = ตรงกับ**ชิป**ที่ขึ้น
   * "หมดอายุแล้ว" ตั้งแต่วันหมดอายุพอดี — ไม่งั้นจะมีวันที่ชิปบอกหมดอายุ
   * แต่ปุ่มยังไม่โผล่ · บวกต้องมีสิทธิ์แก้ข้อมูลระบบด้วย
   */
  function canRenew(row: SystemRow): boolean {
    if (!canUpdate) return false;
    const daysLeft = daysLeftIso(row.link.expiresAt ?? "");
    return row.link.expiryStatus === "expired" || (daysLeft !== null && daysLeft <= 0);
  }

  /**
   * ปุ่ม "ซื้อชั่วโมง" โชว์**เฉพาะแถวที่คงเหลือ ≤ 0** (MA ใช้หมดพอดี/เกิน) —
   * ยังไม่หมดไม่ต้องซื้อ · เงื่อนไข fail-open ทุกข้อเหมือนคอลัมน์ "คงเหลือ":
   *
   * - **แถว "หมดอายุแล้ว" ไม่ซื้อ** — สัญญาจบแล้ว ต้อง "ต่ออายุ" แทน
   *   (ปุ่มต่ออายุขึ้นอยู่แล้วตาม `canRenew()`); การซื้อชม. บนสัญญาที่หมด
   *   โดยไม่ต่ออายุ = ชั่วโมงลอยอยู่ในช่วงที่ปิดไปแล้ว
   * - ยังดึง "ใช้ไป" ไม่สำเร็จ (`usageStatus !== "ready"`) → **ห้ามตัดสิน**ว่าหมด
   *   (ถ้าปล่อยผ่าน ปุ่มจะโผล่ทุกแถวตอนข้อมูลโหลดไม่ทัน)
   * - ยังไม่เคยกรอก `maHours` (`null`) → ไม่มีเพดาน = ไม่ถือว่าหมด
   * - ต้องมี `system.update` (เหมือนปุ่มต่ออายุ)
   *
   * ซื้อแล้ว `maHours` มากขึ้น → คงเหลือ > 0 → ปุ่มหายเองในโหลดถัดไป
   */
  function canBuyHours(row: SystemRow): boolean {
    if (!canUpdate || usageStatus !== "ready") return false;
    if (row.link.expiryStatus === "expired") return false;
    const ma = row.link.maHours;
    if (ma == null) return false;
    // **ใช้ไปรายรอบของแถวนั้น** — แถวที่เพิ่งซื้อ (ยังไม่ได้ใช้) = 0 → คงเหลือเต็ม
    // จำนวนที่ซื้อ → ปุ่มหายเองหลังซื้อ · entry หาย = ไม่รู้ → ถือว่าไม่หมด (fail-open)
    const used = periodUsedOf(usedByRecord, row.link.recordId) ?? 0;
    return ma - used <= 0;
  }

  /**
   * เปิดกล่องยืนยันเพื่อ **ลบทั้งคู่** (ทุกช่วงของ แอป×บริษัท — `count` = จำนวน
   * แถวนั้น) — ไม่ใช่ลบแอป (การลบแอปเป็นหน้าที่แท็บแอปใน `/master-data`)
   * `label` โชว์ "แอป — บริษัท" กันลบผิดแถว
   */
  function handleDeleteRecord(row: SystemRow) {
    setDeleteTarget({
      appId: row.app.id,
      recordId: row.link.recordId,
      label: `${row.app.name} — ${row.link.name}`,
      count: row.app.companies.filter((c) => c.id === row.link.id).length,
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
   * เปิดกล่องยืนยันเพื่อ **ยกเลิกรายการนั้น** — ปุ่ม "ยกเลิกรายการ" ในแท็บ
   * "ประวัติการต่ออายุ" ส่ง `recordId` ของแถวนั้นมา (ปุ่มขึ้นเฉพาะแถวล่าสุด
   * อยู่แล้ว ดูใน `SystemDetailDialog`) · `n` = ลำดับ "รายการที่ N" ของแถวนั้น
   * (แถวล่าสุด = จำนวนแถวของคู่) เอาไว้โชว์ในข้อความให้รู้ว่ารายการไหน
   *
   * ต่างจากถังขยะ (`handleDeleteRecord`) ที่ลบทั้งคู่ — อันนี้ลบแถวนั้นแถบเดียว
   */
  function handleUndoRecord(recordId: number) {
    if (!detailRow) return;
    const pairRows = detailRow.app.companies.filter((c) => c.id === detailRow.link.id);
    setUndoTarget({
      appId: detailRow.app.id,
      recordId,
      label: `${detailRow.app.name} — ${detailRow.link.name}`,
      n: pairRows.length,
    });
  }

  async function confirmUndo() {
    if (!undoTarget) return;
    try {
      await deleteAppPeriod(undoTarget.appId, undoTarget.recordId);
      notify(t("undoSuccess"));
      setUndoTarget(null);
      // ตาราง + "ใช้ไป"รายรอบ + ป๊อปอัพ detail derive จาก `apps` ทั้งหมด →
      // ดึงใหม่แล้วช่วงก่อนหน้ากลับเป็น latest เอง (คอลัมน์/ชิป/ปุ่มตาม)
      await loadApps();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    }
  }

  /**
   * ตาราง = **1 แถวต่อ 1 คู่ แอป×บริษัท** — flatten ออกมาก่อน (1 คู่มีได้หลาย
   * ช่วงเวลาหลัง migration 1812) แล้ว**เก็บเฉพาะช่วงล่าสุด** (`recordId` ใหญ่
   * สุด = เพิ่มทีหลังสุด) ช่วงเก่าทั้งหมดยังอยู่ใน `app.companies` ให้ป๊อปอัพ
   * รายละเอียดหยิบไปเป็น "ประวัติการต่ออายุ" โดยไม่ต้องดึงใหม่
   *
   * คีย์ด้วย `pairKey(appId, companyId)` — ตรงกับคีย์ของ map "ใช้ไป" ที่ใช้
   * คำนวณคอลัมน์ "คงเหลือ" (คนละคีย์ = หักผิดคู่)
   *
   * แล้วค่อยกรอง/แบ่งหน้า (ของเดิม render ทุกแถวผ่าน `flatMap` ทำให้
   * pagination ที่มีอยู่ไม่เคยมีผลจริง)
   */
  const rows = useMemo<SystemRow[]>(() => {
    const latest = new Map<string, SystemRow>();
    for (const app of apps) {
      for (const link of app.companies) {
        const key = pairKey(app.id, link.id);
        const existing = latest.get(key);
        // `>` ล้วน — แถวแรกที่เจอของคู่นั้นยังอยู่ แล้วค่อยแทนที่ด้วยช่วงใหม่กว่า
        if (!existing || link.recordId > existing.link.recordId) {
          latest.set(key, { app, link });
        }
      }
    }
    return [...latest.values()];
  }, [apps]);

  /**
   * **แถวจริงของป๊อปอัพรายละเอียด** — หาจาก key (`appId` + `companyId`) ใน
   * `apps` ชุดปัจจุบัน ไม่ใช่ snapshot ที่กดไว้: หลังต่ออายุ `loadApps()` ดึง
   * ข้อมูลใหม่ → ป๊อปอัพเห็น**ช่วงใหม่ในประวัติ**ทันที · คู่ถูกลบไปแล้ว (แถว
   * เดียวหาย) → คืน `null` → ป๊อปอัพปิดเอง ไม่ค้างข้อมูลที่ไม่มีจริง
   *
   * ต้องเลือก**ช่วงล่าสุด** = `recordId` มากสุด (กฎเดียวกับ `rows` ด้านบน) —
   * **ห้ามใช้ `.find()`**: API คืน `app_companies` เรียง `id ASC` (เก่าสุดก่อน)
   * การ์ดแรกที่เจอจึงเป็น "รอบที่ 1" ทำให้แท็บข้อมูลทั่วไป/ชิปหัวการ์ด/ปุ่ม
   * ต่ออายุของป๊อปอัพ**ค้างอยู่กับช่วงที่หมดอายุไปแล้ว** ทั้งที่คู่นั้นมีช่วง
   * ใหม่ที่ยังปกติอยู่ (และปุ่มต่ออายุจะ prefill วันที่จากช่วงเก่าที่ผ่านมาแล้ว)
   */
  const detailRow = useMemo<SystemRow | null>(() => {
    if (!detailKey) return null;
    const app = apps.find((a) => a.id === detailKey.appId);
    if (!app) return null;
    const link = app.companies
      .filter((c) => c.id === detailKey.companyId)
      .reduce<AppCompanyLink | undefined>(
        (best, c) => (best === undefined || c.recordId > best.recordId ? c : best),
        undefined,
      );
    return link ? { app, link } : null;
  }, [apps, detailKey]);

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
   * คอลัมน์ **"คงเหลือ"** = `MA ของแถวนั้น − ใช้ไป**ของรอบนั้น**`
   *
   * แยก 4 กรณีให้ชัด เพราะข้อความต้องไม่ปนกัน:
   * - ยังดึง "ใช้ไป" ไม่สำเร็จ → spinner ระหว่างโหลด / `—` ตอนผิดพลาด
   *   (**ไม่ใช่** "ยังไม่กรอก" เพราะ MA อาจกรอกไปแล้ว)
   * - ยังไม่กรอก MA → "ยังไม่กรอก" (key เดิม)
   * - อย่างอื่น → ตัวเลขปัด 1 ตำแหน่ง
   *
   * (`MA_DEDUCTION_PAUSED = false` → "ใช้ไป" มาจริง; ถ้าปิดกลับเป็น `true`
   * จะเหลือ MA เต็มก้อน — สองกรณีแรกยังแยกไว้เผื่อปิดหักกลับ)
   * ("ใช้ไป" นับเฉพาะ type `ma` — bug/requirement/NULL ไม่หัก)
   *
   * **รายรอบ ไม่ใช่ระดับคู่** (ข้อสรุปจากผู้ใช้: "ยังไม่ได้ใช้เลยทำไมมีใช้ไป") —
   * อ่านจาก `periodUsedOf(usedByRecord, recordId)` ซึ่งผูกงานเข้ารอบด้วย
   * `pickPeriodId()`: งานที่กรอก*ก่อน*รอบนั้นจะถูกสร้าง = ของรอบก่อนหน้า →
   * แถวที่เพิ่งซื้อชั่วโม์ (ยังไม่ได้ใช้) ใช้ไป 0 · ยังไม่มี entry (ดึงไม่ได้ /
   * ไม่รู้จักแถวนั้น) → `null` → โชว์ `—` **ห้ามเดา 0**
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
    const used = periodUsedOf(usedByRecord, row.link.recordId);
    if (used === null) return caption("—");
    return round1(ma - used);
  }

  /**
   * "ใช้ไป" รายรอบที่ **ฟอร์มต่ออายุ/ฟอร์มซื้อชั่วโม์** ต้องใช้ — `used` ของ
   * **แถวนั้น** (แถวต้นทางของฟอร์ม) ไม่ใช่ยอดรวมคู่ · entry หาย (ดึงไม่ได้ /
   * ไม่รู้จักแถวนั้น) → ส่ง `status: "error"` ให้ฟอร์ม**ไม่ทบชั่วโม์มั่ว** แล้ว
   * บอกเหตุผลใต้ช่อง MA เอง (ฟอร์มต่ออายุ disable ตอน `loading` เหมือนเดิม)
   */
  const formUsage = (recordId: number | undefined) => {
    const used = recordId == null ? null : periodUsedOf(usedByRecord, recordId);
    return {
      used: used ?? undefined,
      status: usageStatus === "ready" && used === null ? ("error" as const) : usageStatus,
    };
  };
  const renewUsage = formUsage(renewingRecord?.link.recordId);
  const buyUsage = formUsage(buyingRecord?.link.recordId);

  return (
    <RequirePermission permission="system.view">
      <DashboardLayout>
        <Box>
          {/* แถว toolbar รูปแบบเดียวกับหน้าบอร์ด: ช่องค้นหาชิดซ้าย (กว้างสุด 480) —
              ปุ่มตัวกรอง + ปุ่มเพิ่มข้อมูล ชิดขวา (ml: auto) */}
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
            {/* ช่องค้นหาอยู่ซ้ายสุดและกว้างสุด — เท่ากับ toolbar ของหน้าบอร์ด */}
            <TextField
              size="small"
              placeholder={t("searchPlaceholder")}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              sx={{ flexGrow: 1, maxWidth: 480, minWidth: 200 }}
              inputProps={{
                "aria-label": t("searchPlaceholder"),
                // กัน password manager เทอีเมลลงช่องค้นหา (เหมือนหน้าบอร์ด)
                autoComplete: "off",
                name: "systems-search",
              }}
              InputProps={{
                startAdornment: (
                  <SearchIcon sx={{ fontSize: 18, color: "text.secondary", mr: 1 }} />
                ),
              }}
            />

            {/* ปุ่มฝั่งขวาชิดขวา (ml: auto) — ตัวกรองอยู่ขวาเหมือนหน้าบอร์ด */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: "auto" }}>
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

              {can("system.create") && (
                <Button variant="contained" startIcon={<AddIcon />} onClick={openAddApp}>
                  {t("addData")}
                </Button>
              )}
            </Box>
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
              {/* 1 แถวต่อ 1 คู่ — โชว์เฉพาะ**ช่วงล่าสุด** ของคู่นั้น (ช่วงก่อนหน้า
                  อยู่ในป๊อปอัพประวัติ) โชว์เฉพาะ `pageRows` = หน้าปัจจุบันหลัง
                  กรองแล้ว (ไม่ใช่ทุกแถว) */}
              {pageRows.map((row) => {
                const { app, link } = row;
                const empty = (text: string) => (
                  <Typography variant="caption" color="text.disabled">
                    {text}
                  </Typography>
                );
                return (
                  <DataTableRow key={link.recordId}>
                    <DataTableCell>{app.name}</DataTableCell>
                    {/* คอลัมน์บริษัท = ชื่อเดียว (แถว = 1 คู่ ช่วงล่าสุด) */}
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
                      {/* ปุ่มซื้อชั่วโมง — **เฉพาะแถวคงเหลือ ≤ 0** + `system.update`
                          (ดู `canBuyHours()`) · ซื้อแล้วคงเหลือ > 0 ปุ่มหายเอง */}
                      {canBuyHours(row) && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="primary"
                          onClick={() => openBuyRecord(row)}
                          sx={{ mr: 1, textTransform: "none", whiteSpace: "nowrap" }}
                        >
                          {t("buyHours")}
                        </Button>
                      )}
                      {/* ปุ่มต่ออายุ — **เฉพาะช่วงที่หมดอายุแล้ว** และต้องมี
                          `system.update` (ดู `canRenew()`) · ปุ่ม 🕐 = เปิดป๊อปอัพ
                          รายละเอียด (ข้อมูลทั่วไป + ประวัติการต่ออายุ) */}
                      {canRenew(row) && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="warning"
                          onClick={() => openRenewRecord(row)}
                          sx={{ mr: 1, textTransform: "none", whiteSpace: "nowrap" }}
                        >
                          {t("renew")}
                        </Button>
                      )}
                      <Tooltip title={t("viewDetail")}>
                        <IconButton
                          size="small"
                          onClick={() => openDetailRecord(row)}
                          aria-label={t("viewDetail")}
                        >
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {/* ปุ่มแก้/ลบ = **ของช่วงล่าสุด** (แถวที่โชว์อยู่) — ไม่ส่ง `onToggle` → ไม่มีสวิตช์ (เปิด/ปิดแอปที่แท็บแอปใน /master-data) */}
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

        {/* ป๊อปอัพรายละเอียด — การ์ดใบเดียวครอบทั้ง 2 แท็บ (หัว + เนื้อหา + ปุ่มต่ออายุ)
            ข้อมูล derive จาก `apps` จึงอัปเดตเองหลังต่ออายุ/แก้ไข
            **mount อยู่หน้า AppFormDialog แต่หลัง RenewFormDialog** — ดูที่ข้อความ
            ใต้ `RenewFormDialog` เรื่อง z-index */}
        <SystemDetailDialog
          open={Boolean(detailRow)}
          record={detailRow}
          canRenew={detailRow ? canRenew(detailRow) : false}
          onRenew={() => {
            // **ไม่ปิด** ป๊อปอัพรายละเอียด — เปิดฟอร์มต่ออายุทับไว้ พอบันทึกเสร็จ
            // `loadApps()` จะดึงช่วงใหม่เข้ามาแล้วป๊อปอัพนี้แสดงประวัติทันที
            if (detailRow) {
              setRenewingRecord({ app: detailRow.app, link: detailRow.link });
            }
          }}
          canUndo={canUpdate || canDelete}
          onUndo={handleUndoRecord}
          onClose={() => setDetailKey(null)}
        />

        {/* ฟอร์มต่ออายุ — คู่แอป×บริษัทล็อกจากแถวที่กด บันทึกแล้ว append ช่วงใหม่
            **mount ท้ายสุด = อยู่บนสุด** — MUI Dialog ทุกตัวมี zIndex เท่ากัน
            (1300) ตัวที่ mount ทีหลังจะถูกวาดทับ ถ้าสลับลำดับ ฟอร์มต่ออายุจะถูก
            ป๊อปอัพรายละเอียดทับจนกดไม่ได้ · `used`/`usageStatus` = "ใช้ไป"
            **รายรอบของแถวนั้น** (`periodUsedOf`) ให้ฟอร์มโชว์/ทบชั่วโมงที่เหลือ
            ตรงกับคอลัมน์ "คงเหลือ" (และรอโหลดเสร็จก่อนเปิดปุ่มบันทึก) */}
        <RenewFormDialog
          open={Boolean(renewingRecord)}
          record={renewingRecord}
          used={renewUsage.used}
          usageStatus={renewUsage.status}
          onClose={() => setRenewingRecord(null)}
          onSaved={loadApps}
        />

        {/* ฟอร์มซื้อชั่วโมง — **mount ท้ายสุด = อยู่บนสุด** (เหตุผล z-index เดียวกับ
            ฟอร์มต่ออายุด้านบน) · บันทึกแล้ว `loadApps()` ดึงช่วงใหม่ → แถวนั้นเห็น
            MA ใหม่ทันที และปุ่ม "ซื้อชั่วโมง" หายเองเพราะคงเหลือ > 0 · `used`/
            `usageStatus` = "ใช้ไป" **รายรอบของแถวนั้น** ให้กล่องสรุป/preview ในฟอร์ม
            ตรงกับที่เห็นข้างนอก */}
        <BuyHoursDialog
          open={Boolean(buyingRecord)}
          record={buyingRecord}
          used={buyUsage.used}
          usageStatus={buyUsage.status}
          onClose={() => setBuyingRecord(null)}
          onSaved={loadApps}
        />

        {/* ยืนยันการ **ลบทั้งคู่** (ทุกช่วงของ แอป×บริษัท) — ข้อความคนละ key กับ
            master-data เพราะต้องบอกจำนวนแถวด้วย · ไม่ต้องเช็ก "งานค้าง" แล้ว
            เพราะไม่ได้ลบแอป */}
        <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs">
          <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          <DialogContent>
            {deleteTarget && (
              <Typography variant="body2">
                {t("deleteRecordConfirmMessage", {
                  type: t("data"),
                  name: deleteTarget.label,
                  n: deleteTarget.count,
                })}
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

        {/* ยืนยันการ **ยกเลิกรายการ** — ลบช่วงเดียว (แถวล่าสุดของคู่) ไม่ใช่ทั้งคู่ ·
            ปุ่ม "ยกเลิกรายการ" ในแท็บ "ประวัติการต่ออายุ" เปิดกล่องนี้ — ต่างจากปุ่ม
            ใน toast หลังบันทึกต่ออายุ/ซื้อชั่วโม์ที่กดได้ทันทีไม่ยืนยัน (อันนั้นเป็น
            การแก้สิ่งที่เพิ่งทำเมื่อกี้) ส่วนถังขยะที่ตารางหลักยังลบทั้งคู่เหมือนเดิม */}
        <Dialog open={!!undoTarget} onClose={() => setUndoTarget(null)} maxWidth="xs">
          <DialogTitle>{t("undoConfirmTitle")}</DialogTitle>
          <DialogContent>
            {undoTarget && (
              <Typography variant="body2">
                {t("undoConfirmMessage", { name: undoTarget.label, n: undoTarget.n })}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setUndoTarget(null)}>{t("cancel")}</Button>
            <Button variant="contained" onClick={confirmUndo}>
              {t("undo")}
            </Button>
          </DialogActions>
        </Dialog>
      </DashboardLayout>
    </RequirePermission>
  );
}
