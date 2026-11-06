"use client";

import { useEffect, useMemo, useState } from "react";
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
  Tooltip,
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
import AppFormDialog from "@/components/app-form-dialog";
import {
  checkApp,
  deleteApp,
  fetchCompanies,
  fetchSystemsApps,
  sumMaHours,
  toggleAppActive,
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
import { EMPTY_FILTERS, fetchSummaryRows, type SummaryRow } from "@/lib/reports-api";

/**
 * คอลัมน์ "บริษัท" โชว์ชื่อสูงสุดกี่ชื่อ — ที่เหลือยุบเป็น `+N`
 * (hover ดูรายชื่อผ่าน tooltip) กันแถวสูง/ยาวเมื่อผูกบริษัทหลายแห่ง
 */
const MAX_COMPANY_NAMES = 3;

/**
 * คู่ที่ "ใกล้หมดอายุที่สุด" ของแอป — ตารางนี้มี **1 แถวต่อแอป** แต่วันที่เป็น
 * รายบริษัทแล้ว จึงต้องเลือกมาชุดเดียว: เอาคู่ที่มีวันหมดอายุและวันเล็กที่สุด
 * (เทียบ `YYYY-MM-DD` ซึ่งเรียงตรงกับลำดับเวลาอยู่แล้ว) ถ้าไม่มีคู่ไหนกรอก
 * วันหมดอายุเลย ก็ใช้คู่แรก (วันที่เริ่มใช้งานอาจยังมีค่า)
 */
function pickNearest(links: AppCompanyLink[]): AppCompanyLink | null {
  let nearest: AppCompanyLink | null = null;
  for (const link of links) {
    if (!link.expiresAt) continue;
    if (!nearest?.expiresAt || link.expiresAt < nearest.expiresAt) nearest = link;
  }
  return nearest ?? links[0] ?? null;
}

/** ปัดเศษ 1 ตำแหน่ง — เหมือน `round1` ของ reports (วินาที → ชม. อาจมีเศษทศนิยม) */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * `ma_hours` ของแอป = **ผลรวมทุกคู่ แอป×บริษัท** — คำนวณที่ `sumMaHours()`
 * ใน `lib/apps-api.ts` (ฟังก์ชันเดียวกับที่ `/reports` ใช้ ตัวเลขจึงตรงกัน)
 *
 * ต้องเป็นคนละค่ากับ "ใช้ไป" ซึ่งคิด **ระดับแอป** เพราะ `issues` ไม่มี
 * `company_id` — งานจึงระบุบริษัทไม่ได้ (เรื่องนี้รอประชุม)
 */
function appMaHours(app: App): number | null {
  return sumMaHours(app.companies);
}

/**
 * หน้า **ข้อมูลระบบ** — ตารางละเอียดของแอป (บริษัท / วันที่เริ่มใช้งาน /
 * วันที่หมดอายุ / ชั่วโมง MA / **คงเหลือ** / สถานะอายุ / การใช้งาน)
 * + ฟอร์มเพิ่ม/แก้ไข/ลบครบ แยกออกมาจากแท็บ `ข้อมูลระบบ` เดิมใน
 * `/master-data` ให้เป็นหน้าของตัวเอง และมีเมนูใน sidebar (`system.view`)
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
   * ตัวเลข "ใช้ไป" ต่อแอป — ดึงคู่กับ `loadApps()` ตอนเปิดหน้า
   * `error` ต้องแยกจาก `ready` เพราะถ้าดึงไม่ได้แล้วปล่อยให้เหลือ 0
   * ตัวเลข "คงเหลือ" จะเท่ากับ MA ทั้งก้อนซึ่ง**ผิด**
   */
  const [usageSummary, setUsageSummary] = useState<SummaryRow[]>([]);
  const [usageStatus, setUsageStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    setMounted(true);
  }, []);

  const [appDialogOpen, setAppDialogOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<App | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteCheck, setDeleteCheck] = useState<{ canDelete: boolean; issueCount: number } | null>(
    null,
  );
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canUpdate = can("system.update");
  const canDelete = can("system.delete");

  async function loadApps() {
    try {
      const result = await fetchSystemsApps();
      setApps(result.data);
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
    Promise.all([loadApps(), loadCompanies()]).finally(() => setLoading(false));
    void loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /**
   * ดึง "ชั่วโมงที่ใช้ไป" ต่อแอป — `GET /reports/summary?groupBy=app`
   * (`hoursEntered` = ผลรวม `actual_fix_duration` ฝั่งเซิร์ฟเวอร์)
   * ล้มเหลวเองได้: คอลัมน์ "คงเหลือ" จะกลายเป็น `—` พร้อมปุ่มลองใหม่
   */
  async function loadUsage() {
    setUsageStatus("loading");
    try {
      const rows = await fetchSummaryRows("app", EMPTY_FILTERS);
      // แถว "รวมทั้งหมด" ไม่ใช่แอป — ทิ้งไปก่อนเข้า Map กันรวมผิด
      setUsageSummary(rows.filter((row) => !row.isTotal));
      setUsageStatus("ready");
    } catch {
      setUsageSummary([]);
      setUsageStatus("error");
    }
  }

  /** ปุ่ม "ลองใหม่" ใต้ตาราง — ยิง `loadUsage()` ซ้ำโดยไม่แตะตารางอื่น */
  function retryUsage() {
    void loadUsage();
  }

  function openAddApp() {
    setEditingApp(null);
    setAppDialogOpen(true);
  }

  function openEditApp(app: App) {
    setEditingApp(app);
    setAppDialogOpen(true);
  }

  async function handleToggleAppActive(app: App) {
    try {
      await toggleAppActive(app.id, !app.isVisible);
      setApps((prev) =>
        prev.map((a) => (a.id === app.id ? { ...a, isVisible: !a.isVisible } : a)),
      );
      notify(t("appToggled"));
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    }
  }

  /** pre-flight ก่อนเปิดกล่องยืนยัน — `canDelete` เป็นตัวสั่งปุ่ม "ลบ" */
  async function handleDeleteApp(id: number) {
    const app = apps.find((a) => a.id === id);
    if (!app) return;
    setDeleteTarget({ id, name: app.name });
    setDeleteLoading(true);
    try {
      setDeleteCheck(await checkApp(id));
    } catch {
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteApp(deleteTarget.id);
      setApps((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      notify(t("appDeleted"));
      setDeleteTarget(null);
      setDeleteCheck(null);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    }
  }

  /**
   * "ใช้ไป" ต่อแอป (ชม.) จาก endpoint รายงาน — join ด้วย `appId`
   *
   * คำนวณ**เฉพาะตอนดึงสำเร็จ** (`ready`) เพราะตอน `error` ถ้าปล่อยให้เป็น 0
   * คอลัมน์ "คงเหลือ" จะเท่ากับ MA เต็มก้อนทั้งที่ยังไม่รู้ค่าจริง
   *
   * คิด**ระดับแอป** เพราะ `issues` ไม่มี `company_id` (งานระบุบริษัทไม่ได้ —
   * เรื่องนี้รอประชุม) จึงต่างจาก `maHours` ที่เป็นรายคู่
   */
  const usedByApp = useMemo(() => {
    const map = new Map<number, number>();
    if (usageStatus !== "ready") return map;
    for (const row of usageSummary) {
      if (row.appId == null) continue; // งานที่ไม่ได้ผูกแอป — ไม่เข้าแถวไหน
      map.set(row.appId, (map.get(row.appId) ?? 0) + row.hoursEntered);
    }
    return map;
  }, [usageSummary, usageStatus]);

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
   * คอลัมน์ "บริษัท" — **ข้อความล้วน** คั่นด้วย `, ` (ไม่ใช่ชิป)
   * เกิน `MAX_COMPANY_NAMES` ชื่อ → ต่อท้าย `+N` แล้ว hover ดูรายชื่อที่เหลือ
   * ผ่าน tooltip · ชื่อยาวขึ้นบรรทัดใหม่แทนการยืดคอลัมน์
   */
  function companyNames(app: App) {
    if (app.companies.length === 0) {
      return (
        <Typography variant="caption" color="text.disabled">
          {t("noCompany")}
        </Typography>
      );
    }
    const shown = app.companies.slice(0, MAX_COMPANY_NAMES);
    const rest = app.companies.slice(MAX_COMPANY_NAMES);
    const text =
      shown.map((company) => company.name).join(", ") +
      (rest.length > 0 ? ` +${rest.length}` : "");
    const body = (
      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
        {text}
      </Typography>
    );
    // มีชื่อที่ถูกตัดออก → hover อ่านได้ว่าเป็นใครบ้าง
    return rest.length > 0 ? (
      <Tooltip title={rest.map((company) => company.name).join(", ")}>{body}</Tooltip>
    ) : (
      body
    );
  }

  /** ใต้ chip "สถานะอายุ" — ไล่ทุกบริษัทว่าเหลือกี่วัน (ขึ้นบรรทัดใหม่ระหว่างเจ้า) */
  function expiryBreakdown(app: App) {
    if (app.companies.length === 0) {
      return <Typography variant="caption">{t("noCompany")}</Typography>;
    }
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
        {app.companies.map((link) => {
          // คำเดียวกับชิปทุกจุด — "มามี่ฟู้ด: เหลือ 5 วัน ใกล้หมดอายุ"
          const chip = expiryChipLabel(link.expiryStatus, daysLeftIso(link.expiresAt ?? ""));
          return (
            <Typography key={link.id} variant="caption" component="span">
              {`${link.name}: ${t(chip.key, { n: chip.n ?? 0 })}`}
            </Typography>
          );
        })}
      </Box>
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
   * คอลัมน์ **"คงเหลือ"** = `MA − ใช้ไป`
   *
   * แยก 4 กรณีให้ชัด เพราะข้อความต้องไม่ปนกัน:
   * - ยังดึง "ใช้ไป" ไม่สำเร็จ → spinner ระหว่างโหลด / `—` ตอนผิดพลาด
   *   (**ไม่ใช่** "ยังไม่กรอก" เพราะ MA อาจกรอกไปแล้ว)
   * - ยังไม่กรอก MA → "ยังไม่กรอก" (key เดิม)
   * - อย่างอื่น → ตัวเลขปัด 1 ตำแหน่ง
   */
  function remainingCell(app: App) {
    const caption = (text: string) => (
      <Typography variant="caption" color="text.disabled">
        {text}
      </Typography>
    );

    if (usageStatus === "loading") return <CircularProgress size={16} />;
    if (usageStatus === "error") return caption("—");

    const ma = appMaHours(app);
    if (ma == null) return caption(t("notSetYet"));
    return round1(ma - (usedByApp.get(app.id) ?? 0));
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
                <DataTableCell align="center">{t("columnUsage")}</DataTableCell>
                <DataTableCell align="right">{t("columnActions")}</DataTableCell>
              </DataTableRow>
            </DataTableHead>
            <DataTableBody>
              {apps.map((app) => {
                // 1 แถวต่อแอป — วันที่/สถานะที่โชว์ = คู่ที่ใกล้หมดอายุที่สุด
                const nearest = pickNearest(app.companies);
                const status = nearest?.expiryStatus ?? "none";
                return (
                  <DataTableRow key={app.id}>
                    <DataTableCell>{app.name}</DataTableCell>
                    <DataTableCell>{companyNames(app)}</DataTableCell>
                    <DataTableCell>
                      {nearest?.startedAt ? (
                        formatDay(nearest.startedAt, locale)
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          {t("notSetYet")}
                        </Typography>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      {nearest?.expiresAt ? (
                        formatDay(nearest.expiresAt, locale)
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          {t("expiryNone")}
                        </Typography>
                      )}
                    </DataTableCell>
                    {/* ชั่วโมง MA ที่ตกลงให้คู่นี้ — ตัวเลขล้วน หัวตารางมีหน่วย "ชม." อยู่แล้ว */}
                    <DataTableCell align="center">
                      {nearest?.maHours != null ? (
                        nearest.maHours
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          {t("notSetYet")}
                        </Typography>
                      )}
                    </DataTableCell>
                    {/* คงเหลือ = MA − ใช้ไป — กฎทั้งหมดอยู่ที่ `remainingCell()` */}
                    <DataTableCell align="center">{remainingCell(app)}</DataTableCell>
                    {/* สถานะอายุของคู่ที่ใกล้หมดที่สุด — hover ดูครบทุกบริษัท */}
                    <DataTableCell align="center">
                      <Tooltip title={expiryBreakdown(app)}>
                        <Chip
                          label={expiryChipText(status, nearest?.expiresAt ?? null)}
                          color={expiryColor(status)}
                          size="small"
                          variant="outlined"
                        />
                      </Tooltip>
                    </DataTableCell>
                    {/* การใช้งาน = is_visible ตั้งปิดเอง สลับด้วย switch ที่คอลัมน์การจัดการ */}
                    <DataTableCell align="center">
                      <Chip
                        label={app.isVisible ? t("active") : t("inactive")}
                        color={app.isVisible ? "success" : "error"}
                        size="small"
                        variant="outlined"
                      />
                    </DataTableCell>
                    <DataTableCell align="right">
                      <AppActions
                        app={app}
                        canUpdate={canUpdate}
                        canDelete={canDelete}
                        onToggle={handleToggleAppActive}
                        onEdit={openEditApp}
                        onDelete={handleDeleteApp}
                      />
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
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
          app={editingApp}
          companies={companies}
          onClose={() => setAppDialogOpen(false)}
          onSaved={loadApps}
        />

        <Dialog
          open={!!deleteTarget}
          onClose={() => {
            setDeleteTarget(null);
            setDeleteCheck(null);
          }}
          maxWidth="xs"
        >
          <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
          <DialogContent>
            {deleteLoading ? (
              <CircularProgress size={24} />
            ) : deleteCheck && !deleteCheck.canDelete && deleteTarget ? (
              <Typography variant="body2">
                {t("deleteInUse", {
                  name: deleteTarget.name,
                  issueCount: deleteCheck.issueCount,
                  columnCount: 0,
                })}
              </Typography>
            ) : deleteTarget ? (
              <Typography variant="body2">
                {t("deleteConfirmMessage", { type: t("app"), name: deleteTarget.name })}
              </Typography>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => {
                setDeleteTarget(null);
                setDeleteCheck(null);
              }}
            >
              {t("cancel")}
            </Button>
            {deleteCheck?.canDelete && (
              <Button variant="contained" color="error" onClick={confirmDelete}>
                {t("delete")}
              </Button>
            )}
          </DialogActions>
        </Dialog>
      </DashboardLayout>
    </RequirePermission>
  );
}
