"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DataTable, {
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/data-table";
import RequirePermission from "@/components/require-permission";
import { Pagination } from "@/components/pagination";
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
   * ตัวเลข "ใช้ไป" ต่อแอป (ชม.) — ดึงคู่กับ `loadApps()` ตอนเปิดหน้า ผ่าน
   * `fetchAppUsageAllTime()` จุดเดียวกับที่ `/reports` ใช้ (กติกาหัก MA
   * จะได้ไม่ต่างกันระหว่างสองหน้า)
   *
   * `error` ต้องแยกจาก `ready` เพราะถ้าดึงไม่ได้แล้วปล่อยให้เหลือ 0
   * ตัวเลข "คงเหลือ" จะเท่ากับ MA ทั้งก้อนซึ่ง**ผิด**
   *
   * ตอน `MA_DEDUCTION_PAUSED = true` ฟังก์ชันนั้นคืน map ว่างทันที (ไม่ยิง
   * request) → ค่า "คงเหลือ" จึงเป็นชั่วโมง MA เต็มก้อนเสมอ
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
    // เพื่อไม่ให้การช้าของ endpoint รายงานมาค้างหน้าทั้งใบ
    // (`MA_DEDUCTION_PAUSED` = ไม่มี request ให้รออยู่แล้ว — เปิดกลับเมื่อไหร่
    // ข้อความนี้กลับมามีผลทันที)
    Promise.all([loadApps(), loadCompanies()]).finally(() => setLoading(false));
    void loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /**
   * ดึง "ชั่วโมงที่ใช้ไป" ต่อแอป — `fetchAppUsageAllTime()` (ตัวเดียวกับที่
   * หน้ารายงานใช้) ตอนนี้ `MA_DEDUCTION_PAUSED` → คืน map ว่างทันที
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
   * (เข้าไม่ถึงตอน `MA_DEDUCTION_PAUSED = true` เพราะไม่มี request ให้พัง)
   */
  function retryUsage() {
    void loadUsage();
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
   * ตอน `MA_DEDUCTION_PAUSED = true` → ใช้ไป = 0 เสมอ จึงเหลือ MA เต็มก้อน
   * ("ยังไม่กรอก" กับสองกรณีแรกยังแยกไว้เผื่อเปิดหักกลับ)
   *
   * "ใช้ไป" เป็น**ระดับแอป** (`issues` ไม่มี `company_id` — งานระบุบริษัทไม่ได้)
   * ทุกแถวของแอปเดียวกันจึงหักค่าเดียวกัน
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
          <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
            {can("system.create") && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openAddApp}>
                {t("addData")}
              </Button>
            )}
          </Box>

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
                  รายการใหม่ถูกต่อ**ใต้** รายการเดิม (API เรียง `recordId ASC`) */}
              {apps.flatMap((app) =>
                app.companies.map((link) => {
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
                }),
              )}
              {/* ยังไม่มีรายการเลย (แอปทุกตัวยังไม่มีข้อมูล หรือเพิ่งลบหมด) */}
              {apps.length === 0 && (
                <DataTableRow>
                  <DataTableCell colSpan={8}>
                    <Typography variant="caption" color="text.disabled">
                      {t("noRows")}
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

          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(apps.length / 10))}
            total={apps.length}
            limit={10}
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
