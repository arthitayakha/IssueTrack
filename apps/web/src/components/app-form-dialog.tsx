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
import { saveApp, type App, type Company } from "@/lib/apps-api";
import {
  daysLeftIso,
  expiryChipLabel,
  expiryColor,
  previewExpiryStatus,
} from "@/lib/app-expiry";
import { useNotification } from "@/components/notification";

/**
 * ฟอร์มเพิ่ม/แก้ไขแอป — **ที่เดียวที่สองหน้า (`/master-data` กับ `/systems`)
 * ใช้ร่วมกัน** รูปแบบคือ ชื่อ → **dropdown เลือก 1 บริษัท** → วันที่ 2 ช่อง
 * ของคู่ แอป×บริษัท นั้น → chip สถานะอายุที่คำนวณสดตอนพิมพ์
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
  const [form, setForm] = useState({
    name: "",
    companyId: 0,
    startedAt: "",
    expiresAt: "",
    maHours: "",
  });
  /** inline error under the company dropdown (one is required) */
  const [error, setError] = useState<string | null>(null);

  // เปิดฟอร์มใหม่ = เคลียร์ · เปิดแก้ไข = โหลดชื่อ + คู่แรก (ฟอร์มถือได้แค่ 1 บริษัท)
  useEffect(() => {
    if (!open) return;
    const link = app?.companies[0];
    setForm({
      name: app?.name ?? "",
      companyId: link?.id ?? 0,
      startedAt: link?.startedAt ?? "",
      expiresAt: link?.expiresAt ?? "",
      maHours: link?.maHours == null ? "" : String(link.maHours),
    });
    setError(null);
  }, [open, app]);

  /** สถานะอายุที่ชิปจะโชว์ — คำนวณใหม่ทุกครั้งที่ผู้ใช้แก้วันที่ */
  const status = previewExpiryStatus(form.expiresAt);
  /** ข้อความชิป = "เหลือ n วัน ใกล้หมดอายุ" / "หมดอายุแล้ว n วัน" / … (จากวันเหลือ) */
  const chip = expiryChipLabel(status, daysLeftIso(form.expiresAt));

  async function handleSave() {
    if (!form.companyId) {
      setError(t("companyRequired"));
      return;
    }
    setError(null);
    try {
      await saveApp({
        id: app?.id,
        name: form.name,
        // ส่งเป็น array อันเดียว — API ยังรับรูปแบบ many-to-many อยู่
        companies: [
          {
            id: form.companyId,
            startedAt: form.startedAt || null,
            expiresAt: form.expiresAt || null,
            // `""` = ยังไม่กำหนด → null (ต่างจาก 0 ที่หมายถึง "ตกลงให้ 0 ชม.")
            maHours: form.maHours === "" ? null : Number(form.maHours),
          },
        ],
      });
      notify(app ? t("appUpdated") : t("appCreated"));
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
          <TextField
            label={t("columnName")}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
          />
          {/* บริษัทเดียว — dropdown เลือก 1 รายการ (ไม่ใช่ Autocomplete เลือกหลาย) */}
          <FormControl fullWidth error={!!error}>
            <InputLabel id="app-company-label">{t("columnCompany")}</InputLabel>
            <Select
              labelId="app-company-label"
              value={form.companyId}
              label={t("columnCompany")}
              onChange={(e) => {
                setForm({ ...form, companyId: Number(e.target.value) });
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
