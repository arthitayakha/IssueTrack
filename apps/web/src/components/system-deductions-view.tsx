"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Link } from "@/i18n/navigation";
import { fetchPeriodUsage, type PeriodUsage } from "@/lib/apps-api";
import { formatDay } from "@/lib/app-expiry";

type Status = "loading" | "ready" | "error";

/**
 * ป้ายระบุ "รายการที่กดมาจากลิงก์" — ส่งจากคอลัมน์ "รายการที่ตัด" ในแท็บ
 * "ประวัติการต่ออายุ" ของป๊อปอัพรายละเอียด
 */
export interface DeductionTarget {
  appId: number;
  /** `recordId` ของรายการที่กด (ไม่ใช่รอบล่าสุดเสมอไป) */
  recordId: number;
  /** ลำดับรายการในคู่ (1 = เก่าสุด) — ใช้ใน breadcrumb "รายการที่ N" */
  round: number;
}

/**
 * **เนื้อหา "รายการงานที่ถูกตัด" ภายในป๊อปอัพรายละเอียด** — ไม่ใช่ป๊อปอัพ/หน้า
 * ของตัวเอง
 *
 * ประวัติตามข้อสรุปผู้ใช้ทีละรอบ: แท็บที่ 3 → dropdown (ทัก "ใหญ่ไป ไม่สวย") →
 * Autocomplete → ป๊อปอัพแยกใบ (ทัก "จะมีป๊อปอัพขึ้นมาอีกทำไม … มันก็อยู่ใน
 * รายละเอียดระบบ") → หน้า `/systems/deductions` (ทัก "ไม่เอาคนละหน้า") →
 * **สรุปสุดท้าย: อยู่ในป๊อปอัพเดิม เปลี่ยนเฉพาะ "คำ" + เนื้อหา** (ตามภาพอ้างอิง:
 * breadcrumb `← ประวัติการต่ออายุ / รายการที่ N` + หัวข้อ + ตาราง ไม่มีแท็บ)
 *
 * Component นี้**ไม่มีหัว/ปุ่มของตัวเอง** — หัว (breadcrumb + ✕) อยู่ที่
 * `DialogTitle` ของป๊อปอัพเดิม (`system-detail-dialog.tsx`) ซึ่งซ่อน `<Tabs>`
 * ขณะที่เปิดรายการนี้อยู่ · เนื้อหา:
 *
 * - **หัวข้อ** `รายการงานที่ถูกตัด (N รายการ)` + ไอคอนลิสต์ (นับจาก payload —
 *   ไม่มีชิปสรุปแล้ว ตัวเลขอยู่ในหัวข้อแทน)
 * - **ตาราง** คอลัมน์ตามภาพ: เลขงาน (**ลิงก์ไป `/boards?issue=<id>`** —
 *   **แท็บเดิม**แบบลิงก์แจ้งเตือน ห้าม `target="_blank"` เพราะแท็บใหม่ไม่มี
 *   token แล้วบอร์ดเด้งไป `/login`) / ชื่อเรื่อง / ประเภท / ชม. / วันที่กรอก /
 *   ผู้รับผิดชอบ (ยังไม่มีคนรับ = **chip**) · ข้อความว่าง 3 กรณี + alert
 *   ชั่วโม์ไม่ระบุรายการ คงไว้
 * - **ข้อมูลดึงเองตอน mount** (`GET /apps/:id/companies/:recordId/usage`) —
 *   sequence ref กัน response ของรายการก่อนหน้ามาทับ (สลับลิงก์เร็ว ๆ ได้)
 */
export default function SystemDeductionsView({ target }: { target: DeductionTarget }) {
  const t = useTranslations("Settings");
  const taskTypes = useTranslations("Boards");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<PeriodUsage | null>(null);
  /** เลขลำดับของคำขอ — เก่ากว่าคิวปัจจุบันถูกทิ้ง (ไม่เขียน state) */
  const seq = useRef(0);
  /** วนเมื่อกดปุ่ม "ลองใหม่" — เป็น dep ของ effect ดึงข้อมูล */
  const [reloadToken, setReloadToken] = useState(0);

  const { appId, recordId } = target;

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

  /** ชั่วโม์ของคู่ที่ไปอยู่ **รายการอื่น** — ใช้ตอบว่าทำไมรายการนี้ถึงว่าง */
  const otherRoundsHours = data ? round1(data.pairUsedHours - data.unattributedHours) : 0;

  /** หัวข้อ `รายการงานที่ถูกตัด (N รายการ)` — ยังไม่มี count ระหว่างโหลด */
  const heading = data
    ? t("deductionListTitle", { n: data.count })
    : t("tabDeductions");

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {/* ---- หัวข้อตามภาพอ้างอิง (ชื่อ + จำนวนรายการ — ไม่มีไอคอน) ---- */}
      <Typography variant="subtitle1" fontWeight={600}>
        {heading}
      </Typography>

      {status === "loading" && (
        <Box sx={{ py: 6, textAlign: "center" }}>
          <CircularProgress size={28} />
        </Box>
      )}

      {status === "error" && (
        <Alert
          severity="error"
          variant="outlined"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setReloadToken((n) => n + 1)}
            >
              {t("deductionsRetry")}
            </Button>
          }
        >
          {t("deductionsError")}
        </Alert>
      )}

      {status === "ready" && data && (
        <>
          {/* ชั่วโม์ที่กรอกก่อนระบบ — ไม่เดา บอกตรง ๆ ว่าไม่ระบุรายการ */}
          {data.unattributedHours > 0 && (
            <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
              {t("deductionsUnattributed", { n: data.unattributedHours })}
            </Alert>
          )}

          {data.count === 0 ? (
            <Box sx={{ py: 5, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                {/**
                 * 3 กรณี — ตอบ "ทำไมเป็น 0" ตรง ๆ:
                 * (1) คู่นี้ยังไม่เคยมีใครกรอกเวลาเลย
                 * (2) มีชั่วโม์ แต่ไปอยู่รายการอื่น
                 * (3) ทั้งคู่มีแค่ชั่วโม์กรอกก่อนระบบ → alert ด้านบนเล่าไว้แล้ว
                 */}
                {data.pairUsedHours === 0
                  ? t("deductionsNoHours")
                  : otherRoundsHours > 0
                    ? t("deductionsOtherRounds", { n: otherRoundsHours })
                    : t("deductionsEmpty")}
              </Typography>
            </Box>
          ) : (
            <TableContainer sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}>
              <Table size="small">
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
                      {/* เลขงาน = **ลิงก์ไปบอร์ด** — ไป**แท็บเดิม** (SPA ไม่ reload →
                          token ยังอยู่ เหมือนลิงก์แจ้งเตือน) · เดิมเป็น
                          `target="_blank"` ซึ่งทำให้แท็บใหม่ไม่มี token
                          (sessionStorage ของแท็บเดิม) แล้วบอร์ดเด้งไป `/login` */}
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.issueNumber ? (
                          <Box
                            component={Link}
                            href={`/boards?issue=${issue.id}`}
                            sx={{
                              // **สีดำ** ตามที่ขอ (เดิม `primary.main` สีฟ้า) —
                              // คงขีดเส้นไว้ให้เห็นว่าเป็นลิงก์
                              color: "text.primary",
                              textDecoration: "underline",
                              textUnderlineOffset: 3,
                            }}
                          >
                            {issue.issueNumber}
                          </Box>
                        ) : (
                          caption("—")
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 320 }}>
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
                      {/* ยังไม่มีคนรับ = chip (ตามภาพ) · มีคนรับ = ชื่อล้วน */}
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.assigneeName ? (
                          issue.assigneeName
                        ) : (
                          <Chip
                            label={t("deductionUnassigned")}
                            size="small"
                            variant="outlined"
                            color="default"
                          />
                        )}
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

/** ปัดเศษ 1 ตำแหน่ง — เหมือน `round1` ฝั่งเซิร์ฟเวอร์ ให้ตัวเลขตรงกัน */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
