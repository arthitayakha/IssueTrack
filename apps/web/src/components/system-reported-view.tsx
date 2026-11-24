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

/** แถวที่กดมาจากคอลัมน์ "งานที่แจ้ง" ในแท็บ "ประวัติการต่ออายุ" */
export interface ReportedTarget {
  appId: number;
  recordId: number;
  /** ลำดับรายการในคู่ (1 = เก่าสุด) — ใช้ใน breadcrumb "รายการที่ N" */
  round: number;
}

/**
 * **เนื้อหา "งานที่แจ้ง (ไม่คิด MA)" ภายในป๊อปอัพรายละเอียด** — คนละชุดกับ
 * `SystemDeductionsView` เด็ดขาด (อันนั้นคือ "รายการที่ตัด" = MA ล้วน) เพราะ
 * บั๊ก/Requirement/ยังไม่ระบุ**ไม่เคยหัก MA** จึงไม่มีทางโผล่ในช่องนั้นอยู่แล้ว
 * (ผู้ใช้: "รายการนี้ต้องแสดง ไม่ใช่ที่ตัด MA … พวกบั๊กก็ต้องเก็บ")
 *
 * - **หัวข้อ** `งานที่แจ้งในรายการนี้ (N รายการ)` — นับจาก payload
 * - **ตาราง** เลขงาน (**ลิงก์ `/boards?issue=<id>` แท็บเดิม** ห้าม `target="_blank"`
 *   เพราะแท็บใหม่ไม่มี token แล้วบอร์ดเด้ง `/login`) / ชื่อเรื่อง / ประเภท /
 *   วันที่แจ้ง / ผู้รับผิดชอบ · ไม่มีคอลัมน์ชั่วโมง (เพราะไม่ได้หัก MA)
 * - **ข้อมูลดึงเองตอน mount** (`GET /apps/:id/companies/:recordId/usage` —
 *   response เดิมที่เพิ่มฟิลด์ `reportedCount`/`reportedIssues` เข้าไป) ·
 *   sequence ref กัน response เก่ามาทับตอนสลับแถวเร็ว ๆ
 * - ไม่มีหัว/ปุ่มของตัวเอง — breadcrumb อยู่ที่ `DialogTitle` ของป๊อปอัพเดิม
 */
export default function SystemReportedView({ target }: { target: ReportedTarget }) {
  const t = useTranslations("Settings");
  const taskTypes = useTranslations("Boards");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<PeriodUsage | null>(null);
  const seq = useRef(0);
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

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Typography variant="subtitle1" fontWeight={600}>
        {data ? t("reportedListTitle", { n: data.reportedCount }) : t("historyReported")}
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
            <Button color="inherit" size="small" onClick={() => setReloadToken((n) => n + 1)}>
              {t("deductionsRetry")}
            </Button>
          }
        >
          {t("deductionsError")}
        </Alert>
      )}

      {status === "ready" && data && (
        <>
          {data.reportedCount === 0 ? (
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
                    <TableCell>{t("reportedAt")}</TableCell>
                    <TableCell>{t("deductionAssignee")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.reportedIssues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.issueNumber ? (
                          <Box
                            component={Link}
                            href={`/boards?issue=${issue.id}`}
                            sx={{
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
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {issue.reportedAt ? formatDay(issue.reportedAt, locale) : caption("—")}
                      </TableCell>
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
