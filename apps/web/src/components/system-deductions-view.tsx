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
  /** รายการ **ช่วงหมดอายุ** — ใช้ `afterExpiryIssues` แทนงานที่ถูกตัดจริง */
  expired?: boolean;
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

  const { appId, recordId, expired } = target;

  useEffect(() => {
    const mine = ++seq.current;
    setStatus("loading");
    setData(null);
    fetchPeriodUsage(appId, recordId)
      .then((result) => {
        if (mine !== seq.current) return;
        // รายการช่วงหมดอายุ = งานที่แจ้งหลังสัญญาจบ (ไม่ได้ตัด MA) — คนละ
        // ชุดกับ `listedIssues` ของรอบจริง จึงต้องเลือกให้ตรงก่อนโชว์
        setData(
          expired
            ? {
                ...result,
                issues: result.afterExpiryIssues ?? [],
                count: result.afterExpiryCount ?? 0,
                listedIssues: result.afterExpiryIssues ?? [],
                listedCount: result.afterExpiryCount ?? 0,
              }
            : result,
        );
        setStatus("ready");
      })
      .catch(() => {
        if (mine !== seq.current) return;
        setStatus("error");
      });
  }, [appId, recordId, expired, reloadToken]);

  const caption = (text: string) => (
    <Typography variant="caption" color="text.disabled">
      {text}
    </Typography>
  );

  /**
   * **งานทุกประเภทที่เสร็จแล้ว + กรอกเวลาแล้ว** จะโผล่ตรงนี้ (บั๊ก / Requirement /
   * ไม่ระบุ / MA) — `count` เดิมเป็นสูตร MA ล้วน ใช้กับ "ใช้ไป/คงเหลือ" เหมือนเดิม
   * · งานที่เกิดหลังวันหมดอายุของสัญญา sẽถูก mark ว่าเป็น "ช่วงหมดอายุ" และ
   * **ไม่โชว์ชั่วโมง** เพราะไม่ได้ตัด MA
   */
  // `afterExpiry` มาจากเซิร์ฟเวอร์แล้ว (จอ/ไฟล์/รายงานตรงกัน) — ไม่เทียบซ้ำ

  /** กันกรณี web deploy เร็วกว่า api — ยังไม่มีฟิลด์ใหม่ให้โชว์ `0`/ลิสต์ว่าง */
  const listed = data?.listedIssues ?? [];
  const listedCount = data?.listedCount ?? listed.length;

  /** หัวข้อ `รายการงาน (N รายการ)` — ยังไม่มี count ระหว่างโหลด */
  const heading = data
    ? expired
      ? t("afterExpiryListTitle", { n: listedCount })
      : t("deductionListTitle", { n: listedCount })
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

          {listedCount === 0 ? (
            <Box sx={{ py: 5, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                {t("reportedEmpty")}
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
                  {listed.map((issue) => {
                    /** งานที่เกิดหลังวันหมดอายุ — ไม่ได้ตัด MA จึงไม่โชว์ชั่วโมง */
                    const late = issue.afterExpiry === true;
                    return (
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
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          {issue.taskType
                            ? taskTypes(`taskType.${issue.taskType}`)
                            : caption(t("notSetYet"))}
                          {late && (
                            <Chip
                              label={t("afterExpiry")}
                              size="small"
                              variant="outlined"
                              color="warning"
                              sx={{ height: 20, fontSize: "0.6875rem" }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      {/* หลังหมดอายุ = ไม่มีสัญญาให้หัก → ไม่โชว์ชั่วโมง */}
                      <TableCell align="center">
                        {late ? caption("—") : issue.hours}
                      </TableCell>
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
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
}

