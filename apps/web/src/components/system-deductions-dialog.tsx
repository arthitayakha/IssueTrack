"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
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
 * ป้ายเปิดป๊อปอัพ **"งานที่ถูกตัด MA" ของ 1 รายการ** — ส่งมาจากลิงก์
 * "N รายการ" ในคอลัมน์ "รายการที่ตัด" ของแท็บ "ประวัติการต่ออายุ"
 */
export interface DeductionTarget {
  appId: number;
  /** `recordId` ของรายการที่กด (ไม่ใช่รอบล่าสุดเสมอไป) */
  recordId: number;
  /** ลำดับรายการในคู่ (1 = เก่าสุด) — ใช้ในหัวข้อ "รายการที่ N" */
  round: number;
  kind: "renew" | "buy";
  /** ชั่วโม์ทบมาของรายการนี้ (`null` = ไม่ทบ) — chip "ทบมา" โชว์เฉพาะ > 0 */
  carriedHours: number | null;
  appName: string;
  companyName: string;
}

/**
 * **ป๊อปอัพแยกใบ — "งานที่ถูกตัด MA"** (`Settings.tabDeductions`)
 *
 * แต่เดิมเป็น **แท็บที่ 3 ของป๊อปอัพรายละเอียด** พร้อม dropdown เลือกรอบ —
 * ผู้ใช้ทักว่า dropdown "ใหญ่ไป ไม่สวย" และอยากให้ดูได้จากลิงก์ในแท็บ
 * ประวัติเหมือนกฎที่สับเข้าหน้า → ตอนนี้จึงเป็น **Dialog คนละใบ** เปิดจาก
 * ลิงก์ "N รายการ" (เปิดซ้อนบนป๊อปอัพเดิม ปิดแล้วกลับไปแท็บประวัติเหมือนเดิม)
 *
 * - **ไม่มีตัวสลับรอบ** — โชว์เฉพาะ "รายการที่กดมา" (ข้อสรุปจากผู้ใช้:
 *   "ก็จะเห็นรายการจากที่เลือกสิ") · อยากดูรายการอื่น = ปิดแล้วกดลิงก์รอบนั้น
 * - **หัวข้อ** `งานที่ถูกตัด MA · รายการที่ N` + บรรทัด `แอป — บริษัท` + chip ประเภท
 *   แถว · **chip สรุป** = จำนวนรายการ / ใช้ไปของรายการนี้ / ทบมา (เฉพาะ > 0) +
 *   ยอด "ใช้ไปทั้งคู่" ชิดขวา — ตัวเลขชุดเดิมกับที่แท็บเก่าโชว์
 * - **ตาราง** คอลัมน์ชุดเดิม: เลขงาน / ชื่อ / ประเภท / ชม. / วันที่กรอก / ผู้รับ
 *   + ข้อความว่าง 3 กรณี + alert ชั่วโม์ไม่ระบุรอบ (คัดลอกจากแท็บเก่า)
 * - **ข้อมูลดึงเองตอนเปิด** (`GET /apps/:id/companies/:recordId/usage`) — ไม่ยิง
 *   ตอนเปิดป๊อปอัพเดิม · sequence ref กัน response ของรายการก่อนหน้ามาทับ
 *   (สลับลิงก์ไปมาเร็ว ๆ ได้โดยไม่โชว์ข้อมูลผิดรายการ)
 * - **ไม่ต้องมีสิทธิ์เพิ่ม** — เปิดจากป๊อปอัพที่กันด้วย `system.view` อยู่แล้ว
 */
export default function SystemDeductionsDialog({
  target,
  onClose,
}: {
  /** `null` = ปิดอยู่ (component ค้างใน tree เพื่อรักษา state การโหลด) */
  target: DeductionTarget | null;
  onClose: () => void;
}) {
  const t = useTranslations("Settings");
  const taskTypes = useTranslations("Boards");
  const locale = useLocale();
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<PeriodUsage | null>(null);
  /** เลขลำดับของคำขอ — เก่ากว่าคิวปัจจุบันถูกทิ้ง (ไม่เขียน state) */
  const seq = useRef(0);

  /** primitive deps — ไม่พึ่ง identity ของ `target` (เปลี่ยนทุก render ไม่ได้) */
  const appId = target?.appId ?? null;
  const recordId = target?.recordId ?? null;

  useEffect(() => {
    if (appId === null || recordId === null) {
      setStatus("loading");
      setData(null);
      return;
    }
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
  }, [appId, recordId]);

  const caption = (text: string) => (
    <Typography variant="caption" color="text.disabled">
      {text}
    </Typography>
  );

  /** ชั่วโม์ของคู่ที่ไปอยู่ **รายการอื่น** — ใช้ตอบว่าทำไมรายการนี้ถึงว่าง */
  const otherRoundsHours = data ? round1(data.pairUsedHours - data.unattributedHours) : 0;

  return (
    <Dialog open={target !== null} onClose={onClose} maxWidth="md" fullWidth>
      {target && (
        <>
          <DialogTitle sx={{ pb: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                {/* หัวข้อ = แท็บเดิม + รายการที่กด — ระบุชัดว่าดูของรอบไหน */}
                <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                  {`${t("tabDeductions")} · ${t("historyRoundValue", { n: target.round })}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {`${target.appName} — ${target.companyName}`}
                </Typography>
              </Box>
              {/* ประเภทแถวของรายการนี้ — chip ชุดเดียวกับแท็บประวัติ */}
              <Chip
                label={target.kind === "buy" ? t("kindBuy") : t("renew")}
                color={target.kind === "buy" ? "info" : "default"}
                size="small"
                variant="outlined"
                sx={{ flexShrink: 0 }}
              />
              <Button onClick={onClose} size="small" sx={{ minWidth: 32, px: 1 }}>
                ✕
              </Button>
            </Box>
          </DialogTitle>

          <DialogContent sx={{ overflowY: "auto", pt: 1 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {/* ---- chip สรุปของรายการนี้ (ชุดเดิมกับแท็บเก่า) ---- */}
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
                    {(target.carriedHours ?? 0) > 0 && (
                      <Chip
                        label={t("deductionsCarried", { n: target.carriedHours ?? 0 })}
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
                {!data && <Box sx={{ flexGrow: 1 }} />}
              </Box>

              {status === "loading" ? (
                <Box sx={{ py: 6, textAlign: "center" }}>
                  <CircularProgress size={28} />
                </Box>
              ) : status === "error" || !data ? (
                <Alert severity="error" variant="outlined">
                  {t("deductionsError")}
                </Alert>
              ) : (
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
                         * 3 กรณี — ตอบ "ทำไมเป็น 0" ตรง ๆ (คัดลอกจากแท็บเก่า):
                         * (1) คู่นี้ยังไม่เคยมีใครกรอกเวลาเลย
                         * (2) มีชั่วโม์ แต่ไปอยู่รายการอื่น (ปิดแล้วกดลิงก์รายการนั้น)
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
                    <TableContainer
                      sx={{ border: 1, borderColor: "divider", borderRadius: 1 }}
                    >
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
                                {issue.deductedAt
                                  ? formatDay(issue.deductedAt, locale)
                                  : caption("—")}
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
          </DialogContent>
        </>
      )}
    </Dialog>
  );
}

/** ปัดเศษ 1 ตำแหน่ง — เหมือน `round1` ฝั่งเซิร์ฟเวอร์ ให้ตัวเลขตรงกัน */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
