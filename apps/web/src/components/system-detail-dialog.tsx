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
import SystemDeductionsTab, { type DeductionRound } from "./system-deductions-tab";
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
 *   คงเหลือ / **รายการที่ตัด** (ปุ่มเปิดแท็บที่ 3 ของรอบนั้น) — **ไม่มีหมายเหตุ**
 *   (ตัดออกตามข้อตกลง) · ตาราง scroll ในตัว (sticky header)
 * - **งานที่ถูกตัด MA** — แท็บที่ 3 (`SystemDeductionsTab`) ดึงเองตอนเปิดแท็บ
 *   (ไม่ยิงตอนเปิดป๊อปอัพ) · เปิดจากปุ่มในคอลัมน์ "รายการที่ตัด" ของแท็บประวัติ
 *   จะไปโชว์ **รอบนั้น** ไม่ใช่รอบล่าสุด (state `deductionRecordId`)
 *
 * ข้อมูล 2 แท็บแรกมาจาก payload ที่หน้าโหลดไว้แล้ว (`GET /systems`) + map "ใช้ไป"
 * ระดับคู่ — **ไม่ยิง API เพิ่ม** · แท็บประวัติยิง `GET /apps/usage-counts` ครั้งเดียว
 * ตอนเปิดป๊อปอัพ (นับ "รายการที่ตัด" ของทุกรอบพร้อมกัน ไม่ใช่ต่อแถว)
 *
 * ขนาด **ฟิกคงที่ทุกแท็บ** (`PaperProps` ด้านล่าง) — เดิมใช้ `maxWidth="md"
 * fullWidth` ทำให้กล่องหด/ขยายตามเนื้อหา สลับแท็บแล้วขยับ
 */
export default function SystemDetailDialog({
  open,
  record,
  /** "ใช้ไป" ระดับคู่ แอป×บริษัท (ชม.) — `undefined` = ยังดึงไม่สำเร็จ */
  used,
  /** false = ยังโหลด/ดึงไม่ได้ → ช่อง "ใช้ไป/คงเหลือ" โชว์ `—` */
  usageReady,
  /** false = แถวไม่เข้าเกณฑ์ต่ออายุ/ไม่มีสิทธิ์ → ซ่อนปุ่มท้ายการ์ด */
  canRenew,
  /** เปิดฟอร์มต่ออายุของคู่นี้ */
  onRenew,
  onClose,
}: {
  open: boolean;
  /** null = ยังไม่ได้เลือกแถว ( Dialog ปิดอยู่ ) */
  record: DetailRecord | null;
  used: number | undefined;
  usageReady: boolean;
  canRenew: boolean;
  onRenew: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const [tab, setTab] = useState(0);

  /**
   * รอบที่แท็บ "งานที่ถูกตัด MA" กำลังโชว์ — `null` = ใช้แถวที่เปิดป๊อปอัพอยู่
   * (รอบล่าสุด) · กดปุ่มในคอลัมน์ "รายการที่ตัด" ของแท็บประวัติจะตั้งค่าเป็น
   * รอบนั้น ให้โชว์รายการของ **รอบที่กด** ไม่ใช่รอบล่าสุดเสมอไป
   */
  const [deductionRecordId, setDeductionRecordId] = useState<number | null>(null);

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
      setDeductionRecordId(null);
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
   * ตัวเลือก "รอบ" ของแถว chip บนแท็บที่ 3 — สร้างจาก payload ที่โหลดไว้แล้ว
   * (**ไม่ยิง API เพิ่ม**) เรียง `recordId ASC` แล้วนับ `round` ตั้งแต่ 1
   * **แบบเดียวกับคอลัมน์ "รอบที่" ในแท็บประวัติ** (`history.length - index` ของ
   * ลิสต์กลับด้าน) จึงไม่มีทางขัดกัน
   */
  const rounds: DeductionRound[] = record
    ? record.app.companies
        .filter((row) => row.id === record.link.id)
        .slice()
        .sort((a, b) => a.recordId - b.recordId)
        .map((row, i) => ({
          recordId: row.recordId,
          round: i + 1,
          startedAt: row.startedAt,
          expiresAt: row.expiresAt,
          kind: row.kind,
          maHours: row.maHours,
          // ชั่วโมงที่ทบมาของแถวนั้น — `null` = ไม่ทบ (แท็บที่ 3 ซ่อน chip เอง)
          carriedHours: row.carriedHours,
        }))
    : [];

  /** ค่าที่คำนวณจากแถวที่เลือก — `null` = ยังไม่มีแถว (เนื้อหาจะไม่ถูกอ่าน) */
  const view = record
    ? buildView(record, {
        used,
        usageReady,
        t,
        locale,
        counts,
        onShowDeductions: (recordId) => {
          setDeductionRecordId(recordId);
          setTab(2);
        },
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
        <Tab label={t("tabGeneral")} />
        <Tab label={t("tabRenewHistory")} />
        <Tab label={t("tabDeductions")} />
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
              {tab === 2 ? (
                /**
                 * แท็บที่ 3 — **ดึงรายการของตัวเองตอนเปิดแท็บ** (ไม่ยิงตอนเปิดป๊อปอัพ)
                 *
                 * `deductionRecordId` = รอบที่ถูกเลือก — ตั้งค่าได้ 2 ทาง (**state
                 * เดียวกัน จึงตรงกันเสมอ**): กดปุ่มในคอลัมน์ "รายการที่ตัด" ของ
                 * แท็บประวัติ หรือกด chip เลือกรอบในแท็บนี้เอง · `null` = รอบล่าสุด
                 */
                <SystemDeductionsTab
                  appId={record.app.id}
                  recordId={deductionRecordId ?? record.link.recordId}
                  rounds={rounds}
                  onSelectRound={setDeductionRecordId}
                />
              ) : tab === 0 ? (
                view.general
              ) : (
                view.history
              )}
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
    used: number | undefined;
    usageReady: boolean;
    t: ReturnType<typeof useTranslations>;
    locale: string;
    /**
     * จำนวนรายการที่ถูกตัดของ **ทุกรอบ** ในคู่นี้ (คีย์ = `recordId`) —
     * `null` = ยังโหลดอยู่ (โชว์ `…`) · Map ที่ไม่มีคีย์นั้น = ดึงไม่ได้ (โชว์ `—`)
     */
    counts: Map<number, UsageCount> | null;
    /** เปิดแท็บ "งานที่ถูกตัด MA" ของรอบที่กด */
    onShowDeductions: (recordId: number) => void;
  },
): DetailView {
  const { app, link } = record;
  const { used, usageReady, t, locale, counts, onShowDeductions } = opts;

  const caption = (text: string) => (
    <Typography variant="caption" color="text.disabled">
      {text}
    </Typography>
  );

  /** ปัดเศษ 1 ตำแหน่ง — เหมือน `round1` ของตารางหลัก */
  const round1 = (n: number) => Math.round(n * 10) / 10;

  /** ใช้ไปของคู่ — **ค่าเดียวกันทุกแถว** ในประวัติ (ตามข้อตกลง: ค่ารวมทั้งคู่) */
  const usedHours = usageReady && used !== undefined ? round1(used) : null;

  /** คงเหลือของแถวนั้น = MA ของแถวนั้น − ใช้ไปของคู่ (สูตรเดียวกับตารางหลัก) */
  const remainingOf = (row: AppCompanyLink): number | null => {
    if (!usageReady || usedHours === null || row.maHours == null) return null;
    return round1(row.maHours - usedHours);
  };

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
   * **ชั่วโมงที่ "ซื้อเพิ่ม" ของแถวนี้** — อ่านจาก `maHours` ของแถว `buy` **ตรง ๆ**
   * เพราะสูตรใหม่ของ `buyHours()` คือ `ma_hours = ที่ซื้อ` ล้วน (ไม่รวมของแถวก่อน
   * อีกต่อไป — ข้อสรุปจากผู้ใช้) · แถว `renew` → `0` (ไม่ได้ซื้อ) · แถว `buy` ที่ยัง
   * ไม่มี `maHours` → `null` ให้โชว์ `—` **ไม่เดา**
   *
   * (เดิม derive `แถว buy − แถวก่อนหน้าของคู่` ซึ่งใช้ไม่ได้กับสูตรใหม่ — แถวที่
   * สร้างก่อนสูตรใหม่ถูกแก้ค่าให้ตรงแล้วโดย migration `1825`)
   */
  const purchasedOf = (row: AppCompanyLink): number | null => {
    if (row.kind !== "buy") return 0;
    return row.maHours == null ? null : round1(row.maHours);
  };

  /**
   * **ส่วนประกอบของ `maHours`** — ผัง "ต่ออายุ + ซื้อชั่วโมง (+ ทบมา) = ชั่วโมง
   * MA ทั้งหมด" ที่ผู้ใช้ขอ · **ไม่แตะตัวเลขหลัก**: `maHours` / ใช้ไป / คงเหลือ
   * ยังมาจากค่าเดิมทุกประการ · บรรทัดแรกเป็น *residual* (`ma − ซื้อ − ทบ`)
   * จึง**บวกกันได้พอดีเสมอ** — ต้องเป็นอย่างนั้นเพราะ `maHours` ที่ฟอร์มบันทึก
   * บางครั้งรวม "ใช้ไป" ของช่วงก่อนเข้าไปด้วย (ดูสูตร `newMa` ในฟอร์มต่ออายุ)
   * จึงแยกเป็น "จำนวนที่พิมพ์" ล้วน ๆ ไม่ได้ · **แถว `buy`**: residual จะเป็น 0
   * เสมอ (`ma = ที่ซื้อ`) จึงไม่ถูกโชว์ — ดู comment ของ "ส่วนประกอบ" ด้านล่าง
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
           แถว `buy` **ไม่โชว์บรรทัด "ต่ออายุ"** — MA ของแถวนั้นคือ "ที่ซื้อ" ล้วน
           (residual จะเป็น 0 เสมอ) จึงเหลือแค่บรรทัด "ซื้อชั่วโมง" (ตามที่ขอ) */}
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
        usedHours === null ? caption(usageReady ? "—" : "…") : withUnit(usedHours, ""),
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
            {/* **รายการที่ตัด** ของรอบนั้น — ปุ่มเปิดแท็บที่ 3 ของรอบที่กด */}
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
                {/* ใช้ไป = ค่ารวมทั้งคู่ — ตัวเลขเดียวกันทุกแถว (ตามข้อตกลง) */}
                <TableCell align="center">
                  {usedHours === null ? caption(usageReady ? "—" : "…") : usedHours}
                </TableCell>
                <TableCell align="center">
                  {remaining === null ? caption("—") : remaining}
                </TableCell>
                {/* ปุ่มเปิดแท็บ "งานที่ถูกตัด MA" **ของรอบนี้** — `counts === null`
                    = ยังโหลด (`…`), Map ไม่มีคีย์ = ดึงไม่ได้ (`—`, fail-open) */}
                <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
                  <Button
                    size="small"
                    color="inherit"
                    onClick={() => onShowDeductions(row.recordId)}
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
