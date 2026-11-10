"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { fetchPeriodUsage, type PeriodUsage } from "@/lib/apps-api";
import { formatDay } from "@/lib/app-expiry";

type Status = "loading" | "ready" | "error";

/**
 * ตัวเลือก 1 "รอบ" ของแถบ chip — ป๊อปอัพสร้างจาก payload ที่โหลดไว้แล้ว
 * (ไม่ยิง API เพิ่ม) `round` เริ่มที่ 1 ตาม `recordId ASC` ซึ่งตรงกับ
 * คอลัมน์ "รอบที่" ของแท็บประวัติการต่ออายุ
 */
export interface DeductionRound {
  recordId: number;
  round: number;
  /** `YYYY-MM-DD` — วันที่ของสัญญา, `null` = ยังไม่กรอก */
  startedAt: string | null;
  expiresAt: string | null;
  kind: "renew" | "buy";
  maHours: number | null;
  /**
   * ชั่วโมงที่ **ทบมาจากช่วงแรก** ของรอบนี้ (`carried_hours`, migration 1824) —
   * `null`/`0` = รอบนั้นไม่ทบ (รอบ 2 เป็นต้นไป / แถว `buy` / แถบที่มีก่อน
   * migration) → แถว chip **ไม่โชว์** chip "ทบมา" เลย (ตามที่ขอ: พอทบไม่ได้ก็หายไป)
   */
  carriedHours: number | null;
}

/** ปัดเศษ 1 ตำแหน่ง — เหมือน `round1` ฝั่งเซิร์ฟเวอร์ ให้ตัวเลขตรงกัน */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * **แท็บที่ 3 ของป๊อปอัพ `/systems` — "งานที่ถูกตัด MA"** (`Settings.tabDeductions`)
 *
 * ตอบคำถาม "MA ครั้งที่ 1 ตัดไปกี่รายการ แล้วดูรายการนั้นได้ที่ไหน" — โชว์ทั้ง
 * **จำนวน + ชั่วโมงของรอบนี้** และ **รายการจริง** (เลขงาน / ชื่อ / ประเภท /
 * ชั่วโมง / วันที่กรอก / ผู้รับผิดชอบ)
 *
 * - **ตัวเลือกรอบเป็น `Select` (dropdown) อยู่บนบรรทัดเดียวกับ chip สรุป** แทน
 *   แถว chip เดิม — บรรทัดนั้น**อยู่ตลอดเวลา** (แม้ตอนโหลด/พัง) จึงสลับรอบได้
 *   เสมอ · ค่าที่เลือก = `recordId` ที่ป๊อปอัพส่งมา ตั้งค่าได้ 2 ทางด้วย state
 *   เดียวกัน: กดจากแท็บประวัติ หรือเลือกใน dropdown นี้เอง · **ค่าเริ่มต้น =
 *   รอบล่าสุด** (`record.link.recordId`)
 * - **chip "ทบมา" โชว์เฉพาะรอบที่ทบจริง** (`carriedHours > 0`) — รอบ 2 เป็นต้นไป /
 *   แถว `buy` / แถบที่มีก่อน migration ไม่มีค่าเก็บ → ไม่มี chip เลย (ตามที่ขอ:
 *   "พอครั้งต่อไปที่ทบไม่ได้แล้วก็หายไป")
 * - **โหลดตอนเปิดแท็บนี้ / เปลี่ยนรอบเท่านั้น** — ไม่ยิงเพิ่มตอนเปิดป๊อปอัพ
 *   (ข้อมูลแท็บอื่นยังมาจาก payload เดิม `GET /systems`) และไม่มี endpoint ใหม่
 * - **ตัวเลข "ใช้ไป" ระดับคู่ไม่ถูกแตะ** — `pairUsedHours` คือค่าเดียวกับช่อง
 *   "ใช้ไป" ในแท็บแรก · `periodUsedHours` เป็นส่วนของรอบนี้ (บวกทุกรอบ +
 *   `unattributedHours` ได้เท่ากับค่าคู่เสมอ — เซิร์ฟเวอร์คุมด้วยเทสต์)
 * - `unattributedHours > 0` = **ชั่วโมงที่กรอกก่อนระบบมี feature นี้** → เล่าตรง ๆ
 *   ว่าไม่รู้ว่าเป็นของรอบไหน แทนที่จะเดาใส่รอบใดรอบหนึ่ง
 * - **ข้อความว่างแยก 3 กรณี** ให้ตอบคำถาม "ทำไมเป็น 0" ตรง ๆ: คู่นี้ยังไม่เคยมี
 *   ใครกรอกเวลา / มีชั่วโมงแต่ไปอยู่รอบอื่น (ชี้ไป dropdown ด้านบน) / ที่เหลือคือ
 *   ชั่วโมงกรอกก่อนระบบซึ่ง alert ด้านบนเล่าไว้แล้ว
 *
 * sequence ref (`seq`) กัน response ของรอบก่อนหน้ามาทับรอบที่เปิดใหม่กว่า —
 * สลับรอบ/สลับ record ระหว่างโหลดได้โดยไม่โชว์ข้อมูลผิดคู่
 */
export default function SystemDeductionsTab({
  appId,
  recordId,
  rounds,
  onSelectRound,
}: {
  appId: number;
  /** รอบที่กำลังดูอยู่ — `recordId` ของแถวใน `app_companies` */
  recordId: number;
  /** ทุกรอบของคู่นี้ (เรียง `recordId ASC`) — ใช้สร้างแถว chip */
  rounds: DeductionRound[];
  /** กด chip = เปลี่ยนรอบ — state อยู่ที่ป๊อปอัพ (จุดเดียวกับการกดจากแท็บประวัติ) */
  onSelectRound: (recordId: number) => void;
}) {
  const t = useTranslations("Settings");
  const taskTypes = useTranslations("Boards");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<PeriodUsage | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  /** เลขลำดับของคำขอ — เก่ากว่าคิวปัจจุบันถูกทิ้ง (ไม่เขียน state) */
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    setStatus("loading");
    setData(null);
    fetchPeriodUsage(appId, recordId)
      .then((result) => {
        if (mine !== seq.current) return;
        setData(result);
        setStatus("ready");
      })
      .catch(() => {
        if (mine !== seq.current) return;
        setStatus("error");
      });
  }, [appId, recordId, reloadToken]);

  const caption = (text: string) => (
    <Typography variant="caption" color="text.disabled">
      {text}
    </Typography>
  );

  /** hover ของ chip — บอกวันที่สัญญา / ประเภทแถว / ชั่วโมง ครบใน tooltip เดียว */
  const roundTitle = (r: DeductionRound) =>
    [
      t("historyRoundValue", { n: r.round }),
      r.kind === "buy" ? t("kindBuy") : t("renew"),
      `${r.startedAt ? formatDay(r.startedAt, locale) : t("notSetYet")} → ${
        r.expiresAt ? formatDay(r.expiresAt, locale) : t("expiryNone")
      }`,
      `${r.maHours ?? "—"} ${t("hoursUnit")}`,
    ].join(" · ");

  /** รอบที่กำลังดูอยู่ — ใช้ตัดสินใจโชว์ chip "ทบมา" (ไม่ทบ = ไม่มี chip) */
  const selectedRound = rounds.find((r) => r.recordId === recordId) ?? null;
  const carried = selectedRound?.carriedHours ?? 0;

  /**
   * **บรรทัดเดียว = สรุปของรอบ + ตัวเลือกรอบ** — ตามที่ขอให้ dropdown ของ
   * รอบมาอยู่**บรรทัดเดียวกับ** chip สรุป (แถว chip เลือกรอบเดิมถูกลบออก) ·
   * **`Select` อยู่นอก `loading`/`error` เสมอ** เพื่อรักษา invariant เดิมว่า
   * "สลับรอบได้ตลอดเวลา" — ตอนโหลด/พังจะเหลือ Select บรรทัดเดียวแทนที่จะหาย
   * ไปทั้งแถว · chip "ทบมา" โชว์**เฉพาะรอบที่ทบจริง** (`carriedHours > 0`) จึง
   * หายไปเองเมื่อรอบนั้นทบไม่ได้ (รอบ 2 เป็นต้นไป / แถว `buy` / แถบที่มีก่อน
   * migration ไม่มีค่าเก็บไว้)
   */
  const summaryRow = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
      {data && (
        <>
          <Chip
            label={t("deductionsCount", { n: data.count })}
            color="primary"
            size="small"
            variant="outlined"
          />
          <Chip
            label={t("deductionsUsed", { n: data.periodUsedHours })}
            size="small"
            variant="outlined"
          />
          {carried > 0 && (
            <Chip
              label={t("deductionsCarried", { n: carried })}
              color="success"
              size="small"
              variant="outlined"
            />
          )}
          <Box sx={{ flexGrow: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {t("deductionsPairUsed", { n: data.pairUsedHours })}
          </Typography>
        </>
      )}
      {/* ยังไม่มี data (โหลด/พัง) — ดัน Select ไปชิดขวาแทน */}
      {!data && <Box sx={{ flexGrow: 1 }} />}

      <FormControl size="small" sx={{ minWidth: 190 }}>
        <Select
          value={recordId}
          onChange={(e) => onSelectRound(Number(e.target.value))}
          size="small"
          inputProps={{ "aria-label": t("deductionsRoundLabel") }}
          sx={{ height: 32, "& .MuiSelect-select": { py: 0.5 } }}
        >
          {rounds.map((r) => (
            <MenuItem key={r.recordId} value={r.recordId} title={roundTitle(r)}>
              {`${t("historyRoundValue", { n: r.round })} · ${
                r.kind === "buy" ? t("kindBuy") : t("renew")
              }`}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );

  /** ชั่วโมงของคู่ที่ไปอยู่ **รอบอื่น** — ใช้ตอบว่าทำไมรอบนี้ถึงว่าง */
  const otherRoundsHours = data ? round1(data.pairUsedHours - data.unattributedHours) : 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {summaryRow}

      {status === "loading" ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={28} />
        </Box>
      ) : status === "error" || !data ? (
        <Alert
          severity="error"
          variant="outlined"
          action={
            <Button color="inherit" size="small" onClick={() => setReloadToken((n) => n + 1)}>
              {t("deductionsRetry")}
            </Button>
          }
        >
          {t("deductionsError")}
        </Alert>
      ) : (
        <>
          {/* ชั่วโมงที่กรอกก่อนระบบ — ไม่เดา บอกตรง ๆ ว่าไม่ระบุรอบ */}
          {data.unattributedHours > 0 && (
            <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
              {t("deductionsUnattributed", { n: data.unattributedHours })}
            </Alert>
          )}

          {data.count === 0 ? (
            <Box sx={{ py: 4, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                {/**
                 * 3 กรณี — ตอบ "ทำไมเป็น 0" ตรง ๆ แทนข้อความเดียว:
                 * (1) คู่นี้ยังไม่เคยมีใครกรอกเวลาเลย
                 * (2) มีชั่วโมง แต่ไปอยู่รอบอื่น (ชี้ไป chip ด้านบน)
                 * (3) ทั้งคู่มีแค่ชั่วโมงกรอกก่อนระบบ → alert ด้านบนเล่าไว้แล้ว
                 */}
                {data.pairUsedHours === 0
                  ? t("deductionsNoHours")
                  : otherRoundsHours > 0
                    ? t("deductionsOtherRounds", { n: otherRoundsHours })
                    : t("deductionsEmpty")}
              </Typography>
            </Box>
          ) : (
            /**
             * **ไม่มี scroll ของตัวเอง** — ปล่อยให้กล่องเนื้อหาตรงกลางของป๊อปอัพ
             * เป็นตัวเลื่อนจุดเดียว (เหมือนแท็บประวัติ) `stickyHeader` จึงยังอ้าง
             * scrollport ของ ancestor ได้
             */
            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>{t("deductionIssueNo")}</TableCell>
                    <TableCell>{t("deductionTitle")}</TableCell>
                    <TableCell>{t("deductionType")}</TableCell>
                    <TableCell align="center">{t("deductionHours")}</TableCell>
                    <TableCell>{t("deductionAt")}</TableCell>
                    <TableCell>{t("deductionAssignee")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.issues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.issueNumber ?? caption("—")}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>
                          {issue.title}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.taskType
                          ? taskTypes(`taskType.${issue.taskType}`)
                          : caption(t("notSetYet"))}
                      </TableCell>
                      <TableCell align="center">{issue.hours}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.deductedAt ? formatDay(issue.deductedAt, locale) : caption("—")}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.assigneeName ?? caption(t("deductionUnassigned"))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
}
