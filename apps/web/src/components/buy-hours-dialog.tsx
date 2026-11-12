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
import {
  buyAppHours,
  deleteAppPeriod,
  latestPeriodId,
  type App,
  type AppCompanyLink,
} from "@/lib/apps-api";
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
 * **ทบสิทธิ์คงเหลือของแถวก่อนเข้าแถวใหม่** (ข้อสรุปจากผู้ใช้: "มันเป็นช่วงเดียวกัน
 * แต่แค่ซื้อชั่วโมง") — `carry = max(0, MA แถวนั้น − ใช้ไปของแถวนั้น)` (สูตรเดียวกับ
 * ฟอร์มต่ออายุ) แล้วส่ง `carriedHours` ให้เซิร์ฟเวอร์ตั้ง `maHours = ที่ซื้อ + ทบ`
 * · **ต่างจากต่ออายุ**: การซื้อทบ**ทุกครั้ง** (ไม่จำกัดเฉพาะรอบแรก) เพราะทุกแถว
 * ซื้ออยู่ช่วงสัญญาเดียวกัน · แถวนั้นใช้หมด → ทบ 0 (มีข้อความบอกใต้ preview)
 *
 * **ช่วยตัดสินใจว่าจะซื้อกี่ชม.** — กล่องสรุปโชว์ 3 ตัวเลขของแถวนั้น (MA ปัจจุบัน /
 * ใช้ไป**ของแถวนั้น** / คงเหลือ — ตัวเดียวกับตาราง ผ่าน `used` + `usageStatus` จาก
 * หน้า), ระหว่างพิมพ์โชว์สด "MA หลังซื้อ" (= ที่ซื้อ + ทบ) กับ "คงเหลือหลังซื้อ"
 * (เท่ากัน เพราะ**แถวใหม่ใช้ไป = 0**) พร้อมลูกศรจาก "คงเหลือตอนนี้" · มีปุ่มด่วน
 * 10/20/50 ใต้ช่องกรอก · ข้อความ intro ย้ำว่า **ได้ MA = ที่ซื้อ + คงเหลือจาก
 * แถวก่อน (ไม่ใช่การต่ออายุ)**
 *
 * **สถานะข้อมูล "ใช้ไป" ต้องไม่เงียบ**: ยังโหลด → ตัวเลขโชว์ "…", ดึงไม่สำเร็จ →
 * "—" พร้อมคำเตือนใต้กล่อง · **ปุ่มบันทึก disable ตอนโหลด** เพราะต้องรู้ค่าเพื่อ
 * ทบชั่วโมง (เดิมกดได้ทันที — ถ้าปล่อยบันทึกตอนโหลด `carry` จะเป็น 0 แล้วชั่วโมง
 * คงเหลือหายเงียบ) · ดึงไม่สำเร็จ → บันทึกได้โดยไม่ทบ + บอกตรง ๆ (`buyHoursUsageUnknown`)
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
   * "ใช้ไป" **รายรอบของแถวนั้น** จากหน้า `/systems` (`periodUsedOf`) — ตัวเดียวกับ
   * คอลัมน์ "คงเหลือ" ของแถวนั้น จึงทำให้ number ที่โชว์ในฟอร์มตรงกับที่เห็น
   * ข้างนอก `undefined` = ยังไม่มีข้อมูล (ดู `usageStatus`)
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
  /**
   * MA ของแถวนั้น — ใช้ทั้งโชว์ "ชั่วโมง MA ปัจจุบัน" ในกล่องสรุป **และคำนวณ
   * `carry`** (สิทธิ์คงเหลือที่จะทบเข้าแถวใหม่)
   */
  const current = record?.link.maHours ?? 0;
  const usageReady = usageStatus === "ready";
  /** ยังรู้ค่า "ใช้ไป" ไม่ได้ — "…" ตอนโหลด / "—" ตอนดึงไม่สำเร็จ */
  const usagePlaceholder = usageStatus === "error" ? "—" : "…";
  /** ใช้ไป (ชม.) **ของแถวนั้น** (รายรอบ) — `null` = ยังไม่รู้ (ดู `usagePlaceholder`) */
  const usedNum = usageReady ? round1(used ?? 0) : null;
  /** คงเหลือตอนนี้ = MA ของแถวนี้ − ใช้ไป**ของรอบนี้** (อาจติดลบ เหมือนตาราง) */
  const remainingNow = usageReady ? round1(current - (used ?? 0)) : null;
  /**
   * **สิทธิ์คงเหลือของแถวก่อนที่จะทบเข้าแถวใหม่** = `max(0, MA แถวนั้น − ใช้ไป
   * ของแถวนั้น)` — สูตรเดียวกับฟอร์มต่ออายุ · ยังโหลด/ดึงไม่ได้ → 0 (แต่ปุ่มบันทึก
   * ถูก disable ตอนโหลดอยู่แล้ว จึงไม่มีทางบันทึกตอนยังไม่รู้ค่า) · แถวนั้นใช้
   * หมด → 0 (ไม่ทบ — มีข้อความบอกใต้ preview)
   */
  const carry = usageReady ? Math.max(0, Math.round(current - (used ?? 0))) : 0;

  const parsed = hours.trim() === "" ? null : Number(hours);
  /** ตัวเลขที่จะบันทึกได้จริง — จำนวนเต็ม > 0 (ตรงกับฝั่งเซิร์ฟเวอร์) */
  const validHours = parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  /**
   * preview "MA หลังซื้อ" — **= ที่ซื้อ + ทบ** (สูตรของ `buyHours()`:
   * `maHours = ที่ซื้อ + carriedHours`) · แสดงสดขณะพิมพ์ (ค่าจริงฝั่งเซิร์ฟเวอร์ตอนบันทึก)
   */
  const totalAfter = validHours !== null ? round1(validHours + carry) : null;
  /**
   * preview "คงเหลือหลังซื้อ" — **เท่ากับ "MA หลังซื้อ"** เพราะแถวใหม่เพิ่งถูกสร้าง →
   * ยังไม่มีงานไหนถูกผูกเข้าแถว ("ใช้ไป" ของแถวใหม่ = 0 เสมอ) · โชว์พร้อมลูกศร
   * จาก "คงเหลือตอนนี้" ให้เห็นว่าซื้อแล้วขึ้นเท่าไร (เช่น `0 → 70 ชม.`)
   */
  const remainingAfter = totalAfter;

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
      const appId = record.app.id;
      const updated = await buyAppHours(appId, record.link.recordId, {
        hours: validHours,
        // **สิทธิ์คงเหลือของแถวก่อน** ที่ฟอร์มคำนวณไว้ — เซิร์ฟเวอร์บวกเป็น MA ใหม่
        carriedHours: carry,
      });
      /**
       * แถบที่เพิ่ง append — แนบปุ่ม **"ยกเลิกรายการ"** บน toast ให้ลบแถวนี้ทิ้ง
       * ได้เลย (1 คลิก ไม่ยืนยัน · เหตุผลเดียวกับฟอร์มต่ออายุ) · หาแถวไม่เจอ
       * → ไม่แนบปุ่ม
       */
      const newPeriodId = latestPeriodId(updated, record.link.id);
      notify(
        t("buyHoursSuccess"),
        "success",
        newPeriodId === null
          ? undefined
          : {
              label: t("undo"),
              onClick: () => {
                void deleteAppPeriod(appId, newPeriodId)
                  .then(() => {
                    notify(t("undoSuccess"));
                    onSaved();
                  })
                  .catch((err: unknown) =>
                    notify(err instanceof ApiError ? err.message : t("genericError"), "error"),
                  );
              },
            },
      );
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

            {/* preview สดขณะพิมพ์ — MA หลังซื้อ (ที่ซื้อ + ทบ) + คงเหลือหลังซื้อ (เท่ากัน) */}
            {(totalAfter !== null || remainingAfter !== null) && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {totalAfter !== null && statRow(t("buyHoursPreview"), `${totalAfter} ${unit}`)}
                {remainingAfter !== null &&
                  remainingNow !== null &&
                  statRow(
                    t("buyHoursRemainingAfter"),
                    `${remainingNow} → ${remainingAfter} ${unit}`,
                    true,
                  )}
                {/* แถวนั้นมี MA แต่ใช้หมด → ทบ 0 — **บอกตรง ๆ** ไม่เงียบ (แบบฟอร์มต่ออายุ) */}
                {usageReady && carry === 0 && current > 0 && validHours !== null && (
                  <Typography variant="caption" color="text.secondary">
                    {t("buyNoCarry")}
                  </Typography>
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
        {/* **disable ตอน `usageStatus === "loading"`** — ต้องรู้ "ใช้ไป" ของแถวนั้น
            เพื่อคำนวณ `carry` (สิทธิ์คงเหลือที่ทบเข้าแถวใหม่) ถ้าปล่อยบันทึกตอน
            โหลด `carry` จะเป็น 0 แล้วชั่วโมงคงเหลือหายเงียบ · ดึงไม่ได้ → บันทึก
            ได้โดยไม่ทบ + คำเตือนใต้กล่อง (ต่างจากฟอร์มต่ออายุที่ห้ามบันทึกเลย) */}
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || usageStatus === "loading"}
        >
          {t("buyHoursSave")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
