"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
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
import { ApiError } from "@/lib/api";
import { buyAppHours, type App, type AppCompanyLink } from "@/lib/apps-api";
import { useNotification } from "@/components/notification";

/** แถบที่กำลังซื้อชั่วโมง — ส่งมาจากตาราง `/systems` (1 แถบ = 1 ช่วงล่าสุดของคู่) */
export interface BuyingRecord {
  app: App;
  link: AppCompanyLink;
}

/** ปุ่มจำนวนสำเร็จรูปใต้ช่องกรอก — คลิกแล้วใส่จำนวนนั้นให้ (ผู้ใช้แก้ต่อได้เอง) */
const PRESET_HOURS = [10, 20, 50];

/** ปัดเศษ "ใช้ไป/คงเหลือ" ทศนิยม 1 ตำแหน่ง — ตรงกับ `round1` ของตาราง `/systems` */
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * ฟอร์ม **ซื้อชั่วโมง MA เพิ่ม** — ป๊อปอัพที่หน้า `/systems` เท่านั้น
 *
 * ต่างจาก `RenewFormDialog` (ต่ออายุ) ตรงที่:
 * - กรอกมา**แค่จำนวนชั่วโมง** — วันที่สัญญา**คงเดิมทุกประการ** (ฝั่งเซิร์ฟเวอร์
 *   คัดลอก `startedAt`/`expiresAt` จากแถวนั้นแล้ว append แถบใหม่)
 * - แถบใหม่ได้ `kind = 'buy'` → แท็บ "ประวัติการต่ออายุ" แยกออกว่าเป็นการซื้อ
 * - ปุ่มเปิดเฉพาะแถวที่คงเหลือ ≤ 0 (`canBuyHours()` ในหน้า `/systems`) —
 *   ซื้อแล้วคงเหลือ > 0 ปุ่มจะหายเองในโหลดถัดไป
 *
 * ค่าเริ่มต้น: ช่องว่าง (ผู้ใช้กรอกเอง) — ไม่ prefill เพราะ "ซื้อกี่ชม."
 * เป็นการตัดสินใจของผู้ใช้ ไม่ใช่ค่าคำนวณจากสัญญาเดิม
 *
 * **ช่วยตัดสินใจว่าจะซื้อกี่ชม.** — กล่องสรุปโชว์ 3 ตัวเลขของคู่นี้ (MA ปัจจุบัน /
 * ใช้ไป / คงเหลือ — ตัวเดียวกับตาราง ผ่าน `used` + `usageStatus` จากหน้า), ระหว่าง
 * พิมพ์โชว์สด "MA รวมหลังซื้อ" กับ "คงเหลือหลังซื้อ" (`คงเหลือเดิม + ที่ซื้อ` —
 * "ใช้ไป" ไม่เปลี่ยนตอนซื้อ), และมีปุ่มด่วน 10/20/50 ใต้ช่องกรอก · ข้อความ intro
 * ย้ำว่า **บวกกับ MA เดิม ไม่ใช่การต่ออายุ**
 *
 * **สถานะข้อมูล "ใช้ไป" ต้องไม่เงียบ**: ยังโหลด → ตัวเลขโชว์ "…", ดึงไม่สำเร็จ →
 * "—" พร้อมคำเตือนใต้กล่อง — ตัวเลขพวกนี้**ใช้แค่ประกอบการตัดสินใจ** ไม่ป้อนกลับ
 * ตอนบันทึก (เซิร์ฟเวอร์บวก `maHours` เดิม + ที่ซื้ออย่างเดียว) จึง**ไม่ปิดปุ่ม
 * บันทึก**ตอนโหลด ต่างจากฟอร์มต่ออายุที่ต้องรู้คงเหลือเพื่อทบชั่วโมง
 */
export default function BuyHoursDialog({
  open,
  record,
  used,
  usageStatus,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null = ไม่มีอะไรให้ซื้อ (ปิดตัวเอง) */
  record: BuyingRecord | null;
  /**
   * "ใช้ไป" ของคู่นี้จากหน้า `/systems` (`usedByApp`) — ตัวเดียวกับคอลัมน์
   * "คงเหลือ" ในตาราง จึงทำให้ number ที่โชว์ในฟอร์มตรงกับที่เห็นข้างนอก
   * `undefined` = คู่นี้ไม่มีงานที่หักได้ (= ใช้ 0 ชม. ตามกติกา)
   */
  used?: number | null;
  /**
   * สถานะการดึง "ใช้ไป" ของหน้า — เลือก placeholder/คำเตือนใต้กล่องสรุป
   * (`"loading"` → "…", `"error"` → "—" + คำเตือน, `"ready"` → ตัวเลขจริง)
   */
  usageStatus: "loading" | "ready" | "error";
  onClose: () => void;
  /** เรียกหลังบันทึกสำเร็จ — ให้ผู้เรียกดึงรายการใหม่เอง */
  onSaved: () => void;
}) {
  const t = useTranslations("Settings");
  const { notify } = useNotification();

  const [hours, setHours] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** เปิดใหม่ = เคลียร์ช่องกรอก (ค่าเริ่มต้นว่าง — ดูเหตุผลใน docblock) */
  useEffect(() => {
    if (!open) return;
    setHours("");
    setError(null);
    setSaving(false);
  }, [open]);

  const unit = t("hoursUnit");
  /** MA ของแถวนี้ (`null` = ยังไม่เคยกรอก — เซิร์ฟเวอร์ตอนซื้อนับเป็น 0) */
  const current = record?.link.maHours ?? 0;
  const usageReady = usageStatus === "ready";
  /** ยังรู้ค่า "ใช้ไป" ไม่ได้ — "…" ตอนโหลด / "—" ตอนดึงไม่สำเร็จ */
  const usagePlaceholder = usageStatus === "error" ? "—" : "…";
  /** ใช้ไป (ชม.) — `null` = ยังไม่รู้ (ดู `usagePlaceholder`) */
  const usedNum = usageReady ? round1(used ?? 0) : null;
  /** คงเหลือตอนนี้ = MA ของแถวนี้ − ใช้ไป (อาจติดลบ เหมือนคอลัมน์ตาราง) */
  const remainingNow = usageReady ? round1(current - (used ?? 0)) : null;

  const parsed = hours.trim() === "" ? null : Number(hours);
  /** ตัวเลขที่จะบันทึกได้จริง — จำนวนเต็ม > 0 (ตรงกับฝั่งเซิร์ฟเวอร์) */
  const validHours = parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  /** preview "MA รวมหลังซื้อ" — แสดงสดขณะพิมพ์ (ฝั่งเซิร์ฟเวอร์เป็นคนจริงตอนบันทึก) */
  const totalAfter = validHours !== null ? current + validHours : null;
  /** preview "คงเหลือหลังซื้อ" — = คงเหลือตอนนี้ + ที่ซื้อ ("ใช้ไป" ไม่เปลี่ยนตอนซื้อ) */
  const remainingAfter =
    validHours !== null && remainingNow !== null ? round1(remainingNow + validHours) : null;

  async function handleSave() {
    if (!record || saving) return;

    if (hours.trim() === "") {
      setError(t("buyHoursRequired"));
      return;
    }
    if (validHours === null) {
      setError(t("buyHoursInvalid"));
      return;
    }

    setSaving(true);
    try {
      await buyAppHours(record.app.id, record.link.recordId, { hours: validHours });
      notify(t("buyHoursSuccess"));
      onClose();
      onSaved();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : t("genericError"), "error");
      setSaving(false);
    }
  }

  /** แถวตัวเลข (กล่องสรุป + preview) — label ซ้าย ค่าขวา (`strong` = ตัวหนา) */
  const statRow = (label: string, value: string, strong = false) => (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={strong ? 700 : undefined}>
        {value}
      </Typography>
    </Box>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {/* หัวเรื่อง + ปุ่มปิด (X) ชิดขวา — แบบเดียวกับฟอร์มต่ออายุ */}
        <Box component="span" sx={{ flexGrow: 1 }}>
          {t("buyHoursTitle")}
        </Box>
        <Button onClick={onClose} size="small" sx={{ minWidth: 32, px: 1 }}>
          ✕
        </Button>
      </DialogTitle>

      <DialogContent sx={{ overflowY: "auto" }}>
        {record && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            {/* "บริษัท X · APP" — ยืนยันว่ากำลังซื้อให้คู่ไหน (ฟอร์มเปลี่ยนไม่ได้) */}
            <Typography variant="body2" color="text.secondary" sx={{ mt: -0.5 }}>
              {[record.link.name, record.app.name].filter(Boolean).join(" · ")}
            </Typography>

            {/* ย้ำตั้งแต่บรรทัดแรกว่า "บวกกับ MA เดิม ไม่ใช่ต่ออายุ" */}
            <Typography variant="caption" color="text.secondary">
              {t("buyHoursIntro")}
            </Typography>

            {/* กล่องสรุป 3 ตัวเลข — ตอบคำถาม "ซื้อกี่ชม. ดี?" ด้วยข้อมูลชุดเดียวกับ
                คอลัมน์ MA/คงเหลือ ในตาราง `/systems` (ค่า `used` มาจากหน้านั้น) */}
            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                px: 1.5,
                py: 1,
                display: "flex",
                flexDirection: "column",
                gap: 0.5,
              }}
            >
              {statRow(t("buyHoursCurrent"), `${current} ${unit}`)}
              {statRow(t("usedLabel"), usedNum !== null ? `${usedNum} ${unit}` : usagePlaceholder)}
              {statRow(
                t("columnRemaining"),
                remainingNow !== null ? `${remainingNow} ${unit}` : usagePlaceholder,
                true,
              )}
              {/* ต้องไม่เงียบเรื่องตัวเลข "ใช้ไป" — ดู docblock ว่าทำไมไม่ปิดปุ่มบันทึก */}
              {usageStatus === "loading" && (
                <Typography variant="caption" color="text.secondary">
                  {t("buyHoursUsageLoading")}
                </Typography>
              )}
              {usageStatus === "error" && (
                <Typography variant="caption" color="warning.main">
                  {t("buyHoursUsageUnknown")}
                </Typography>
              )}
            </Box>

            <TextField
              label={t("buyHoursInput")}
              type="number"
              value={hours}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setHours(e.target.value);
                setError(null);
              }}
              fullWidth
              required
              autoFocus
              error={Boolean(error)}
              helperText={error}
              inputProps={{ min: 1, step: 1 }}
              InputProps={{
                endAdornment: (
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                    {unit}
                  </Typography>
                ),
              }}
            />

            {/* ปุ่มจำนวนสำเร็จรูป — คลิกแทนพิมพ์ (พิมพ์ทับ/แก้ได้เองทุกเมื่อ) */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: -1 }}>
              <Typography variant="caption" color="text.secondary">
                {t("buyHoursPresets")}
              </Typography>
              {PRESET_HOURS.map((n) => (
                <Chip
                  key={n}
                  label={`+${n}`}
                  size="small"
                  clickable
                  color={validHours === n ? "primary" : "default"}
                  variant={validHours === n ? "filled" : "outlined"}
                  onClick={() => {
                    setHours(String(n));
                    setError(null);
                  }}
                />
              ))}
            </Box>

            {/* preview สดขณะพิมพ์ — MA รวม (รู้ได้เสมอ) + คงเหลือหลังซื้อ (ต้องรู้ "ใช้ไป") */}
            {(totalAfter !== null || remainingAfter !== null) && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {totalAfter !== null &&
                  statRow(t("buyHoursPreview"), `${current} → ${totalAfter} ${unit}`)}
                {remainingAfter !== null &&
                  remainingNow !== null &&
                  statRow(
                    t("buyHoursRemainingAfter"),
                    `${remainingNow} → ${remainingAfter} ${unit}`,
                    true,
                  )}
              </Box>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {t("cancel")}
        </Button>
        {/* **ไม่ disable ตอน `usageStatus === "loading"`** — ตัวเลข "ใช้ไป" เป็นแค่
            ข้อมูลประกอบการตัดสินใจ ไม่ได้ป้อนกลับตอนบันทึก (ต่างจากฟอร์มต่ออายุ) */}
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {t("buyHoursSave")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
