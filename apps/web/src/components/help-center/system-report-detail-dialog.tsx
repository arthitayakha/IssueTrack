"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { useNotification } from "@/components/notification";
import {
  appDialogContentSizing,
  appDialogPaperSx,
  appDialogSx,
} from "@/components/common/dialog-style";
import { errorMessage } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import {
  fetchSystemReportAttachment,
  updateSystemReportStatus,
  type SystemReport,
  type SystemReportStatus,
} from "@/lib/system-reports-api";

const STATUSES: SystemReportStatus[] = ["open", "in_progress", "resolved", "closed"];
const STATUS_KEYS: Record<SystemReportStatus, string> = {
  open: "statusOpen",
  in_progress: "statusInProgress",
  resolved: "statusResolved",
  closed: "statusClosed",
};

/** รายละเอียดรายงาน — เปิดจากรายการในศูนย์ช่วยเหลือของแอดมิน (ไม่มีหน้าแยก) */
export default function SystemReportDetailDialog({
  report,
  onClose,
  onUpdated,
}: {
  report: SystemReport | null;
  onClose: () => void;
  onUpdated: (report: SystemReport) => void;
}) {
  const t = useTranslations("SystemReports");
  const { notify } = useNotification();
  const { can } = usePermissions();
  const [status, setStatus] = useState<SystemReportStatus>("open");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (report) setStatus(report.status);
  }, [report]);

  if (!report) return null;

  async function download(attachmentId: number, fileName: string) {
    try {
      const blob = await fetchSystemReportAttachment(report!.id, attachmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify(errorMessage(e, t("error")), "error");
    }
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await updateSystemReportStatus(report!.id, status);
      onUpdated(updated);
      notify(t("statusUpdated"), "success");
      onClose();
    } catch (e) {
      notify(errorMessage(e, t("error")), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={false}
      PaperProps={{ sx: appDialogPaperSx }}
      sx={appDialogSx}
    >
      <DialogTitle
        sx={{
          background: (theme) =>
            `linear-gradient(135deg, ${theme.palette.primary.main}14, ${theme.palette.info.main}08)`,
          borderBottom: 1,
          borderColor: "divider",
          fontWeight: 700,
        }}
      >
        {t("detailTitle")}
      </DialogTitle>
      <DialogContent dividers sx={appDialogContentSizing}>
        <Typography variant="subtitle1" fontWeight={700}>
          {report.title}
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {t("colReporter")}: <b>{report.reporterName ?? `#${report.reporterId}`}</b>
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {t("reporterEmail")}: {report.reporterEmail || "—"} ·{" "}
          {t("reporterPhone")}: {report.reporterPhone || "—"}
        </Typography>
        {report.pageUrl && (
          <Typography variant="body2" sx={{ mt: 1.5 }}>
            {t("fieldPage")}: {report.pageUrl}
          </Typography>
        )}
        <Typography variant="body2" sx={{ mt: 2, whiteSpace: "pre-wrap" }}>
          {report.description}
        </Typography>

        {report.attachments.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {t("colAttachments")}
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.75 }}>
              {report.attachments.map((a) => (
                <Chip
                  key={a.id}
                  size="small"
                  variant="outlined"
                  label={a.fileName}
                  onClick={() => void download(a.id, a.fileName)}
                />
              ))}
            </Box>
          </Box>
        )}

        {can("system_report.update") && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 3 }}>
            <Typography variant="body2">{t("changeStatus")}:</Typography>
            <Select
              size="small"
              value={status}
              onChange={(e) => setStatus(e.target.value as SystemReportStatus)}
            >
              {STATUSES.map((s) => (
                <MenuItem key={s} value={s}>
                  {t(STATUS_KEYS[s])}
                </MenuItem>
              ))}
            </Select>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("close")}</Button>
        {can("system_report.update") && (
          <Button variant="contained" onClick={() => void save()} disabled={saving}>
            {saving ? <CircularProgress size={18} /> : t("submit")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
