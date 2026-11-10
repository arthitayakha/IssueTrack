"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
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
import type { App, AppCompanyLink } from "@/lib/apps-api";
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
 *   คอลัมน์: **รอบที่** / เริ่มใช้งาน / หมดอายุ / ชั่วโม์ MA / ใช้ไป / คงเหลือ
 *   — **ไม่มีหมายเหตุ** (ตัดออกตามข้อตกลง) · ตาราง scroll ในตัว (sticky header)
 *
 * ทุกอย่างมาจาก payload ที่หน้าโหลดไว้แล้ว (`GET /systems`) + map "ใช้ไป"
 * ระดับคู่ — **ไม่ยิง API เพิ่ม**
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
   * เปิดแถวใหม่ = กลับไปแท็บแรกเสมอ — ไม่งั้นปิดแถวที่ดูประวัติอยู่ แล้วเปิด
   * อีกแถว จะโผล่แท็บประวัติของคนละคู่ (component ไม่ unmount เพราะผู้เรียก
   * ส่ง `record=null` แทนการถอดออกจาก tree)
   */
  useEffect(() => {
    if (open) setTab(0);
  }, [open, record?.link.recordId]);

  /** ค่าที่คำนวณจากแถวที่เลือก — `null` = ยังไม่มีแถว (เนื้อหาจะไม่ถูกอ่าน) */
  const view = record ? buildView(record, { used, usageReady, t, locale }) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      /**
       * **ขนาดฟิกคงที่ทุกแท็บ** — ความกว้าง 800px (หัก `calc` ที่จอ `xs`) ·
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
          width: { xs: "calc(100% - 32px)", sm: 800 },
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
        {view && (
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

            <Divider sx={{ my: 1.5 }} />

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
                <Divider sx={{ my: 1.5 }} />
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
  },
): DetailView {
  const { app, link } = record;
  const { used, usageReady, t, locale } = opts;

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

  /** แถว label ซ้าย / value ขวา — คั่นด้วยเส้นแนวนอน (แบบในรูป) */
  const infoRow = (label: string, value: ReactNode, key: string) => (
    <Fragment key={key}>
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 2,
          py: 1.25,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body1">{value}</Typography>
      </Box>
      <Divider />
    </Fragment>
  );

  /** ต่อท้ายหน่วย "ชั่วโม์" — แบบช่องในรูป (`40 ชั่วโม์`) */
  const withUnit = (value: number | null, fallback: string): ReactNode =>
    value === null ? caption(fallback) : `${value} ${t("hoursUnit")}`;

  const general = (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      {/* วันที่ 2 ช่อง — label บน / value ล่าง มีเส้นตั้งคั่นกลาง */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <Box sx={{ pr: 2.5, borderRight: 1, borderColor: "divider", pb: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            {t("columnStartedAt")}
          </Typography>
          <Typography variant="body1">
            {link.startedAt
              ? formatDay(link.startedAt, locale)
              : caption(t("notSetYet"))}
          </Typography>
        </Box>
        <Box sx={{ pl: 2.5, pb: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            {t("columnExpiresAt")}
          </Typography>
          <Typography variant="body1">
            {link.expiresAt ? formatDay(link.expiresAt, locale) : caption(t("expiryNone"))}
          </Typography>
        </Box>
      </Box>
      <Divider />

      {infoRow(
        t("maHoursTotal"),
        link.maHours == null ? caption(t("notSetYet")) : withUnit(link.maHours, ""),
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
     * 7 ตัวยังค้างบนสุดตอนเลื่อนลงไปดูรอบเก่า ๆ
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
          <TableRow>
            <TableCell>{t("historyRound")}</TableCell>
            {/* ประเภทแถว — `kind` (migration 1820): แยกแถบที่ "ซื้อชั่วโมง"
                (วันที่เท่าเดิม แต่ MA มากขึ้น) ออกจากรอบต่ออายุปกติ */}
            <TableCell>{t("historyKind")}</TableCell>
            <TableCell>{t("columnStartedAt")}</TableCell>
            <TableCell>{t("columnExpiresAt")}</TableCell>
            <TableCell align="center">{t("columnMaHours")}</TableCell>
            <TableCell align="center">{t("usedLabel")}</TableCell>
            <TableCell align="center">{t("columnRemaining")}</TableCell>
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
