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
import {
  addAppRecord,
  deleteAppRecord,
  fetchApps,
  updateAppRecord,
  type App,
  type AppCompanyLink,
  type Company,
} from "@/lib/apps-api";
import {
  daysLeftIso,
  expiryChipLabel,
  expiryColor,
  previewExpiryStatus,
} from "@/lib/app-expiry";
import { useNotification } from "@/components/notification";

/** แถวที่กำลังแก้ไข — ส่งมาจากตาราง `/systems` (1 แถว = 1 ช่วงเวลา) */
export interface EditingRecord {
  app: App;
  link: AppCompanyLink;
}

/**
 * ฟอร์มรายละเอียดแอป — **ใช้ที่หน้า `/systems` (ข้อมูลระบบ) ที่เดียว** (แท็บแอปใน
 * `/master-data` เป็นฟอร์มชื่อล้วนคนละตัว) รูปแบบคือ **dropdown เลือกชื่อแอปที่มี
 * อยู่ในระบบ** (ดึง `GET /apps` เองตอนเปิดฟอร์ม — ฟอร์มนี้**ไม่รับพิมพ์ชื่อใหม่**
 * ชื่อใหม่/แก้ชื่อทำที่แท็บแอปใน `/master-data`) → dropdown เลือก 1 บริษัท → วันที่ 2 ช่อง +
 * ชั่วโมง MA ของช่วงนั้น → chip สถานะอายุที่คำนวณสดตอนพิมพ์
 *
 * **บันทึก = 1 รายการ (1 แถว)** — ไม่ใช่ "ส่ง list ทั้งชุดมาแทนที่":
 * - เพิ่มใหม่ → `POST /apps/:id/companies` (**append** — คู่เดิมซ้ำได้ คนละช่วงเวลา
 *   ช่องว่างเสมอ ไม่มีทางดึงค่าเก่ามาให้เห็น)
 * - แก้ไข → `PATCH /apps/:id/companies/:recordId` (แก้แถวนั้นแถบเดียว)
 * - เปลี่ยนแอปตอนแก้ไข = **ย้าย**: เพิ่มที่แอปใหม่ก่อน แล้วค่อยลบแถวเก่า
 *   (ทำหลังเสมอ — ถ้า fail กลางทางจะเหลือข้อมูลซ้ำ มากกว่าหาย)
 *
 * ตัว component เป็นเจ้าของ form state เองทั้งหมด — ผู้เรียกแค่ส่ง `open`,
 * `record` (null = เพิ่มใหม่), รายการบริษัท และ callback หลังบันทึก
 */
export default function AppFormDialog({
  open,
  record,
  companies,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = เพิ่มข้อมูลใหม่ · ไม่ null = แก้ไขแถวนั้น */
  record: EditingRecord | null;
  companies: Company[];
  onClose: () => void;
  /** เรียกหลังบันทึกสำเร็จ — ให้ผู้เรียกดึงรายการใหม่เอง */
  onSaved: () => void;
}) {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const { notify } = useNotification();

  // ฟอร์ม = **บริษัทเดียว** (dropdown) + วันที่ 2 ช่อง + ชั่วโมง MA ของช่วงนั้น
  // (`""` = ยังไม่กรอก / ไม่กำหนด, `0` = ยังไม่ได้เลือกบริษัท)
  // ชื่อ**ไม่อยู่ใน form** — มาจาก dropdown ที่เลือก `selectedAppId`
  const [form, setForm] = useState({
    companyId: 0,
    startedAt: "",
    expiresAt: "",
    maHours: "",
  });
  /** inline error under the company dropdown (one is required) */
  const [error, setError] = useState<string | null>(null);

  // รายการชื่อแอปสำหรับ dropdown — ดึง `GET /apps` ตอนเปิดฟอร์มทั้งสองโหมด
  // (`cancelled` กัน setState หลังไดอะล็อกถูกปิดกลางคัน)
  const [availableApps, setAvailableApps] = useState<App[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsError, setAppsError] = useState(false);
  /** แอปที่เลือกใน dropdown (`0` = ยังไม่เลือก) — บันทึก = เพิ่มข้อมูลให้แอปนั้น */
  const [selectedAppId, setSelectedAppId] = useState(0);
  /** inline error under the app dropdown (one is required) */
  const [nameError, setNameError] = useState<string | null>(null);

  // เปิดฟอร์มใหม่ = ช่องว่างเสมอ (ข้อมูลใหม่ ไม่ดึงค่าเก่ามาให้เห็น) ·
  // เปิดแก้ไข = โหลดค่าของแถวนั้น (WYSIWYG) + ล็อก dropdown ไปที่แอปของแถว
  useEffect(() => {
    if (!open) return;
    const link = record?.link;
    setForm({
      companyId: link?.id ?? 0,
      startedAt: link?.startedAt ?? "",
      expiresAt: link?.expiresAt ?? "",
      maHours: link?.maHours == null ? "" : String(link.maHours),
    });
    setSelectedAppId(record?.app.id ?? 0);
    setError(null);
    setNameError(null);
  }, [open, record]);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  /** สถานะอายุที่ชิปจะโชว์ — คำนวณใหม่ทุกครั้งที่ผู้ใช้แก้วันที่ */
  const status = previewExpiryStatus(form.expiresAt);
  /** ข้อความชิป = "เหลือ n วัน ใกล้หมดอายุ" / "หมดอายุแล้ว n วัน" / … (จากวันเหลือ) */
  const chip = expiryChipLabel(status, daysLeftIso(form.expiresAt));

  /**
   * ตัวเลือกใน dropdown ชื่อ = รายการที่ดึงมา · ยังไม่มา (หรือดึงไม่สำเร็จ) ใน
   * โหมดแก้ไข → ค้างแอปของแถวนั้นไว้ก่อน เพื่อให้เห็นชื่อเดิม
   */
  const nameOptions: App[] = availableApps.length
    ? record && !availableApps.some((a) => a.id === record.app.id)
      ? [record.app, ...availableApps]
      : availableApps
    : record
      ? [record.app]
      : [];

  /**
   * แอปที่ฟอร์มจะเพิ่มข้อมูลให้ = แอปที่เลือกใน dropdown (โหมดแก้ไขเริ่มที่แอป
   * ของแถวนั้น) · ยังไม่เลือก = `undefined` → บันทึกไม่ได้ — โหมดเพิ่มใหม่**ไม่มี
   * ทางสร้างแอปใหม่** เพราะไม่มีช่องให้พิมพ์ชื่อ
   */
  const target =
    selectedAppId === 0
      ? undefined
      : (availableApps.find((a) => a.id === selectedAppId) ??
        // รายการยังไม่มา (หรือดึงไม่สำเร็จ) ในโหมดแก้ไข → ถือแอปของแถวไว้ก่อน
        (record?.app.id === selectedAppId ? record.app : undefined));

  /** ข้อความใต้ dropdown ชื่อ — ลำดับ: ดึงรายการไม่สำเร็จ → ยังไม่ได้เลือก → ยังไม่มีแอป */
  const nameHelper = appsError
    ? t("genericError")
    : (nameError ??
      (!appsLoading && !record && nameOptions.length === 0 ? t("noAppsHint") : null));

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

    const payload = {
      companyId: form.companyId,
      startedAt: form.startedAt || null,
      expiresAt: form.expiresAt || null,
      // `""` = ยังไม่กำหนด → null (ต่างจาก 0 ที่หมายถึง "ตกลงให้ 0 ชม.")
      maHours: form.maHours === "" ? null : Number(form.maHours),
    };

    try {
      if (!record) {
        // เพิ่มใหม่ = append — คู่เดิมที่มีอยู่แล้วไม่ถูกแตะ
        await addAppRecord(target.id, payload);
      } else if (target.id === record.app.id) {
        // แก้ไข = แถวนั้นแถบเดียว
        await updateAppRecord(record.app.id, record.link.recordId, payload);
      } else {
        // เปลี่ยนแอป = **ย้ายแถว**: เพิ่มที่ใหม่ก่อน แล้วค่อยลบของเก่า
        await addAppRecord(target.id, payload);
        await deleteAppRecord(record.app.id, record.link.recordId);
      }
      notify(record ? t("dataUpdated") : t("dataCreated"));
      onClose();
      onSaved();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{record ? t("editData") : t("addData")}</DialogTitle>
      <DialogContent sx={{ overflowY: "auto" }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {/* ชื่อแอป = dropdown ดึงจาก `GET /apps` — เพิ่มใหม่ = เลือกแอปที่จะใส่ข้อมูล ·
              แก้ไข = เปลี่ยนเป็นแอปอื่นได้ (บันทึกแล้วย้ายแถวนั้นไปแอปใหม่) */}
          <FormControl fullWidth error={!!nameError || appsError}>
            <InputLabel id="app-name-label">{t("columnApp")}</InputLabel>
            <Select
              labelId="app-name-label"
              value={selectedAppId}
              label={t("columnApp")}
              disabled={appsLoading}
              onChange={(e) => {
                setSelectedAppId(Number(e.target.value));
                setNameError(null);
              }}
            >
              {/* placeholder ตอนยังไม่เลือก (`value={0}` ต้องมี MenuItem ตรงกัน
                  ไม่งั้นช่องว่างเปล่าและ MUI เตือน out-of-range) */}
              <MenuItem value={0} disabled>
                {t("selectApp")}
              </MenuItem>
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
                // เปลี่ยนเฉพาะบริษัท — ค่าวันที่/MA ที่พิมพ์ไว้คงตามเดิม
                setForm({ ...form, companyId: Number(e.target.value) });
                setError(null);
              }}
              disabled={companies.length === 0}
            >
              {/* placeholder ตอนยังไม่เลือก — ให้ `value={0}` มี MenuItem ตรงกัน
                  (ไม่งั้นช่องว่างเปล่าดูเหมือนไม่มีอะไรให้เลือก) */}
              <MenuItem value={0} disabled>
                {t("selectCompany")}
              </MenuItem>
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
          {/* ชั่วโมง MA ของช่วงนี้ → วางใต้ dropdown บริษัท */}
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
