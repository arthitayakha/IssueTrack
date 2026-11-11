"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import type { App, AppCompanyLink, UsageCount } from "@/lib/apps-api";
import { fetchUsageCounts } from "@/lib/apps-api";
import { periodUsedOf } from "@/lib/reports-api";
import SystemDeductionsDialog, { type DeductionTarget } from "./system-deductions-dialog";
import {
  daysLeftIso,
  expiryChipLabel,
  expiryColor,
  formatDay,
} from "@/lib/app-expiry";

/** แถวที่เปิดป๊อปอัพอยู่ — 1 คู่ แอป×บริษัท (ช่วงล่าสุดที่โชว์ในตาราง) */
export interface DetailRecord {
  app: App;
  link: AppCompanyLink;
}

/**
 * ป๊อปอัพ **รายละเอียดระบบ** — แทนหน้ารายละเอียดเต็มหน้า (ตามข้อตกลง:
 * "หน้ารายละเอียดคือเป็นป๊อปอัพ") เปิดจากปุ่ม 🕐 ในคอลัมน์การจัดการ
 *
 * **layout เป็น "การ์ด" ใบเดียวครอบทั้ง 2 แท็บ** (ตามรูปตัวอย่าง) เพื่อให้
 * ข้อมูลทั่วไปกับประวัติการต่ออายุ**เท่ากัน**:
 *
 * ```
 * ┌ การ์ด (กรอบ) ────────────────────────────┐
 * │ POS                         [หมดอายุ]     │  ← หัวการ์ด: ชื่อแอป + ชื่อบริษัท
 * │ บริษัท ครัวบ้านสวน จำกัด                  │     + ชิปสถานะชิดขวา
 * │ ─────────────────────────────────────── │
 * │  (เนื้อหาต่อแท็บ — ต่างกันแค่ตรงนี้)       │
 * │ ─────────────────────────────────────── │
 * │ [           ต่ออายุ MA            ]      │  ← ปุ่มเต็มความกว้าง ท้ายการ์ด
 * └─────────────────────────────────────────┘
 * ```
 *
 * เนื้อหาแต่ละแท็บ:
 * - **ข้อมูลทั่วไป** — วันที่ 2 ช่อง (มีเส้นตั้งคั่น) แล้วแถว label/value
 *   (ชั่วโม์ MA ทั้งหมด / ใช้ไป / คงเหลือ) คั่นด้วยเส้นแนวนอน
 * - **ประวัติการต่ออายุ** — ทุกช่วงของคู่เดียวกัน เรียงใหม่สุดก่อน
 *   คอลัมน์: **รอบที่** / ประเภท / เริ่มใช้งาน / หมดอายุ / ชั่วโม์ MA / ใช้ไป /
 *   คงเหลือ / **รายการที่ตัด** (ปุ่ม**เปิดป๊อปอัพแยกใบ** `SystemDeductionsDialog`
 *   ของรอบนั้น — เดิมเป็นแท็บที่ 3 ข้างใน ถูกย้ายออกตามข้อสรุป "dropdown ใหญ่
 *   ไป ไม่สวย … ดูได้จากลิงก์พวกนี้") — **ไม่มีหมายเหตุ** (ตัดออกตามข้อตกลง) ·
 *   ตาราง scroll ในตัว (sticky header)
 *
 * **ไม่มีแท็บที่ 3 แล้ว** — "งานที่ถูกตัด MA" เปิดจากลิงก์ในคอลัมน์
 * "รายการที่ตัด" → ป๊อปอัพ `SystemDeductionsDialog` ซ้อนบนใบเดิม (state
 * `deductionsTarget`) · ข้อมูล 2 แท็บแรกมาจาก payload ที่หน้าโหลดไว้แล้ว
 * (`GET /systems`) + **"ใช้ไป" รายรอบ** ที่อ่านจาก `GET /apps/usage-counts`
 * — ยิง**ครั้งเดียวตอนเปิดป๊อปอัพ** แล้วใช้ร่วมกันทั้ง "รายการที่ตัด" และ
 * "ใช้ไป/คงเหลือ" ของทุกรอบ (ไม่ยิงเพิ่ม)
 *
 * ขนาด **ฟิกคงที่ทุกแท็บ** (`PaperProps` ด้านล่าง) — เดิมใช้ `maxWidth="md"
 * fullWidth` ทำให้กล่องหด/ขยายตามเนื้อหา สลับแท็บแล้วขยับ
 */
export default function SystemDetailDialog({
  open,
  record,
  /** false = แถวไม่เข้าเกณฑ์ต่ออายุ/ไม่มีสิทธิ์ → ซ่อนปุ่มท้ายการ์ด */
  canRenew,
  /** เปิดฟอร์มต่ออายุของคู่นี้ */
  onRenew,
  onClose,
}: {
  open: boolean;
  /** null = ยังไม่ได้เลือกแถว ( Dialog ปิดอยู่ ) */
  record: DetailRecord | null;
  canRenew: boolean;
  onRenew: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const [tab, setTab] = useState(0);

  /**
   * ป๊อปอัพ **"งานที่ถูกตัด MA"** ที่เปิดซ้อนอยู่ — `null` = ปิด · ตั้งค่าโดย
   * ลิงก์ "N รายการ" ในคอลัมน์ "รายการที่ตัด" ของแท็บประวัติ (ส่งข้อมูลรอบนั้น
   * ครบ: recordId / ลำดับ / ประเภท / ทบมา) — **ไม่มีแท็บที่ 3 ในใบเดิมแล้ว**
   */
  const [deductionsTarget, setDeductionsTarget] = useState<DeductionTarget | null>(null);

  /** จำนวนรายการที่ถูกตัดของทุกรอบในคู่นี้ — ยิงครั้งเดียวตอนเปิดป๊อปอัพ */
  const [counts, setCounts] = useState<Map<number, UsageCount> | null>(null);
  const countsSeq = useRef(0);

  /**
   * เปิดแถวใหม่ = กลับไปแท็บแรกเสมอ — ไม่งั้นปิดแถวที่ดูประวัติอยู่ แล้วเปิด
   * อีกแถว จะโผล่แท็บประวัติของคนละคู่ (component ไม่ unmount เพราะผู้เรียก
   * ส่ง `record=null` แทนการถอดออกจาก tree)
   */
  useEffect(() => {
    if (open) {
      setTab(0);
      setDeductionsTarget(null);
    }
  }, [open, record?.link.recordId]);

  /**
   * `countKey` = recordIds ของทุกแถวในคู่นี้ — **primitive** จึงใช้เป็น dep ได้
   * โดยไม่ต้องพึ่ง object `record` ที่เปลี่ยน identity ทุก render (ไม่งั้นจะยิง
   * `GET /apps/usage-counts` ซ้ำไม่หยุด) · เปลี่ยนเมื่อคู่มีแถวใหม่/แถวถูกลบเท่านั้น
   */
  const countKey = record
    ? record.app.companies
        .filter((row) => row.id === record.link.id)
        .map((row) => row.recordId)
        .join(",")
    : "";

  useEffect(() => {
    if (!open || countKey === "") {
      setCounts(null);
      return;
    }
    const ids = countKey.split(",").map((value) => Number.parseInt(value, 10));
    const mine = ++countsSeq.current;
    setCounts(null);
    fetchUsageCounts(ids)
      .then((list) => {
        if (mine !== countsSeq.current) return;
        setCounts(new Map(list.map((item) => [item.recordId, item])));
      })
      .catch(() => {
        if (mine !== countsSeq.current) return;
        // fail-open: ดึงไม่ได้ → คอลัมน์โชว์ `—` ไม่ใช่ค้างที่ตัวโหลด ไม่ throw
        setCounts(new Map());
      });
  }, [open, countKey]);

  /**
   * ค่าที่คำนวณจากแถวที่เลือก — `null` = ยังไม่มีแถว (เนื้อหาจะไม่ถูกอ่าน) ·
   * `onShowDeductions` = เปิดป๊อปอัพ `SystemDeductionsDialog` ของรอบที่กด
   * (state ชุดเดียวกับ `deductionsTarget`)
   */
  const view = record
    ? buildView(record, {
        t,
        locale,
        counts,
        onShowDeductions: setDeductionsTarget,
      })
    : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      /**
       * **ขนาดฟิกคงที่ทุกแท็บ** — ความกว้าง 1000px (หัก `calc` ที่จอ `xs`) ·
       * **ความสูงฟิก** เพื่อให้ 2 แท็บ**เท่ากันเป๊ะ**ตามที่ขอ · `maxHeight: 85vh`
       * กันล้นจอสั้น · **`overflow: hidden` ที่นี่** เพื่อให้ scrollbar โผล่ที่
       * กล่องเนื้อหาตรงกลางจุดเดียว (ไม่ใช่ทั้งใบ — ไม่งั้นหัวการ์ดกับปุ่ม
       * "ต่ออายุ MA" จะเลื่อนหายไปตอนข้อมูลเยอะ)
       *
       * ความสูงต้องฟิก**ทุกขนาดจอ** (ไม่ใช่ `auto` ที่ `xs`) — ถ้าเป็น `auto`
       * flex layout ข้างในจะยืดตามเนื้อหา แล้ว `overflow: hidden` จะ**ตัดทิ้ง**
       * ส่วนที่เกินแทนที่จะให้เลื่อน
       */
      PaperProps={{
        sx: {
          width: { xs: "calc(100% - 32px)", sm: 1000 },
          maxWidth: "100%",
          height: { xs: 560, sm: 600 },
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
        <Box sx={{ flexGrow: 1 }}>{t("detailTitle")}</Box>
        <Button onClick={onClose} size="small" sx={{ minWidth: 32, px: 1 }}>
          ✕
        </Button>
      </DialogTitle>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ px: 3, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}
      >
        {/* **ไม่มีแท็บ "งานที่ถูกตัด MA" แล้ว** — เปิดจากลิงก์ในแท็บประวัติ →
            `SystemDeductionsDialog` (ป๊อปอัพแยกใบ ซ้อนบนใบนี้) */}
        <Tab label={t("tabGeneral")} />
        <Tab label={t("tabRenewHistory")} />
      </Tabs>

      {/**
       * `DialogContent` เป็น **แค่ padding box** (`overflow: hidden`) — ไม่ใช่
       * ตัวเลื่อน จุดเลื่อนจริงอยู่ที่กล่องเนื้อหาตรงกลางด้านล่าง เพราะถ้า
       * กล่องนี้เลื่อน "ทั้งใบ" หัวการ์ดกับปุ่มต่ออายุจะหายไปพร้อมกัน
       */}
      <DialogContent
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          p: 3,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {record && view && (
          /**
           * **การ์ดใบเดียว** ครอบหัว + เนื้อหา + ปุ่ม — สองแท็บเห็นกรอบ/หัว/ปุ่ม
           * เดียวกันเป๊ะ ต่างกันแค่กล่องเนื้อหาตรงกลาง (`flex: 1` ยืดเต็ม
           * ความสูงที่ฟิกไว้ จึงไม่มีช่องว่างลอย ๆ)
           */
          <Box
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              p: 2.5,
              display: "flex",
              flexDirection: "column",
              // **ฟิกเต็มความสูง** (ไม่ใช่ `minHeight: 100%`) — การ์ดต้องกิน
              // ความสูงที่เหลือทั้งหมด ไม่งั้นกล่องเนื้อหาด้านล่างจะไม่มี
              // ขอบบน/ล่างให้ scroll แล้วเนื้อหาจะล้นออกนอกการ์ด
              height: "100%",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            {/* ---- หัวการ์ด: ชื่อแอป + ชื่อบริษัท (ซ้าย) / ชิปสถานะ (ขวา) ---- */}
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                {/* ฟอนต์ปกติ — `h6` default = 500 (medium) ยังดูหนา ฟิก 400 */}
                <Typography variant="h6" sx={{ fontWeight: 400, lineHeight: 1.3 }}>
                  {view.appName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {view.companyName}
                </Typography>
              </Box>
              <Chip
                label={view.chipLabel}
                color={view.chipColor}
                size="small"
                variant="outlined"
                sx={{ flexShrink: 0 }}
              />
            </Box>

            {/* หัวการ์ด — `my: 1` (จาก 1.5) เผื่อที่ให้กล่องเนื้อหาด้านล่าง */}
            <Divider sx={{ my: 1 }} />

            {/**
             * **กล่องเนื้อหา = ตัว scroll จุดเดียวของป๊อปอัพ** (ทั้ง 2 แท็บ) —
             * ข้อมูลเยอะ (ประวัติต่ออายุหลายรอบ / กริดยาว) ก็เลื่อนในกล่องนี้
             * โดย**หัวการ์ดกับปุ่ม "ต่ออายุ MA" ค้างอยู่ที่เดิม** ไม่เลื่อนหาย
             *
             * `minHeight: 0` จำเป็น — ใน flex column ค่า default ของ `min-height`
             * คือ `auto` ทำให้ลูกยืดเกิน container แล้ว `overflow` ไม่มีผล
             * (เนื้อหาถูก `overflow: hidden` ของ Paper ตัดทิ้งเงียบ ๆ)
             */}
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {tab === 0 ? view.general : view.history}
            </Box>

            {/* ---- ปุ่มท้ายการ์ด: เท่ากันทั้ง 2 แท็บ ---- */}
            {canRenew && (
              <>
                {/* `my: 1` (จาก 1.5) — เผื่อที่ให้กล่องเนื้อหาด้านบนเลื่อนได้เต็มที่ */}
                <Divider sx={{ my: 1 }} />
                <Button variant="outlined" fullWidth onClick={onRenew}>
                  {t("renewAction")}
                </Button>
              </>
            )}
          </Box>
        )}
      </DialogContent>

      {/**
       * **ป๊อปอัพแยกใบ "งานที่ถูกตัด MA"** — เปิดซ้อนบนใบนี้จากลิงก์ "N รายการ"
       * ในแท็บประวัติ · วางเป็นลูกของ `<Dialog>` แต่ **portal ของมันไป body**
       * (DOM ทับกัน → ใบที่ mount ทีหลังอยู่บนสุด, Esc/คลิก backdrop โดนแค่ใบ
       * บนเพราะ event ไม่ผ่าน DOM ของใบล่าง) · **ปิดป๊อปอัพเดิม = ถอดลูกออกจาก
       * tree** (Modal unmount children) → ไม่มีทางทิ้งป๊อปอัพลูกค้างบนจอ
       */}
      <SystemDeductionsDialog
        target={deductionsTarget}
        onClose={() => setDeductionsTarget(null)}
      />
    </Dialog>
  );
}

/** ทุกค่าที่ JSX ต้องใช้ คำนวณครั้งเดียวจากแถวที่เลือก */
interface DetailView {
  appName: string;
  companyName: string;
  chipLabel: string;
  chipColor: ReturnType<typeof expiryColor>;
  /** แท็บ "ข้อมูลทั่วไป" */
  general: ReactNode;
  /** แท็บ "ประวัติการต่ออายุ" */
  history: ReactNode;
}

function buildView(
  record: DetailRecord,
  opts: {
    t: ReturnType<typeof useTranslations>;
    locale: string;
    /**
     * **"ใช้ไป" + "รายการที่ตัด" ของทุกรอบในคู่นี้** (`GET /apps/usage-counts`,
     * คีย์ = `recordId`) — `null` = ยังโหลดอยู่ (โชว์ `…`) · Map ที่ไม่มีคีย์นั้น
     * = ดึงไม่ได้/ไม่รู้จักแถวนั้น (โชว์ `—`) · **ใช้เป็นแหล่งของ "ใช้ไป" รายรอบ**
     * ด้วย จึงไม่ต้องส่ง `used` ระดับคู่เข้ามาอีก (ดู `usedOf`)
     */
    counts: Map<number, UsageCount> | null;
    /** เปิดป๊อปอัพแยกใบ `SystemDeductionsDialog` "งานที่ถูกตัด MA" ของรอบที่กด */
    onShowDeductions: (target: DeductionTarget) => void;
  },
): DetailView {
  const { app, link } = record;
  const { t, locale, counts, onShowDeductions } = opts;

  const caption = (text: string) => (
    <Typography variant="caption" color="text.disabled">
      {text}
    </Typography>
  );

  /** ปัดเศษ 1 ตำแหน่ง — เหมือน `round1` ของตารางหลัก */
  const round1 = (n: number) => Math.round(n * 10) / 10;

  /**
   * **"ใช้ไป" ของ "รอบนั้น"** — อ่านจาก `usage-counts` ที่ยิงตอนเปิดป๊อปอัพ
   * (คีย์เดียวกับคอลัมน์ "รายการที่ตัด") · **รายรอบ ไม่ใช่ยอดรวมคู่**
   * (ข้อสรุปจากผู้ใช้: "ยังไม่ได้ใช้เลยทำไมมีใช้ไป") — งานที่กรอก*ก่อน*รอบนั้น
   * จะถูกสร้าง = ของรอบก่อนหน้า (`pickPeriodId()`) → แถวที่เพิ่งซื้อใช้ไป 0 ·
   * `null` = ยังโหลด (`…`) หรือดึงไม่ได้ (`—`) — **ห้ามเดา 0**
   */
  const usedOf = (row: AppCompanyLink): number | null =>
    periodUsedOf(counts, row.recordId);
  /** ยังโหลดอยู่ — แยกจาก "ดึงไม่ได้" เพื่อไม่ให้ `…` กับ `—` ปนกัน */
  const usageLoading = counts === null;

  /** คงเหลือของแถวนั้น = MA ของแถวนั้น − **ใช้ไปของรอบนั้น** (สูตรเดียวกับตาราง) */
  const remainingOf = (row: AppCompanyLink): number | null => {
    const used = usedOf(row);
    if (used === null || row.maHours == null) return null;
    return round1(row.maHours - used);
  };

  /** "ใช้ไป" ของ**แถวที่เปิดอยู่** (แถว = 1 รอบ) — ใช้ในแท็บ "ข้อมูลทั่วไป" */
  const usedHours = usedOf(link);

  const chip = expiryChipLabel(link.expiryStatus, daysLeftIso(link.expiresAt ?? ""));

  /** ทุกช่วงเวลาของ **คู่เดียวกัน** (`company_id` เท่ากัน) เรียงใหม่สุดก่อน */
  const history = app.companies
    .filter((c) => c.id === link.id)
    .slice()
    .sort((a, b) => b.recordId - a.recordId);

  /* ---------------- แท็บ 1: ข้อมูลทั่วไป ---------------- */

  /**
   * แถว label ซ้าย / value ขวา — คั่นด้วยเส้นแนวนอน (แบบในรูป)
   *
   * **กระชับกว่าเดิม** (`py: 0.75` + label `caption` + value `body2`) — ผังข้อมูล
   * ทั่วไปมี 5–6 แถวหลังเพิ่มส่วนประกอบของ `maHours` ทำให้ล้นความสูงฟิกของ
   * ป๊อปอัพแล้วโผล่ scrollbar · **ใช้เฉพาะแท็บนี้** (แท็บอื่นเป็น `<Table>`)
   * จึงไม่กระทบแท็บอื่น · ปิดท้าย `strong()` ใช้ `body2` ด้วยไม่งั้นแถวรวม
   * จะสูงกว่าแถวอื่น
   */
  const infoRow = (label: string, value: ReactNode, key: string) => (
    <Fragment key={key}>
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 2,
          py: 0.75,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2">{value}</Typography>
      </Box>
      <Divider />
    </Fragment>
  );

  /** ต่อท้ายหน่วย "ชั่วโม์" — แบบช่องในรูป (`40 ชั่วโม์`) */
  const withUnit = (value: number | null, fallback: string): ReactNode =>
    value === null ? caption(fallback) : `${value} ${t("hoursUnit")}`;

  /**
   * **ชั่วโมงที่ "ซื้อเพิ่ม" ของแถวนี้** — แถว `buy` เก็บ `ma_hours = ที่ซื้อ + ทบ`
   * (`carried_hours` = สิทธิ์คงเหลือของแถวก่อน) จึง **ที่ซื้อ = ma − ทบ** · แถว
   * `renew` → `0` (ไม่ได้ซื้อ) · แถว `buy` ที่ยังไม่มี `maHours` → `null` ให้โชว์
   * `—` **ไม่เดา** · แถวเก่าที่สร้างก่อนสูตรทบ (migration `1825`) ไม่มี
   * `carriedHours` → ทบ 0 → ที่ซื้อ = ma ✅ (ตรงกับความจริงของแถวนั้น)
   */
  const purchasedOf = (row: AppCompanyLink): number | null => {
    if (row.kind !== "buy") return 0;
    if (row.maHours == null) return null;
    return round1(Math.max(0, row.maHours - (row.carriedHours ?? 0)));
  };

  /**
   * **ส่วนประกอบของ `maHours`** — ผัง "ต่ออายุ + ซื้อชั่วโมง (+ ทบมา) = ชั่วโมง
   * MA ทั้งหมด" ที่ผู้ใช้ขอ · **ไม่แตะตัวเลขหลัก**: `maHours` / ใช้ไป / คงเหลือ
   * ยังมาจากค่าเดิมทุกประการ · บรรทัดแรกเป็น *residual* (`ma − ซื้อ − ทบ`)
   * จึง**บวกกันได้พอดีเสมอ** — ต้องเป็นอย่างนั้นเพราะ `maHours` ที่ฟอร์มบันทึก
   * บางครั้งรวม "ใช้ไป" ของช่วงก่อนเข้าไปด้วย (ดูสูตร `newMa` ในฟอร์มต่ออายุ)
   * จึงแยกเป็น "จำนวนที่พิมพ์" ล้วน ๆ ไม่ได้ · **แถว `buy`**: residual จะเป็น 0
   * เสมอ (`ma = ที่ซื้อ + ทบ` และ `ซื้อ = ma − ทบ`) จึงไม่ถูกโชว์ — ดู comment ของ
   * "ส่วนประกอบ" ด้านล่าง
   */
  const carried = link.carriedHours ?? 0;
  const purchased = purchasedOf(link);
  const base =
    link.maHours == null || purchased === null
      ? null
      : Math.max(0, round1(link.maHours - purchased - carried));

  /** ปิดท้ายด้วยตัวหนา — ให้ "ผลรวม" ของผังข้างบนอ่านออกเป็นบรรทัดเดียวกัน */
  const strong = (text: string) => (
    <Typography variant="body2" fontWeight={700}>
      {text}
    </Typography>
  );

  const general = (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {/* วันที่ 2 ช่อง — label บน / value ล่าง มีเส้นตั้งคั่นกลาง */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <Box sx={{ pr: 2.5, borderRight: 1, borderColor: "divider", pb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {t("columnStartedAt")}
          </Typography>
          <Typography variant="body2">
            {link.startedAt
              ? formatDay(link.startedAt, locale)
              : caption(t("notSetYet"))}
          </Typography>
        </Box>
        <Box sx={{ pl: 2.5, pb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {t("columnExpiresAt")}
          </Typography>
          <Typography variant="body2">
            {link.expiresAt ? formatDay(link.expiresAt, locale) : caption(t("expiryNone"))}
          </Typography>
        </Box>
      </Box>
      <Divider />

      {/* ---- ส่วนประกอบ (บวกกันได้พอดีกับ "ชั่วโมง MA ทั้งหมด" ด้านล่าง) ----
           แถว `buy` **ไม่โชว์บรรทัด "ต่ออายุ"** — residual = `ma − ที่ซื้อ − ทบ` = 0
           เสมอ (`ma = ที่ซื้อ + ทบ`, `ที่ซื้อ = ma − ทบ`) จึงเหลือ "ซื้อชั่วโมง"
           (+ "ทบมาจากช่วงแรก" ถ้ามี) ซึ่งบวกกันได้พอดีกับ MA ทั้งหมด (ตามที่ขอ) */}
      {link.kind !== "buy" &&
        infoRow(
          t("renew"),
          base === null ? caption("—") : withUnit(base, ""),
          "base",
        )}
      {infoRow(
        t("kindBuy"),
        purchased === null ? caption("—") : withUnit(purchased, ""),
        "bought",
      )}
      {/* ทบมาจากช่วงแรก — แสดงเฉพาะแถวที่ทบจริง (รอบ 2+/แถว buy ไม่มีค่า → หายไป) */}
      {carried > 0 && infoRow(t("maHoursCarried"), withUnit(carried, ""), "carried")}

      {/* ---- ผลรวม ---- */}
      {infoRow(
        t("maHoursTotal"),
        link.maHours == null ? caption(t("notSetYet")) : strong(`${link.maHours} ${t("hoursUnit")}`),
        "ma",
      )}
      {infoRow(
        t("usedLabel"),
        usedHours === null ? caption(usageLoading ? "…" : "—") : withUnit(usedHours, ""),
        "used",
      )}
      {infoRow(
        t("columnRemaining"),
        remainingOf(link) === null ? caption("—") : withUnit(remainingOf(link), ""),
        "remaining",
      )}
    </Box>
  );

  /* ---------------- แท็บ 2: ประวัติการต่ออายุ ---------------- */

  const historyTable = (
    /**
     * **ไม่มี scroll ของตัวเอง** — ปล่อยให้ตารางยืดแล้วให้ "กล่องเนื้อหา
     * ตรงกลาง" เป็นตัวเลื่อนจุดเดียว (ถ้ามี 2 ชั้น จะมี scrollbar คู่กันดูรก
     * และกล่องในกล่อง scroll ไม่ลื่น)
     *
     * `stickyHeader` **ยังทำงานอยู่** — `position: sticky` อ้าง scrollport ของ
     * ancestor ที่ใกล้ที่สุด ซึ่งตอนนี้คือกล่องเนื้อหาตรงกลาง → หัวคอลัมน์
     * 8 ตัวยังค้างบนสุดตอนเลื่อนลงไปดูรอบเก่า ๆ
     */
    <TableContainer
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
      }}
    >
      <Table size="small" stickyHeader>
        <TableHead>
          {/**
           * `whiteSpace: "nowrap"` — หัวคอลัมน์ทั้ง 8 **ต้องอยู่บรรทัดเดียว**
           * (ป๊อปอัพกว้าง 1000px มีที่พอ) ไม่งั้นข้อความไทยยาวอย่าง
           * "วันที่เริ่มใช้งาน" / "รายการที่ตัด" จะตัดบรรทัดแล้วแถวสูงไม่เท่ากัน
           */}
          <TableRow>
            <TableCell sx={{ whiteSpace: "nowrap" }}>{t("historyRound")}</TableCell>
            {/* ประเภทแถว — `kind` (migration 1820): แยกแถบที่ "ซื้อชั่วโมง"
                (วันที่เท่าเดิม แต่ MA มากขึ้น) ออกจากรอบต่ออายุปกติ */}
            <TableCell sx={{ whiteSpace: "nowrap" }}>{t("historyKind")}</TableCell>
            <TableCell sx={{ whiteSpace: "nowrap" }}>{t("columnStartedAt")}</TableCell>
            <TableCell sx={{ whiteSpace: "nowrap" }}>{t("columnExpiresAt")}</TableCell>
            <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
              {t("columnMaHours")}
            </TableCell>
            <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
              {t("usedLabel")}
            </TableCell>
            <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
              {t("columnRemaining")}
            </TableCell>
            {/* **รายการที่ตัด** ของรอบนั้น — ปุ่มเปิดป๊อปอัพแยกใบของรอบที่กด */}
            <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
              {t("historyDeducted")}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {history.map((row, index) => {
            /**
             * **"รอบที่ N"** — นับจากช่วงแรก (เก่าสุด = รอบที่ 1) ไล่ขึ้นมาหา
             * ช่วงล่าสุด · `history` เรียงใหม่สุดก่อนอยู่แล้ว จึงลบ index จาก
             * ความยาวรวม
             */
            const round = history.length - index;
            /** **ใช้ไปของรอบนั้น** (รายรอบ — แถวเพิ่งซื้อ = 0) + คงเหลือของรอบนั้น */
            const used = usedOf(row);
            const remaining = remainingOf(row);
            /** จำนวนรายการที่ถูกตัดของรอบนี้ — ดูจาก `usage-counts` ที่ยิงตอนเปิด */
            const entry = counts?.get(row.recordId);
            return (
              <TableRow key={row.recordId}>
                <TableCell>{t("historyRoundValue", { n: round })}</TableCell>
                {/* ซื้อชั่วโมง = info · ต่ออายุ/เพิ่มรายการปกติ = default — ดู `kind` */}
                <TableCell>
                  <Chip
                    label={row.kind === "buy" ? t("kindBuy") : t("renew")}
                    color={row.kind === "buy" ? "info" : "default"}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  {row.startedAt
                    ? formatDay(row.startedAt, locale)
                    : caption(t("notSetYet"))}
                </TableCell>
                <TableCell>
                  {row.expiresAt ? formatDay(row.expiresAt, locale) : caption(t("expiryNone"))}
                </TableCell>
                <TableCell align="center">
                  {row.maHours != null ? row.maHours : caption(t("notSetYet"))}
                </TableCell>
                {/* ใช้ไป = **ของรอบนั้น** — คนละค่ากันทุกแถว (รายรอบ ไม่ใช่ยอดรวมคู่)
                    `…` = ยังโหลด, `—` = ดึงไม่ได้ (fail-open ห้ามเดา 0) */}
                <TableCell align="center">
                  {used === null ? caption(usageLoading ? "…" : "—") : used}
                </TableCell>
                <TableCell align="center">
                  {remaining === null ? caption(usageLoading ? "…" : "—") : remaining}
                </TableCell>
                {/* ปุ่ม**เปิดป๊อปอัพแยกใบ** "งานที่ถูกตัด MA" **ของรอบนี้** —
                    `counts === null` = ยังโหลด (`…`), Map ไม่มีคีย์ = ดึงไม่ได้
                    (`—`, fail-open) · ส่งข้อมูลรอบครบไว้ใช้ในหัวป๊อปอัพ */}
                <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() =>
                      onShowDeductions({
                        appId: app.id,
                        recordId: row.recordId,
                        round,
                        kind: row.kind,
                        carriedHours: row.carriedHours,
                        appName: app.name,
                        companyName: link.name,
                      })
                    }
                    sx={{
                      minWidth: 0,
                      px: 0.5,
                      fontSize: "inherit",
                      textDecoration: "underline",
                      textUnderlineOffset: 3,
                    }}
                  >
                    {entry
                      ? t("deductionsCount", { n: entry.count })
                      : caption(counts === null ? "…" : "—")}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return {
    appName: app.name,
    companyName: link.name,
    chipLabel: t(chip.key, { n: chip.n ?? 0 }),
    chipColor: expiryColor(link.expiryStatus),
    general,
    history: historyTable,
  };
}
