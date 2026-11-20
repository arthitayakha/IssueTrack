"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { alpha } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import { usePermissions } from "@/lib/permissions";
import { fetchSystemReport, fetchSystemReports, type SystemReport } from "@/lib/system-reports-api";
import {
  appDialogContentSizing,
  appDialogPaperSx,
  appDialogSx,
} from "@/components/common/dialog-style";
import { Pagination } from "@/components/pagination";
import SystemReportForm from "@/components/help-center/system-report-form";
import AdminContactForm from "@/components/help-center/admin-contact-form";
import SystemReportDetailDialog from "@/components/help-center/system-report-detail-dialog";

type View = "report" | "contact" | "adminContact" | null;

/** จำนวนรายงานต่อหน้าในป๊อปอัพ (พื้นที่จำกัด → 5 แถวพอดี ไม่ต้องเลื่อนยาว) */
const PAGE_SIZE = 5;

/**
 * ป๊อปอัพ "ศูนย์ช่วยเหลือ" จากไอคอน🎧บน navbar — ใช้ความกว้าง/สไตล์เดียวกับ
 * ป๊อปอัพอื่น ๆ (`appDialogPaperSx`) · 2 หัวข้อหลัก: แจ้งบั๊กระบบ / ติดต่อ
 * (ฝั่งแอดมิน: เห็นรายงานพร้อมชื่อผู้แจ้ง + แก้ข้อมูลติดต่อตัวเอง)
 */
export default function HelpCenterDialog({
  open,
  onClose,
  onOpenContact,
}: {
  open: boolean;
  onClose: () => void;
  onOpenContact: () => void;
}) {
  const t = useTranslations("Nav");
  const ts = useTranslations("SystemReports");
  const theme = useTheme();
  const { can } = usePermissions();
  const isAdmin = can("system_report.view");

  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(null);
  const [reports, setReports] = useState<SystemReport[]>([]);
  const [detail, setDetail] = useState<SystemReport | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (open) {
      setView(null);
      setQuery("");
      setPage(1);
    }
  }, [open]);

  const loadReports = useCallback(async () => {
    try {
      setReports(await fetchSystemReports());
    } catch {
      /* fail-open: แถบรายงานล่าสุดซ่อนไว้ก็ยังส่งรายงานได้เหมือนเดิม */
    }
  }, []);

  useEffect(() => {
    if (open && isAdmin && view === "report") void loadReports();
  }, [open, isAdmin, view, loadReports]);

  const totalPages = Math.max(1, Math.ceil(reports.length / PAGE_SIZE));
  const pageRows = reports.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /** จำนวนรายการลดลง (เช่น มีการลบ) → ดึงหน้ากีบกลับมา ไม่ค้างหน้าว่าง */
  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(1, Math.ceil(reports.length / PAGE_SIZE))));
  }, [reports.length]);

  if (!open) return null;

  const topics: Array<{
    id: "report" | "contact";
    label: string;
    desc: string;
    icon: ReactNode;
    color: "warning" | "success";
  }> = [
    {
      id: "report",
      label: t("helpCenterReportLabel"),
      desc: t("helpCenterReportDesc"),
      icon: <BugReportOutlinedIcon />,
      color: "warning",
    },
    {
      id: "contact",
      label: t("helpCenterContactLabel"),
      desc: t("helpCenterContactDesc"),
      icon: <SupportAgentIcon />,
      color: "success",
    },
  ];
  const filtered = topics.filter((topic) =>
    `${topic.label} ${topic.desc}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function choose(id: "report" | "contact") {
    if (id === "contact") {
      // แอดมินเป็นคนใส่ข้อมูลติดต่อของตัวเอง / คนอื่นเปิดป๊อปอัพติดต่อแอดมิน
      if (isAdmin) {
        setView("adminContact");
        return;
      }
      onClose();
      onOpenContact();
      return;
    }
    setView("report");
  }

  const backButton = (
    <Button
      size="small"
      startIcon={<ArrowBackIcon />}
      onClick={() => setView(null)}
      sx={{
        mb: 2,
        borderRadius: 2,
        textTransform: "none",
        bgcolor: alpha(theme.palette.primary.main, 0.08),
        color: "primary.main",
        px: 1.5,
        "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.16) },
      }}
    >
      {t("helpCenterBack")}
    </Button>
  );

  return (
    <>
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{ sx: appDialogPaperSx }}
      sx={appDialogSx}
    >
      <DialogContent sx={{ p: 0, ...appDialogContentSizing }}>
        {/* การ์ดหัว — gradient จาก token ของ theme (ไม่ hardcode สี) */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            p: 2.5,
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.12)}, ${alpha(theme.palette.info.main, 0.04)})`,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "14px",
              display: "grid",
              placeItems: "center",
              bgcolor: alpha(theme.palette.primary.main, 0.16),
              color: "primary.main",
              boxShadow: theme.custom.cardShadow,
              flexShrink: 0,
            }}
          >
            <SupportAgentIcon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {t("helpCenter")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              IssueTrack Help Center
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label={t("close")}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        <Box sx={{ p: 2.5 }}>
          {view === "report" || view === "adminContact" ? (
            <>
              {backButton}
              {view === "report" ? (
                isAdmin ? (
                  /* แอดมิน = รายงานทั้งหมด (พร้อมชื่อผู้แจ้ง) / ลูกค้า = แค่ฟอร์ม */
                  <Box>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                      {ts("adminReportsTitle")}
                    </Typography>
                    {reports.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        {ts("adminReportsEmpty")}
                      </Typography>
                    ) : (
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {pageRows.map((report) => {
                          const statusLabel: Record<string, string> = {
                            open: ts("statusOpen"),
                            in_progress: ts("statusInProgress"),
                            resolved: ts("statusResolved"),
                            closed: ts("statusClosed"),
                          };
                          return (
                            <Box
                              key={report.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => void fetchSystemReport(report.id).then(setDetail)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") void fetchSystemReport(report.id).then(setDetail);
                              }}
                              sx={{
                                p: 1.5,
                                border: 1,
                                borderColor: "divider",
                                borderRadius: 2,
                                cursor: "pointer",
                                "&:hover": { bgcolor: "action.hover" },
                              }}
                            >
                              <Typography variant="body2" fontWeight={700}>
                                {report.title}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" component="div">
                                {ts("colReporter")}: {report.reporterName ?? `#${report.reporterId}`}
                                {" · "}
                                {statusLabel[report.status] ?? report.status}
                              </Typography>
                            </Box>
                          );
                        })}
                      </Box>
                    )}
                    {/* แบ่งหน้า 5 รายการ/หน้า — component ซ่อนตัวเองถ้า ≤ 1 หน้า
                        ข้อมูลทั้งหมดยังอยู่ใน state ไม่หาย กดเลขหน้าได้ครบ */}
                    <Pagination
                      page={page}
                      totalPages={totalPages}
                      total={reports.length}
                      limit={PAGE_SIZE}
                      onPageChange={setPage}
                    />
                  </Box>
                ) : (
                  <SystemReportForm onDone={onClose} />
                )
              ) : (
                <AdminContactForm />
              )}
            </>
          ) : (
            <>
              {/* การ์ดค้นหา */}
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  bgcolor: "action.hover",
                  border: 1,
                  borderColor: "divider",
                  mb: 2.5,
                }}
              >
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
                  {t("helpCenterSubtitle")}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  IssueTrack Help Center
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("helpCenterSearch")}
                  InputProps={{
                    startAdornment: <SearchIcon fontSize="small" color="action" sx={{ mr: 1 }} />,
                  }}
                />
              </Box>

              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
                {t("helpCenterTopics")}
              </Typography>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {filtered.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("helpCenterNoMatch")}
                  </Typography>
                ) : (
                  filtered.map((topic) => (
                    <Box
                      key={topic.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => choose(topic.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") choose(topic.id);
                      }}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        p: 1.5,
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 2.5,
                        cursor: "pointer",
                        transition: "transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease",
                        "&:hover": {
                          bgcolor: "action.hover",
                          transform: "translateY(-1px)",
                          boxShadow: theme.custom.cardShadow,
                        },
                      }}
                    >
                      <Box
                        sx={{
                          width: 44,
                          height: 44,
                          borderRadius: "14px",
                          display: "grid",
                          placeItems: "center",
                          bgcolor: alpha(theme.palette[topic.color].main, 0.14),
                          color: `${topic.color}.main`,
                          flexShrink: 0,
                        }}
                      >
                        {topic.icon}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={700}>
                          {topic.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {topic.desc}
                        </Typography>
                      </Box>
                      <ChevronRightIcon color="action" fontSize="small" />
                    </Box>
                  ))
                )}
              </Box>
            </>
          )}
        </Box>
      </DialogContent>
    </Dialog>
      <SystemReportDetailDialog
        report={detail}
        onClose={() => setDetail(null)}
        onUpdated={(updated) =>
          setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
        }
      />
    </>
  );
}
