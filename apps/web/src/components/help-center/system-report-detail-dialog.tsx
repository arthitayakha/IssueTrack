"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useNotification } from "@/components/notification";
import {
  appDialogContentSizing,
  appDialogPaperSx,
  appDialogSx,
} from "@/components/common/dialog-style";
import { errorMessage } from "@/lib/api";
import { usePermissions } from "@/lib/permissions";
import { timeAgo } from "@/lib/time-ago";
import {
  fetchSystemReportAttachment,
  updateSystemReportStatus,
  VISIBLE_SYSTEM_REPORT_STATUSES,
  type SystemReport,
  type SystemReportStatus,
} from "@/lib/system-reports-api";

// `closed` remains in the type/labels for legacy rows but is no longer offered.
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
  const locale = useLocale();
  const { notify } = useNotification();
  const { can } = usePermissions();
  const [status, setStatus] = useState<SystemReportStatus>("open");
  const [saving, setSaving] = useState(false);
  /** A legacy `closed` row opens on the last live status; saving converts it. */
  const baselineStatus: SystemReportStatus =
    report?.status === "closed" ? "resolved" : (report?.status ?? "open");

  useEffect(() => {
    if (report) setStatus(baselineStatus);
  }, [report, baselineStatus]);

  if (!report) return null;
  const dirty = status !== baselineStatus;

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

  const infoTiles: { label: string; value: string }[] = [
    { label: t("reporterEmail"), value: report.reporterEmail ?? "" },
    { label: t("reporterPhone"), value: report.reporterPhone ?? "" },
    ...(report.pageUrl ? [{ label: t("fieldPage"), value: report.pageUrl }] : []),
  ];

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
          px: 2.5,
          py: 1.75,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} lineHeight={1.3}>
              {t("detailTitle")}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              #{report.id} · {t("colCreated")} {timeAgo(report.createdAt, locale)}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label={t("close")} sx={{ mt: -0.5, mr: -0.5 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers sx={{ ...appDialogContentSizing, p: 2 }}>
        {/* identity */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Avatar sx={{ width: 44, height: 44, fontWeight: 700, flexShrink: 0 }}>
            {(report.reporterName ?? "#").trim().charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3, overflowWrap: "anywhere" }}>
              {report.title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("colReporter")}: <b>{report.reporterName ?? `#${report.reporterId}`}</b>
            </Typography>
          </Box>
        </Box>

        {/* contact tiles */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))" },
            gap: 1,
            mt: 1.5,
          }}
        >
          {infoTiles.map(({ label, value }) => (
            <Box
              key={label}
              sx={{ border: 1, borderColor: "divider", borderRadius: 2, px: 1.5, py: 1, minWidth: 0 }}
            >
              <Typography variant="caption" color="text.secondary" display="block">
                {label}
              </Typography>
              <Typography variant="body2" noWrap title={value}>
                {value || "—"}
              </Typography>
            </Box>
          ))}
          {can("system_report.update") && (
            <Box
              sx={{ border: 1, borderColor: "divider", borderRadius: 2, px: 1.5, py: 1, minWidth: 0 }}
            >
              <Typography variant="caption" color="text.secondary" display="block">
                {t("colStatus")}
              </Typography>
              <Select
                size="small"
                value={status}
                onChange={(e) => setStatus(e.target.value as SystemReportStatus)}
                sx={{
                  mt: 0.25,
                  width: "100%",
                  "& .MuiSelect-select": {
                    py: 0.25,
                    fontSize: 14,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                }}
              >
                {VISIBLE_SYSTEM_REPORT_STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {t(STATUS_KEYS[s])}
                  </MenuItem>
                ))}
              </Select>
            </Box>
          )}
        </Box>

        {/* description */}
        <Box sx={{ mt: 1.75 }}>
          <Typography variant="caption" color="text.secondary" display="block">
            {t("fieldDescription")}
          </Typography>
          <Box
            sx={{
              mt: 0.5,
              px: 1.5,
              py: 1.25,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              whiteSpace: "pre-wrap",
            }}
          >
            <Typography variant="body2">{report.description}</Typography>
          </Box>
        </Box>

        {report.attachments.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary" display="block">
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("close")}</Button>
        {can("system_report.update") && (
          <Button variant="contained" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? <CircularProgress size={18} /> : t("save")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
