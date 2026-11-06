"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import "dayjs/locale/th";
import { ApiError } from "@/lib/api";
import { fetchApps, saveApp, type App, type Company } from "@/lib/apps-api";
import {
  daysLeftIso,
  expiryChipLabel,
  expiryColor,
  previewExpiryStatus,
} from "@/lib/app-expiry";
import { useNotification } from "@/components/notification";

/**
 * ฟอร์มเพิ่ม/แก้ไขแอป — **ที่เดียวที่สองหน้า (`/master-data` กับ `/systems`)
 * ใช้ร่วมกัน** รูปแบบคือ **dropdown เลือกชื่อแอปที่มีอยู่ในระบบ** (ดึง `GET /apps`
 * เองตอนเปิดฟอร์ม — ฟอร์มนี้**ไม่รับพิมพ์ชื่อใหม่** โหมดแก้ไขล็อกชื่อไว้) →
 * dropdown เลือก 1 บริษัท → วันที่ 2 ช่อง + ชั่วโมง MA ของคู่ แอป×บริษัท นั้น →
 * chip สถานะอายุที่คำนวณสดตอนพิมพ์
 *
 * บันทึก = `PATCH` แอปที่เลือกพร้อม **รวม link เดิม** (ผูกบริษัท/วันที่/MA เข้ากับ
 * แอปเดิม — ไม่สร้างแอปซ้ำ ไม่ลบ link บริษัทอื่นที่แอปผูกอยู่ทิ้ง)
 *
 * ตัว component เป็นเจ้าของ form state เองทั้งหมด — ผู้เรียกแค่ส่ง `open`,
 * `app` (null = เพิ่มใหม่), รายการบริษัท และ callback หลังบันทึก
 */
export default function AppFormDialog({
  open,
  app,
  companies,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = เพิ่มใหม่ · ไม่ null = แก้ไข (โหลดคู่แรกของแอปมาให้) */
  app: App | null;
  companies: Company[];
  onClose: () => void;
  /** เรียกหลังบันทึกสำเร็จ — ให้ผู้เรียกดึงรายการใหม่เอง */
  onSaved: () => void;
}) {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const { notify } = useNotification();

  // ฟอร์มแอป = **บริษัทเดียว** (dropdown) + วันที่ 2 ช่อง + ชั่วโมง MA ของคู่
  // แอป×บริษัท นั้น (`""` = ยังไม่กรอก / ไม่กำหนด, `0` = ยังไม่ได้เลือกบริษัท)
  // ชื่อ**ไม่อยู่ใน form** อีกต่อไป — มาจาก dropdown ที่เลือก `selectedAppId`
  const [form, setForm] = useState({
    companyId: 0,
    startedAt: "",
    expiresAt: "",
    maHours: "",
  });
  /** inline error under the company dropdown (one is required) */
  const [error, setError] = useState<string | null>(null);

  // รายการชื่อแอปสำหรับ dropdown — ดึง `GET /apps` ตอนเปิดฟอร์มโหมดเพิ่มใหม่
  // (`app` ไม่ null = โหมดแก้ไข ไม่ต้องดึง เพราะชื่อล็อกไว้ที่ค่าเดิม)
  const [availableApps, setAvailableApps] = useState<App[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState(false);
  /** แอปที่เลือกในโหมดเพิ่มใหม่ (`0` = ยังไม่เลือก) — บันทึก = ผูกข้อมูลกับแอปนั้น */
  const [selectedAppId, setSelectedAppId] = useState(0);
  /** inline error under the app dropdown (one is required) */
  const [nameError, setNameError] = useState<string | null>(null);

  /**
   * โหลดฟอร์มตามคู่ แอป×บริษัท — ถ้าคู่นั้นผูกอยู่แล้ว **ค่าเดิมถูกดึงมาให้เห็น**
   * (กันบันทึกทับ link เดิมด้วยช่องว่างตอน merge) · ยังไม่ผูก → ช่องว่าง
   * · ยังไม่ได้เลือกบริษัท (`0`) → คงช่องวันที่/MA ที่ผู้ใช้กรอกไว้ตามเดิม
   */
  function applyPair(selectedApp: App | undefined, companyId: number) {
    const link = selectedApp?.companies.find((l) => l.id === companyId);
    setForm((f) => ({
      companyId,
      startedAt: companyId === 0 ? f.startedAt : (link?.startedAt ?? ""),
      expiresAt: companyId === 0 ? f.expiresAt : (link?.expiresAt ?? ""),
      maHours:
        companyId === 0
          ? f.maHours
          : link?.maHours == null
            ? ""
            : String(link.maHours),
    }));
  }

  // เปิดฟอร์มใหม่ = เคลียร์ · เปิดแก้ไข = โหลดคู่แรก (ฟอร์มถือได้แค่ 1 บริษัท)
  // พร้อมล็อก dropdown ชื่อไปที่แอปนั้น (`selectedAppId`)
  useEffect(() => {
    if (!open) return;
    const link = app?.companies[0];
    setForm({
      companyId: link?.id ?? 0,
      startedAt: link?.startedAt ?? "",
      expiresAt: link?.expiresAt ?? "",
      maHours: link?.maHours == null ? "" : String(link.maHours),
    });
    setSelectedAppId(app?.id ?? 0);
    setError(null);
    setNameError(null);
  }, [open, app]);

  // โหมดเพิ่มใหม่: ดึงชื่อแอปที่มีอยู่ในระบบมาให้ dropdown เลือก — ฟอร์มนี้
  // **ไม่รับพิมพ์ชื่อใหม่** จึงไม่ต้องดึงอะไรเลยตอนแก้ไข (`cancelled` กัน
  // setState หลังไดอะล็อกถูกปิดกลางคัน)
  useEffect(() => {
    if (!open || app) return;
    let cancelled = false;
    setAppsLoading(true);
    setAppsError(false);
    fetchApps()
      .then((res) => {
        if (!cancelled) setAvailableApps(res.data);
      })
      .catch(() => {
        if (!cancelled) setAppsError(true);
      })
      .finally(() => {
        if (!cancelled) setAppsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, app]);

  /** สถานะอายุที่ชิปจะโชว์ — คำนวณใหม่ทุกครั้งที่ผู้ใช้แก้วันที่ */
  const status = previewExpiryStatus(form.expiresAt);
  /** ข้อความชิป = "เหลือ n วัน ใกล้หมดอายุ" / "หมดอายุแล้ว n วัน" / … (จากวันเหลือ) */
  const chip = expiryChipLabel(status, daysLeftIso(form.expiresAt));

  /** ตัวเลือกใน dropdown ชื่อ — โหมดแก้ไขโชว์เฉพาะแอปตัวเอง (ล็อกชื่อไว้) */
  const nameOptions: App[] = app ? [app] : availableApps;

  /**
   * แอปที่ฟอร์มจะผูกข้อมูลด้วย = แอปที่กำลังแก้ไข หรือแอปที่เลือกจาก dropdown
   * — โหมดเพิ่มใหม่**ไม่มีทางสร้างแอปใหม่** (ไม่มีช่องให้พิมพ์ชื่อ)
   */
  const target = app ?? availableApps.find((a) => a.id === selectedAppId);

  /** ข้อความใต้ dropdown ชื่อ — ลำดับ: ดึงรายการไม่สำเร็จ → ยังไม่ได้เลือก → ยังไม่มีแอป */
  const nameHelper = appsError
    ? t("genericError")
    : (nameError ??
      (!appsLoading && !app && nameOptions.length === 0 ? t("noAppsHint") : null));

  async function handleSave() {
    if (!target) {
      setNameError(t("appRequired"));
      return;
    }
    if (!form.companyId) {
      setError(t("companyRequired"));
      return;
    }
    setNameError(null);
    setError(null);

    const formRow = {
      id: form.companyId,
      startedAt: form.startedAt || null,
      expiresAt: form.expiresAt || null,
      // `""` = ยังไม่กำหนด → null (ต่างจาก 0 ที่หมายถึง "ตกลงให้ 0 ชม.")
      maHours: form.maHours === "" ? null : Number(form.maHours),
    };
    // ส่ง **รวมกับ link เดิมของแอป** — `PATCH` ฝั่ง API เก็บเฉพาะแถวที่ส่งมา
    // (ส่งแต่แถวของฟอร์ม = บริษัทอื่นที่แอปผูกอยู่จะถูกลบไปด้วย)
    const kept = target.companies.map((link) => ({
      id: link.id,
      startedAt: link.startedAt,
      expiresAt: link.expiresAt,
      maHours: link.maHours,
    }));
    const companies = kept.some((row) => row.id === formRow.id)
      ? kept.map((row) => (row.id === formRow.id ? formRow : row))
      : [...kept, formRow];

    try {
      await saveApp({ id: target.id, name: target.name, companies });
      // ฟอร์มนี้ผูกข้อมูลกับแอปเดิมเสมอ → แจ้งเป็น "แก้ไข" เสมอ
      notify(t("appUpdated"));
      onClose();
      onSaved();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{app ? t("editApp") : t("addApp")}</DialogTitle>
      <DialogContent sx={{ overflowY: "auto" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {/* ชื่อแอป = dropdown ดึงจาก `GET /apps` — บันทึก = ผูกข้อมูลกับแอปที่
              เลือก (ไม่สร้างชื่อใหม่). โหมดแก้ไขล็อกชื่อไว้ที่ค่าเดิม */}
          <FormControl fullWidth error={!!nameError || appsError}>
            <InputLabel id="app-name-label">{t("columnName")}</InputLabel>
            <Select
              labelId="app-name-label"
              value={app ? app.id : selectedAppId}
              label={t("columnName")}
              disabled={app != null || appsLoading}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelectedAppId(id);
                setNameError(null);
                // เปลี่ยนแอป = คู่ แอป×บริษัท เปลี่ยนด้วย → โหลดค่าของคู่ใหม่
                applyPair(availableApps.find((a) => a.id === id), form.companyId);
              }}
            >
              {!app && (
                <MenuItem value={0} disabled>
                  {t("selectApp")}
                </MenuItem>
              )}
              {nameOptions.map((option) => (
                <MenuItem key={option.id} value={option.id}>
                  {option.name}
                </MenuItem>
              ))}
            </Select>
            {/* error / ดึงรายการไม่สำเร็จ / ยังไม่มีแอปในระบบ เท่านั้นที่มี
                ข้อความใต้ช่อง — ปกติเว้นว่างไว้เพื่อให้ช่องไฟเท่ากัน */}
            {nameHelper && <FormHelperText>{nameHelper}</FormHelperText>}
          </FormControl>
          {/* บริษัทเดียว — dropdown เลือก 1 รายการ (ไม่ใช่ Autocomplete เลือกหลาย) */}
          <FormControl fullWidth error={!!error}>
            <InputLabel id="app-company-label">{t("columnCompany")}</InputLabel>
            <Select
              labelId="app-company-label"
              value={form.companyId}
              label={t("columnCompany")}
              onChange={(e) => {
                // บริษัทเดิมของแอปที่เลือก → ดึงค่าคู่นั้นมาให้เห็นก่อนบันทึก
                applyPair(target, Number(e.target.value));
                setError(null);
              }}
              disabled={companies.length === 0}
            >
              {companies.map((company) => (
                <MenuItem key={company.id} value={company.id}>
                  {company.name}
                </MenuItem>
              ))}
            </Select>
            {/* error / ยังไม่มีบริษัทในระบบ เท่านั้นที่มีข้อความใต้ช่อง —
                ปกติเว้นว่างไว้เพื่อให้ช่องไฟทุกช่องเท่ากัน */}
            {(error || companies.length === 0) && (
              <FormHelperText>{error ?? t("noCompaniesHint")}</FormHelperText>
            )}
          </FormControl>
          {/* ชั่วโมง MA เป็นของคู่ แอป×บริษัท → วางใต้ dropdown บริษัท */}
          <TextField
            label={t("columnMaHours")}
            type="number"
            value={form.maHours}
            onChange={(e) => setForm({ ...form, maHours: e.target.value })}
            fullWidth
            inputProps={{ min: 0, step: 1 }}
          />
          {/* วันที่ 2 ช่อง — MUI DatePicker format DD/MM/YYYY (วัน เดือน ปี)
              ค่าที่เก็บ/ส่ง API ยังเป็น string yyyy-mm-dd เหมือนเดิม */}
          <LocalizationProvider
            dateAdapter={AdapterDayjs}
            adapterLocale={locale === "th" ? "th" : undefined}
          >
            <DatePicker
              label={t("columnStartedAt")}
              value={form.startedAt ? dayjs(form.startedAt) : null}
              onChange={(next) =>
                setForm({ ...form, startedAt: next ? next.format("YYYY-MM-DD") : "" })
              }
              format="DD/MM/YYYY"
              slotProps={{ textField: { fullWidth: true } }}
            />
            {/* ไม่มี `mt` — `gap: 2` ของกล่องแม่เป็นตัวเว้นคนเดียว
                (`LocalizationProvider` ไม่สร้าง DOM จึงกลายเป็น flex child ตรง ๆ
                 ถ้าบวก mt จะได้ 32px ส่วนอื่น 16px) */}
            <Box>
              <DatePicker
                label={t("columnExpiresAt")}
                value={form.expiresAt ? dayjs(form.expiresAt) : null}
                onChange={(next) =>
                  setForm({ ...form, expiresAt: next ? next.format("YYYY-MM-DD") : "" })
                }
                format="DD/MM/YYYY"
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Box>
          </LocalizationProvider>
          {/* สถานะอายุที่คำนวณสดจากวันที่ด้านบน — เซิร์ฟเวอร์ยังเป็นคนตัวจริงตอนบันทึก */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {t("columnExpiryStatus")}
            </Typography>
            <Chip
              label={t(chip.key, { n: chip.n ?? 0 })}
              color={expiryColor(status)}
              size="small"
              variant="outlined"
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("cancel")}</Button>
        <Button variant="contained" onClick={handleSave}>
          {t("save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
