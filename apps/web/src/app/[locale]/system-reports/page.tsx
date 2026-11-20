"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Alert,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { useNotification } from "@/components/notification";
import { appDialogPaperSx } from "@/components/common/dialog-style";
import { usePermissions } from "@/lib/permissions";
import { errorMessage } from "@/lib/api";
import { timeAgo } from "@/lib/time-ago";
import {
  fetchSystemReport,
  fetchSystemReportAttachment,
  fetchSystemReports,
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
const STATUS_COLORS: Record<SystemReportStatus, "default" | "info" | "success"> = {
  open: "default",
  in_progress: "info",
  resolved: "success",
  closed: "default",
};

function DetailDialog({
  report,
  canUpdate,
  onClose,
  onUpdated,
}: {
  report: SystemReport;
  canUpdate: boolean;
  onClose: () => void;
  onUpdated: (report: SystemReport) => void;
}) {
  const t = useTranslations("SystemReports");
  const { notify } = useNotification();
  const [status, setStatus] = useState<SystemReportStatus>(report.status);
  const [saving, setSaving] = useState(false);

  useEffect(() => setStatus(report.status), [report]);

  async function openAttachment(attachmentId: number, fileName: string) {
    try {
      const blob = await fetchSystemReportAttachment(report.id, attachmentId);
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
      const updated = await updateSystemReportStatus(report.id, status);
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
    <Dialog open onClose={onClose} maxWidth={false} PaperProps={{ sx: appDialogPaperSx }}>
      <DialogTitle>{t("detailTitle")}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle1" fontWeight={700}>
          {report.title}
        </Typography>
        <Typography variant="body2" color="text.primary" sx={{ mt: 0.5 }}>
          {t("colReporter")}: <b>{report.reporterName ?? `#${report.reporterId}`}</b>
        </Typography>
        <Typography variant="caption" color="text.secondary" component="div">
          {t("reporterEmail")}: {report.reporterEmail || "—"}
          {" · "}
          {t("reporterPhone")}: {report.reporterPhone || "—"}
        </Typography>
        {report.pageUrl && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            {report.pageUrl}
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
                  onClick={() => void openAttachment(a.id, a.fileName)}
                />
              ))}
            </Box>
          </Box>
        )}

        {canUpdate && (
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
        {canUpdate && (
          <Button variant="contained" onClick={() => void save()} disabled={saving}>
            {saving ? <CircularProgress size={18} /> : t("submit")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default function SystemReportsPage() {
  const t = useTranslations("SystemReports");
  const locale = useLocale();
  const { can } = usePermissions();
  const { notify } = useNotification();
  const [rows, setRows] = useState<SystemReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SystemReport | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSystemReports();
      setRows(data);
      // แจ้งเตือนลิงก์ `/system-reports?report=ID` → เปิดรายงานนั้นทันที
      const id = Number(new URLSearchParams(window.location.search).get("report"));
      if (id > 0) {
        const target = data.find((r) => r.id === id) ?? (await fetchSystemReport(id));
        setSelected(target);
      }
    } catch (e) {
      setError(errorMessage(e, t("error")));
      notify(errorMessage(e, t("error")), "error");
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequirePermission permission="system_report.view">
      <DashboardLayout>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
          {t("title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {t("subtitle")}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : rows.length === 0 ? (
          <Typography color="text.secondary">{t("listEmpty")}</Typography>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t("colTitle")}</TableCell>
                <TableCell>{t("colReporter")}</TableCell>
                <TableCell>{t("colStatus")}</TableCell>
                <TableCell>{t("colAttachments")}</TableCell>
                <TableCell>{t("colCreated")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => setSelected(row)}
                >
                  <TableCell>{row.title}</TableCell>
                  <TableCell>{row.reporterName ?? `#${row.reporterId}`}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={STATUS_COLORS[row.status] ?? "default"}
                      label={t(STATUS_KEYS[row.status] ?? "statusOpen")}
                    />
                  </TableCell>
                  <TableCell>{row.attachments.length || "—"}</TableCell>
                  <TableCell>{timeAgo(row.createdAt, locale)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {selected && (
          <DetailDialog
            report={selected}
            canUpdate={can("system_report.update")}
            onClose={() => setSelected(null)}
            onUpdated={(updated) =>
              setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
            }
          />
        )}
      </DashboardLayout>
    </RequirePermission>
  );
}
