"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Select,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import CloseIcon from "@mui/icons-material/Close";
import InboxOutlinedIcon from "@mui/icons-material/InboxOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditIcon from "@mui/icons-material/Edit";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import { alpha, useTheme } from "@mui/material/styles";
import { useNotification } from "@/components/notification";
import { Pagination } from "@/components/pagination";
import { errorMessage } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { timeAgo } from "@/lib/time-ago";
import { useLocale } from "next-intl";
import {
  fetchSystemReports,
  VISIBLE_SYSTEM_REPORT_STATUSES,
  type SystemReport,
  type SystemReportStatus,
} from "@/lib/system-reports-api";
import {
  exportSystemReportsCsv,
  exportSystemReportsPdf,
} from "@/lib/system-report-export";
import {
  fetchHelpCenterContact,
  updateHelpCenterContact,
  type HelpCenterContact,
} from "@/lib/help-center-api";
import SystemReportForm from "@/components/help-center/system-report-form";
import SystemReportDetailDialog from "@/components/help-center/system-report-detail-dialog";

type TabKey = "report" | "contact";

/** 10 แถวต่อหน้า — เหมือนตารางประวัติการทำงาน */
const REPORT_PAGE_SIZE = 10;

/**
 * เปิดหน้าเขียนเมลของ Gmail บน browser แทน `mailto:` — ทำงานแม้เครื่องไม่มี
 * แอปเมลเริ่มต้น (จุดที่ปุ่มซองเดิมกดแล้วไม่มีอะไรเกิดขึ้น)
 */
function gmailComposeUrl(to: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}`;
}

const STATUS_KEYS: Record<SystemReportStatus, string> = {
  open: "statusOpen",
  in_progress: "statusInProgress",
  resolved: "statusResolved",
  closed: "statusClosed",
};
const STATUS_COLORS: Record<SystemReportStatus, "default" | "info" | "success"> = {
  open: "default",
  in_progress: "info",
  resolved: "success",
  closed: "default",
};

/** fail-open — API ยังไม่มีแถว/ยิงไม่ได้ก็โชว์ข้อมูลตามตัวอย่าง UI ได้ */
const FALLBACK_CONTACT: HelpCenterContact = {
  id: 1,
  supportEmail: "support@issuetrack.com",
  supportPhone: "02-123-4567",
  workingHours: "จันทร์ - ศุกร์ 09:00 - 18:00 น.",
  updatedAt: null,
};

/**
 * ศูนย์ช่วยเหลือ — dialog เดียว แถบ tab 2 อัน (แจ้งปัญหา / ติดต่อแอดมิน)
 * กด tab สลับการ์ดเดียว · ไม่มีการเปิดป๊อปอัพซ้อน
 *
 * ⚠️ ห้าม setState ตอน render (เคยเรียก onOpenContact ใน renderContact →
 * setContactTarget ใน Navbar → re-render → ลูป "Maximum update depth exceeded")
 */
export default function HelpCenterDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const tNav = useTranslations("Nav");
  const t = useTranslations("SystemReports");
  const tn = useTranslations("Notifications");
  const locale = useLocale();
  const theme = useTheme();
  const { notify } = useNotification();
  const { can } = usePermissions();
  const isAdmin = can("system_report.view");
  const canEdit = can("system_report.update");

  const [tab, setTab] = useState<TabKey>("report");
  const [reports, setReports] = useState<SystemReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportPage, setReportPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<SystemReportStatus | "all">("all");
  const [exporting, setExporting] = useState(false);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [selectedReport, setSelectedReport] = useState<SystemReport | null>(null);
  const [contact, setContact] = useState<HelpCenterContact>(FALLBACK_CONTACT);
  const [editingContact, setEditingContact] = useState(false);
  const [draft, setDraft] = useState({
    supportEmail: FALLBACK_CONTACT.supportEmail,
    supportPhone: FALLBACK_CONTACT.supportPhone,
    workingHours: FALLBACK_CONTACT.workingHours,
  });
  const [savingContact, setSavingContact] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  /** โหลดข้อมูลทั้งหมดตอนเปิด — fail-open ทุกทาง ไม่ให้ศูนย์ช่วยเหลือพังเพราะ API ตาย */
  useEffect(() => {
    if (!open) return;
    setTab("report");
    setReportPage(1);
    setStatusFilter("all");
    setEditingContact(false);

    setReportsLoading(true);
    void fetchSystemReports()
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setReportsLoading(false));

    void fetchHelpCenterContact()
      .then((data) => {
        setContact(data);
        setDraft({
          supportEmail: data.supportEmail,
          supportPhone: data.supportPhone,
          workingHours: data.workingHours,
        });
      })
      .catch(() => {
        /* คงค่าเริ่มต้นไว้ */
      });
  }, [open]);

  function reloadReports() {
    void fetchSystemReports()
      .then(setReports)
      .catch(() => {
        /* คงรายการเดิม */
      });
  }

  async function saveContact() {
    setSavingContact(true);
    try {
      const saved = await updateHelpCenterContact(draft);
      setContact(saved);
      setEditingContact(false);
      notify(t("contactSaved"), "success");
    } catch (e) {
      notify(errorMessage(e, t("adminContactError")), "error");
    } finally {
      setSavingContact(false);
    }
  }

  function copy(value: string, key: string) {
    void navigator.clipboard?.writeText(value).then(
      () => setCopied(key),
      () => {
        /* clipboard ถูกปฏิเสธ — ยังกด mailto:/tel: ได้อยู่ */
      },
    );
  }

  function renderReportsPanel() {
    // ตัวกรองสถานะทำฝั่ง client (GET /system-reports ไม่มีพารามิเตอร์ status) —
    // ส่งออก/แบ่งหน้า/ตัวเลขรวมใช้ชุดที่กรองแล้วชุดเดียวกับตาราง
    const visibleReports =
      statusFilter === "all" ? reports : reports.filter((r) => r.status === statusFilter);
    const totalPages = Math.max(1, Math.ceil(visibleReports.length / REPORT_PAGE_SIZE));
    const currentPage = Math.min(reportPage, totalPages);
    const pageRows = visibleReports.slice(
      (currentPage - 1) * REPORT_PAGE_SIZE,
      currentPage * REPORT_PAGE_SIZE,
    );

    const exportLabels = {
      title: t("adminReportsTitle"),
      count: t("totalReports", { count: visibleReports.length }),
      colTitle: t("colTitle"),
      colReporter: t("colReporter"),
      colStatus: t("colStatus"),
      colCreated: t("colCreated"),
      colAttachments: t("colAttachments"),
      status: Object.fromEntries(
        (["open", "in_progress", "resolved", "closed"] as SystemReportStatus[]).map((s) => [
          s,
          t(STATUS_KEYS[s]),
        ]),
      ),
    };

    function exportCsv() {
      exportSystemReportsCsv(visibleReports, exportLabels, `system-reports-${Date.now()}.csv`);
    }

    async function exportPdf() {
      setExporting(true);
      try {
        await exportSystemReportsPdf(visibleReports, exportLabels, `system-reports-${Date.now()}.pdf`);
      } catch {
        notify(t("exportFailed"), "error");
      } finally {
        setExporting(false);
      }
    }

    return (
      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2.5 }}>
        {/* แอดมินเห็นแค่ตารางรายงาน — ฟอร์มแจ้งปัญหาเป็นของลูกค้า/โปรแกรมเมอร์ */}
        {!isAdmin && <SystemReportForm onDone={reloadReports} onCancel={onClose} />}

        {isAdmin && (
          <>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700}>
                {t("adminReportsTitle")}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                <Select
                  size="small"
                  value={statusFilter}
                  aria-label={t("colStatus")}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as SystemReportStatus | "all");
                    setReportPage(1);
                  }}
                  sx={{ minWidth: 140 }}
                >
                  <MenuItem value="all">{t("filterAll")}</MenuItem>
                  {VISIBLE_SYSTEM_REPORT_STATUSES.map((s) => (
                    <MenuItem key={s} value={s}>
                      {t(STATUS_KEYS[s])}
                    </MenuItem>
                  ))}
                </Select>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FileDownloadOutlinedIcon />}
                  endIcon={<ArrowDropDownIcon />}
                  onClick={(e) => setExportAnchor(e.currentTarget)}
                  disabled={exporting || visibleReports.length === 0}
                >
                  {exporting ? <CircularProgress size={16} /> : t("export")}
                </Button>
                <Menu
                  anchorEl={exportAnchor}
                  open={Boolean(exportAnchor)}
                  onClose={() => setExportAnchor(null)}
                >
                  <MenuItem
                    onClick={() => {
                      setExportAnchor(null);
                      void exportPdf();
                    }}
                  >
                    {t("exportPdf")}
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      setExportAnchor(null);
                      exportCsv();
                    }}
                  >
                    {t("exportCsv")}
                  </MenuItem>
                </Menu>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                  {t("totalReports", { count: visibleReports.length })}
                </Typography>
              </Box>
            </Box>
            {reportsLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : visibleReports.length === 0 ? (
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.75,
                  py: 4,
                  color: "text.secondary",
                }}
              >
                <InboxOutlinedIcon sx={{ fontSize: 36, color: "text.disabled" }} />
                <Typography variant="body2">{t("adminReportsEmpty")}</Typography>
              </Box>
            ) : (
              <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: "action.hover" }}>
                      <TableCell sx={{ fontWeight: 700 }}>{t("colTitle")}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t("colReporter")}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t("colStatus")}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{t("colCreated")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pageRows.map((r) => (
                      <TableRow
                        key={r.id}
                        hover
                        sx={{ cursor: "pointer" }}
                        onClick={() => setSelectedReport(r)}
                      >
                        <TableCell sx={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.title}
                        </TableCell>
                        <TableCell>{r.reporterName ?? `#${r.reporterId}`}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            variant="outlined"
                            color={STATUS_COLORS[r.status] ?? "default"}
                            label={t(STATUS_KEYS[r.status] ?? "statusOpen")}
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{timeAgo(r.createdAt, locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Pagination
                  page={currentPage}
                  totalPages={totalPages}
                  total={visibleReports.length}
                  limit={REPORT_PAGE_SIZE}
                  onPageChange={setReportPage}
                />
              </Box>
            )}
          </>
        )}
      </Box>
    );
  }

  function renderContactPanel() {
    /** แถวข้อมูลติดต่อ 1 บรรทัด — ใช้ร่วมกันทั้งอีเมล/โทร/เวลาทำการ */
    function contactRow(
      key: string,
      icon: ReactNode,
      label: string,
      value: string,
      actions?: ReactNode,
    ) {
      return (
        <Box
          key={key}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            p: 1.5,
          }}
        >
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: 1.5,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              bgcolor: "action.hover",
              color: "primary.main",
              "& .MuiSvgIcon-root": { fontSize: 19 },
            }}
          >
            {icon}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" component="div">
              {label}
            </Typography>
            <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
              {value || "—"}
            </Typography>
          </Box>
          {actions}
        </Box>
      );
    }

    return (
      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {tNav("helpCenterContactLabel")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
          {t("contactIntro")}
        </Typography>

        {/* ข้อมูลติดต่อกลาง — แอดมินแก้ได้ (ไม่ซ้อนกรอบ: เหลือแค่กรอบ 3 แถว) */}
        <Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              mb: editingContact ? 2 : 1.5,
            }}
          >
            <Typography variant="body2" fontWeight={700}>
              {t("contactAdminTitle")}
            </Typography>
            {canEdit && !editingContact && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={() => {
                  setDraft({
                    supportEmail: contact.supportEmail,
                    supportPhone: contact.supportPhone,
                    workingHours: contact.workingHours,
                  });
                  setEditingContact(true);
                }}
              >
                {t("contactEdit")}
              </Button>
            )}
          </Box>

          {editingContact ? (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              <TextField
                label={t("contactEmail")}
                value={draft.supportEmail}
                onChange={(e) => setDraft((d) => ({ ...d, supportEmail: e.target.value }))}
                fullWidth
                size="small"
              />
              <TextField
                label={t("contactPhone")}
                value={draft.supportPhone}
                onChange={(e) => setDraft((d) => ({ ...d, supportPhone: e.target.value }))}
                fullWidth
                size="small"
              />
              <TextField
                label={t("contactWorkingHours")}
                value={draft.workingHours}
                onChange={(e) => setDraft((d) => ({ ...d, workingHours: e.target.value }))}
                fullWidth
                size="small"
              />
              <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                <Button size="small" onClick={() => setEditingContact(false)} disabled={savingContact}>
                  {t("cancel")}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => void saveContact()}
                  disabled={savingContact}
                >
                  {savingContact ? t("submitting") : t("contactSave")}
                </Button>
              </Box>
            </Box>
          ) : (
            <Box>
              {contactRow(
                "email",
                <EmailOutlinedIcon />,
                t("contactEmail"),
                contact.supportEmail,
                contact.supportEmail ? (
                  <>
                    <Tooltip title={tn("contactOpenEmail")}>
                      <IconButton
                        size="small"
                        component="a"
                        href={gmailComposeUrl(contact.supportEmail)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={tn("contactOpenEmail")}
                      >
                        <EmailOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={copied === "email" ? tn("contactCopied") : tn("contactCopy")}>
                      <IconButton
                        size="small"
                        onClick={() => copy(contact.supportEmail, "email")}
                        aria-label={tn("contactCopy")}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                ) : undefined,
              )}
              <Divider />
              {contactRow(
                "phone",
                <PhoneOutlinedIcon />,
                t("contactPhone"),
                contact.supportPhone,
                contact.supportPhone ? (
                  <>
                    <Tooltip title={tn("contactCall")}>
                      <IconButton
                        size="small"
                        component="a"
                        href={`tel:${contact.supportPhone}`}
                        aria-label={tn("contactCall")}
                      >
                        <PhoneOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={copied === "phone" ? tn("contactCopied") : tn("contactCopy")}>
                      <IconButton
                        size="small"
                        onClick={() => copy(contact.supportPhone, "phone")}
                        aria-label={tn("contactCopy")}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                ) : undefined,
              )}
              <Divider />
              {contactRow(
                "hours",
                <AccessTimeIcon />,
                t("contactWorkingHours"),
                contact.workingHours,
              )}
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  if (!open) return null;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: "hidden" } }}
      >
        {/* หัวกรอบ */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 3,
            py: 2,
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.info.main, 0.04)})`,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
              {tNav("helpCenter")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.6 }}>
              ISSUETRACK HELP CENTER
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label={tNav("close")}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>

        {/* แถบ tab */}
        <Tabs
          value={tab}
          onChange={(_, value: TabKey) => setTab(value)}
          variant="fullWidth"
          sx={{
            px: 2,
            borderBottom: 1,
            borderColor: "divider",
            minHeight: 48,
            "& .MuiTabs-indicator": { height: 3, borderRadius: "3px 3px 0 0" },
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 600,
              minHeight: 48,
              py: 1,
              color: "text.secondary",
              "&.Mui-selected": { color: "primary.main" },
            },
          }}
        >
          <Tab value="report" label={tNav("helpCenterTabReport")} />
          <Tab value="contact" label={tNav("helpCenterTabContact")} />
        </Tabs>

        <DialogContent
          dividers
          sx={{
            p: 2.5,
            // fixed height so switching tabs never resizes the dialog
            height: "min(70vh, 650px)",
            overflowY: "auto",
          }}
        >
          {tab === "report" ? renderReportsPanel() : renderContactPanel()}
        </DialogContent>
      </Dialog>

      <SystemReportDetailDialog
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onUpdated={(updated) =>
          setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
        }
      />
    </>
  );
}
