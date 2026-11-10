"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import "dayjs/locale/th";
import { ApiError } from "@/lib/api";
import { renewAppRecord, type App, type AppCompanyLink } from "@/lib/apps-api";
import {
  daysLeftIso,
  expiryChipLabel,
  expiryColor,
  previewExpiryStatus,
} from "@/lib/app-expiry";
import { useNotification } from "@/components/notification";

/** แถวที่กำลังต่ออายุ — ส่งมาจากตาราง `/systems` (1 แถว = คู่ 1 คู่ ช่วงล่าสุด) */
export interface RenewingRecord {
  app: App;
  link: AppCompanyLink;
}

/** ข้อความผิดพลาดใต้แต่ละช่อง (`null` = ผ่าน) */
type FieldErrors = {
  startedAt: string | null;
  expiresAt: string | null;
  maHours: string | null;
};

const NO_ERRORS: FieldErrors = { startedAt: null, expiresAt: null, maHours: null };

/**
 * ฟอร์ม **ต่ออายุ MA** — ป๊อปอัพที่หน้า `/systems` เท่านั้น
 *
 * ต่างจาก `AppFormDialog` ตรงที่ **ไม่มี dropdown เลือกแอป/บริษัท**: ทั้งคู่
 * ตายตัวมาจากแถวที่กดต่ออายุ (`companyId` ยืมจากแถวตั้งต้นที่เซิร์ฟเวอร์
 * อ่านเอง) — การต่ออายุเป็นการ "ปิดช่วงเก่า เปิดช่วงใหม่ให้คู่เดิม"
 * ไม่ใช่การย้ายแถว
 *
 * ครบทั้ง 3 ช่อง (บังคับทั้งฝั่งฟอร์มและฝั่งเซิร์ฟเวอร์) · **ไม่มีช่องหมายเหตุ**
 * (ตัดออกตามข้อตกลง — ทั้งฟอร์มและตารางประวัติ)
 *
 * ค่าเริ่มต้น prefill **เฉพาะวันที่**: เริ่ม = วันถัดจากวันหมดอายุเดิม,
 * สิ้นสุด = เริ่ม + 1 ปี · ส่วน **ช่อง MA ปล่อยว่างเสมอ** — จำนวนของช่วงใหม่
 * เป็นคนละเรื่องกับช่วงเก่า การเอาตัวเลขเก่ามา prefill ทำให้ดูเหมือน "มี
 * ชั่วโมงเพิ่มขึ้นมาเอง" โดยที่ผู้ใช้ไม่ได้กรอก (ค่าที่บันทึกจึงผิดไปด้วย)
 *
 * **ทบชั่วโมงคงเหลือ — เฉพาะการต่ออายุ "ครั้งแรก" เท่านั้น** (แถวต้นทางต้องเป็น
 * รอบที่ 1 ของคู่ = `recordId` น้อยสุด ซึ่งตรงกับเลข "รอบที่ N" ในแท็บประวัติ):
 * ถ้าช่วงแรกยังมี MA เหลือ (`คงเหลือ = maHours − ใช้ไป > 0`) จำนวนนั้นถูก**บอก
 * เป็นตัวเลขในฟอร์ม** แล้วบวกเข้ากับที่ผู้ใช้กรอกตอนบันทึก (`carry`) ·
 * **รอบ 2 เป็นต้นไปไม่ทบ** ไม่ว่าจะเหลือเท่าไร (ข้อสรุปจากผู้ใช้) และ
 * **ไม่ผูกกับวันหมดอายุอีกต่อไป** — เดิมบังคับให้ช่วงเก่าเป็น `expired` ก่อน
 * ซึ่งทำให้การต่ออายุ**วันหมดอายุพอดี** (สถานะยัง `critical`, `carry = 0`)
 * ทบเงียบ ๆ ทั้งที่ช่วงแรกยังไม่ได้ใช้ · fail-open ทุกกรณี: ยังโหลด/ดึง "ใช้ไป"
 * ไม่สำเร็จ / ยังไม่เคยกรอก MA → ไม่ทบ พร้อมบอกเหตุผลใต้ช่อง MA เสมอ
 *
 * **สูตรบันทึกต้องทำให้ "ฟอร์ม = ตาราง" เป๊ะ** — `คงเหลือ` ในตารางคำนวณเป็น
 * `MA ใหม่ − ใช้ไป(ตลอดเวลาต่อคู่)` ไม่ใช่ต่อช่วง ดังนั้น:
 *
 * - **ทบได้ (`carry > 0`)** → `MA ใหม่ = ที่พิมพ์ + MA เก่าทั้งก้อน` — ผลลัพธ์ใน
 *   ตาราง = `ที่พิมพ์ + (MA เก่า − ใช้ไป)` = **ตรงกับที่ฟอร์มสัญญา** (สูตรเก่า
 *   `ที่พิมพ์ + carry` ไม่บวก "ใช้ไป" คืน ทำให้ช่วงเก่าถูกหักซ้ำ — ฟอร์มบอก90
 *   แต่ตารางโชว์70)
 * - **ทบไม่ได้** → `MA ใหม่ = ที่พิมพ์ + round(ใช้ไป)` — คงเหลือหลังบันทึก = `ที่พิมพ์`
 *   (กันยอด "ใช้ไป" ช่วงเก่ามากดคงเหลือของช่วงใหม่ให้ติดลบ)
 *
 * ตัวเลขใต้ช่อง ("คงเหลือจากช่วงก่อน … ทบรวมเป็น …") คำนวณ**จากค่าที่จะบันทึก
 * จริง** (`newMa − ใช้ไป`) จึงตรงกับคอลัมน์ "คงเหลือ" ในตารางทุกกรณี
 *
 * **สถานะข้อมูล "ใช้ไป"** ต้องไม่เงียบ: ยังโหลดอยู่ → ปุ่มบันทึกถูก disable
 * (กันบันทึกก่อนรู้คงเหลือ = ทบเพี้ยน), ดึงไม่สำเร็จ → บันทึกได้แต่**บอกตรง ๆ**
 * ว่ารอบนี้ไม่ทบ, รอบแรกแต่ใช้หมด → บอกว่าไม่มีให้ทบ, รอบ 2 เป็นต้นไป → บอกว่า
 * การทบมีเฉพาะครั้งแรก (มีทุกกรณีใต้ช่อง MA ไม่มีทางเงียบ)
 */
export default function RenewFormDialog({
  open,
  record,
  used,
  usageStatus,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = ไม่มีอะไรให้ต่ออายุ (ปิดตัวเอง) */
  record: RenewingRecord | null;
  /**
   * "ใช้ไป" ของคู่นี้จากหน้า `/systems` (`usedByApp`) — ตัวเดียวกับคอลัมน์
   * "คงเหลือ" ในตาราง จึงทำให้ number ที่โชว์ในฟอร์มตรงกับที่เห็นข้างนอก
   * `undefined` = คู่นี้ไม่มีงานที่หักได้ (= ใช้ 0 ชม. ตามกติกา)
   */
  used?: number | null;
  /**
   * สถานะการดึง "ใช้ไป" ของหน้า — บังคับโหลดเสร็จก่อนให้บันทึก เพื่อกันทบผิด
   * (`"loading"` → ปุ่มบันทึกปิด, `"error"` → บันทึกได้โดยไม่ทบ + บอกเหตุผล)
   */
  usageStatus: "loading" | "ready" | "error";
  onClose: () => void;
  /** เรียกหลังบันทึกสำเร็จ — ให้ผู้เรียกดึงรายการใหม่เอง */
  onSaved: () => void;
}) {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const { notify } = useNotification();

  const [startedAt, setStartedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [maHours, setMaHours] = useState("");
  const [errors, setErrors] = useState<FieldErrors>(NO_ERRORS);
  const [saving, setSaving] = useState(false);

  /**
   * เปิดใหม่ = เติม**วันที่**จากสัญญาเดิม (วันถัดจากวันหมดอายุเดิม → +1 ปี)
   * · แถวที่ยังไม่เคยกรอกวันที่ → เริ่มจากวันนี้/ปีนี้แทน เพื่อไม่ให้ฟอร์มว่างเปล่า
   * · **`maHours` ไม่ prefill** — ช่องต้องว่างให้ผู้ใช้กรอกจำนวนช่วงใหม่เอง
   */
  useEffect(() => {
    if (!open || !record) return;
    const link = record.link;

    const base = link.expiresAt ? dayjs(link.expiresAt) : dayjs();
    const nextStart = link.expiresAt ? base.add(1, "day") : dayjs();
    const nextEnd = nextStart.add(1, "year");

    setStartedAt(nextStart.format("YYYY-MM-DD"));
    setExpiresAt(nextEnd.format("YYYY-MM-DD"));
    setMaHours("");
    setErrors(NO_ERRORS);
    setSaving(false);
  }, [open, record]);

  /**
   * **เป็น "รอบแรก" ของคู่หรือไม่** — แถวต้นทางต้องมี `recordId` น้อยสุดในคู่
   * นั้น (= "รอบที่ 1" ในแท็บประวัติ; แถวที่ซื้อชั่วโมงก็นับเป็นหนึ่งรอบ เพราะ
   * ประวัตินับตามจำนวนแถว) — **การทบชั่วโมงมีเฉพาะการต่ออายุครั้งแรกเท่านั้น**
   * รอบ 2 เป็นต้นไป `carry` = 0 เสมอ (ข้อสรุปจากผู้ใช้)
   */
  const isFirstPeriod = useMemo(() => {
    if (!record) return false;
    const { app, link } = record;
    return app.companies
      .filter((c) => c.id === link.id)
      .every((c) => c.recordId >= link.recordId);
  }, [record]);

  /**
   * **ชั่วโมงคงเหลือที่จะทบ** — มีก็ต่อเมื่อ **เป็นรอบแรกของคู่ และ MA ยังไม่หมด**
   * (`maHours − ใช้ไป > 0`) — **ไม่สนว่าช่วงเก่าจะหมดอายุหรือยัง**: การต่ออายุปิด
   * ช่วงเก่าเสมอ ชั่วโมงที่เหลือจึงถูกใช้ในช่วงนั้นไม่ได้อีก (เดิมบังคับ `expired`
   * ก่อน → ต่ออายุวันหมดอายุพอดีทบเงียบ ๆ) · ทุกเงื่อนไข fail-open: ไม่ใช่รอบแรก /
   * ยังโหลดหรือดึง "ใช้ไป" ไม่สำเร็จ / ยังไม่กรอก MA → 0 (ไม่ทบ) · ค่าเป็นจำนวนเต็ม
   * เพราะเซิร์ฟเวอร์ reject ทศนิยม (`requireHours`) จึงปัดเศษของ "คงเหลือ" ทิ้ง
   */
  const carry = useMemo(() => {
    if (!record || !isFirstPeriod || usageStatus !== "ready") return 0;
    const link = record.link;
    if (link.maHours == null) return 0;
    const left = link.maHours - (used ?? 0);
    if (!(left > 0)) return 0;
    return Math.round(left);
  }, [record, used, usageStatus, isFirstPeriod]);

  /**
   * **ค่า MA ที่จะบันทึกจริง** — ใช้ทั้งตอนส่ง API และตอนโชว์ "ทบรวม" ใต้ช่อง
   * (ตัวเลขเดียวกับคอลัมน์ "คงเหลือ" ในตาราง สูตรดูใน docblock ด้านบน)
   */
  const typedRaw = maHours === "" ? 0 : Number(maHours);
  /** ใช้ไปที่รู้จริง — `usageStatus !== "ready"` = ยังโหลด/ดึงไม่ได้ (คิดเป็น 0) */
  const usedNow = usageStatus === "ready" ? (used ?? 0) : 0;
  const newMa =
    carry > 0
      ? typedRaw + (record?.link.maHours ?? 0)
      : typedRaw + Math.round(usedNow);

  /** ปัด1ตำแหน่ง — ตรงกับ `round1` ของตาราง (ใช้ไปมาจาก `/reports/usage` ปัดแล้ว) */
  const round1 = (n: number) => Math.round(n * 10) / 10;
  /** คงเหลือหลังบันทึก = สิ่งที่ตารางจะโชว์ — ฟอร์มสัญญาเลขนี้เป๊ะ */
  const totalAfter = round1(newMa - usedNow);
  /** ส่วนที่ "ทบจากช่วงก่อน" = รวม − ที่พิมพ์ (บวกกันได้พอดีเสมอ) */
  const carryShown = round1(totalAfter - typedRaw);

  /** สถานะอายุที่ชิปจะโชว์ — คำนวณสดทุกครั้งที่ผู้ใช้แก้วันที่ */
  const status = previewExpiryStatus(expiresAt);
  const chip = expiryChipLabel(status, daysLeftIso(expiresAt));

  async function handleSave() {
    if (!record) return;

    // ตรวจทีละช่องแล้วโชว์พร้อมกัน — กันต้องกดซ้ำ 3 รอบ
    const next: FieldErrors = {
      startedAt: startedAt ? null : t("renewStartRequired"),
      expiresAt: expiresAt ? null : t("renewExpiresRequired"),
      maHours: maHours !== "" ? null : t("renewMaRequired"),
    };
    if (!next.startedAt && !next.expiresAt && expiresAt <= startedAt) {
      next.expiresAt = t("renewRangeInvalid");
    }
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    setSaving(true);
    try {
      await renewAppRecord(record.app.id, record.link.recordId, {
        startedAt,
        expiresAt,
        // ช่วงใหม่ = สูตรเดียวกับที่โชว์ใต้ช่อง (ดู `newMa` ใน docblock) —
        // ทำให้ "คงเหลือ" ในตารางเท่ากับ "ทบรวมเป็น …" ที่ฟอร์มสัญญาไว้
        maHours: newMa,
        /**
         * **ชั่วโมงที่ทบมา** — ส่งไปเก็บ (`app_companies.carried_hours`) เพื่อให้
         * ป๊อปอัพโชว์ย้อนหลังได้ · `carryShown` เป็นเศษได้ (used เป็นทศนิยม) จึง
         * ปัดเป็นจำนวนเต็ม · **ต้อง gate ด้วย `carry`**: เมื่อไม่ทบ `carryShown`
         * จะเป็นเศษค้าง (เช่น 0.5) จากรูตร `maHours = ที่พิมพ์ + ใช้ไป` → ส่ง 0
         * (เซิร์ฟเวอร์เก็บเป็น `NULL` = แถวนี้ไม่ทบ)
         */
        carriedHours: carry > 0 ? Math.round(carryShown) : 0,
      });
      notify(t("renewSuccess"));
      onClose();
      onSaved();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {/* หัวเรื่อง + ปุ่มปิด (X) ชิดขวา — แบบเดียวกับป๊อปอัพรายละเอียด */}
        <Box component="span" sx={{ flexGrow: 1 }}>
          {t("renewTitle")}
        </Box>
        <Button onClick={onClose} size="small" sx={{ minWidth: 32, px: 1 }}>
          ✕
        </Button>
      </DialogTitle>

      <DialogContent sx={{ overflowY: "auto" }}>
        {record && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            {/* "บริษัท X · APP" — ยืนยันว่ากำลังต่ออายุคู่ไหน (ฟอร์มเปลี่ยนไม่ได้) */}
            <Typography variant="body2" color="text.secondary" sx={{ mt: -0.5 }}>
              {[record.link.name, record.app.name].filter(Boolean).join(" · ")}
            </Typography>

            {/* วันที่ 2 ช่องต้องอยู่ใน `LocalizationProvider` — MUI X ไม่มี context
                จะโยน "Can not find the date and time pickers localization context"
                (locale ไทยใช้ adapterLocale "th" เหมือนฟอร์มแก้ไขแอป) */}
            <LocalizationProvider
              dateAdapter={AdapterDayjs}
              adapterLocale={locale === "th" ? "th" : undefined}
            >
              <DatePicker
                label={t("renewStartAt")}
                value={startedAt ? dayjs(startedAt) : null}
                onChange={(next) => {
                  setStartedAt(next ? next.format("YYYY-MM-DD") : "");
                  setErrors((e) => ({ ...e, startedAt: null, expiresAt: null }));
                }}
                format="DD/MM/YYYY"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true,
                    error: Boolean(errors.startedAt),
                    helperText: errors.startedAt,
                  },
                }}
              />
              {/* ไม่มี `mt` — `gap: 2` ของกล่องแม่เป็นตัวเว้นคนเดียว
                  (`LocalizationProvider` ไม่สร้าง DOM จึงกลายเป็น flex child ตรง ๆ) */}
              <DatePicker
                label={t("renewExpiresAt")}
                value={expiresAt ? dayjs(expiresAt) : null}
                onChange={(next) => {
                  setExpiresAt(next ? next.format("YYYY-MM-DD") : "");
                  setErrors((e) => ({ ...e, expiresAt: null }));
                }}
                format="DD/MM/YYYY"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true,
                    error: Boolean(errors.expiresAt),
                    helperText: errors.expiresAt,
                  },
                }}
              />
            </LocalizationProvider>

            {/* จำนวน MA ของช่วงใหม่ — ช่อง**ปล่อยว่าง**ให้กรอกเอง (ไม่ prefill
                ตัวเลขเก่า) · ถ้าเป็น**รอบแรกของคู่**และ MA ยังไม่หมด ระบบ**บอกจำนวน
                คงเหลือเป็นตัวเลข**ตรงนี้แล้วทบให้อัตโนมัติตอนบันทึก (รอบ 2 เป็น
                ต้นไปไม่ทบ — บอกเหตุผลใต้ช่องแทน) */}
            <Box>
              <TextField
                label={t("renewMaHours")}
                type="number"
                value={maHours}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setMaHours(e.target.value);
                  setErrors((e2) => ({ ...e2, maHours: null }));
                }}
                fullWidth
                required
                error={Boolean(errors.maHours)}
                helperText={errors.maHours}
                inputProps={{ min: 0, step: 1 }}
                InputProps={{
                  endAdornment: (
                    <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                      {t("hoursUnit")}
                    </Typography>
                  ),
                }}
              />
              {/* บรรทัดบอกใต้ช่อง — ต้อง**ไม่เงียบ**เรื่องการทบ เพราะ "ทำไมไม่เพิ่ม"
                  คือคำถามแรกของผู้ใช้ทุกครั้ง: โหลดอยู่ / ดึงไม่สำเร็จ / รอบแรกแต่
                  ใช้หมด / รอบ 2 เป็นต้นไป (ไม่ทบตามกติกา) / มีให้ทบ (พร้อมตัวเลข
                  ที่จะได้รวม) */}
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, mt: 0.75 }}>
                {usageStatus === "loading" && (
                  <Typography variant="caption" color="text.secondary">
                    {t("renewUsageLoading")}
                  </Typography>
                )}
                {usageStatus === "error" && (
                  <Typography variant="caption" color="warning.main">
                    {t("renewUsageUnknown")}
                  </Typography>
                )}
                {/* รอบ 2 เป็นต้นไป — ไม่ทบไม่ว่าเหลือเท่าไร (กติกา "ครั้งแรกเท่านั้น") */}
                {usageStatus === "ready" && !isFirstPeriod && (
                  <Typography variant="caption" color="text.secondary">
                    {t("renewNoCarryLater")}
                  </Typography>
                )}
                {usageStatus === "ready" && isFirstPeriod && carry > 0 && (
                  <Typography variant="caption" color="primary.main">
                    {t("renewCarryOver", { n: carryShown, total: totalAfter })}
                  </Typography>
                )}
                {usageStatus === "ready" &&
                  isFirstPeriod &&
                  carry === 0 &&
                  record?.link.maHours != null && (
                    <Typography variant="caption" color="text.secondary">
                      {t("renewNoCarry")}
                    </Typography>
                  )}
              </Box>
            </Box>

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
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t("cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          // ห้ามบันทึกตอนยังโหลด "ใช้ไป" — ไม่งั้นคงเหลือถูกอ่านเป็น 0 แล้วทบผิด
          disabled={saving || usageStatus === "loading"}
        >
          {t("renewSave")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
