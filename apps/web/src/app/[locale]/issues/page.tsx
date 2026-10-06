"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Chip,
} from "@mui/material";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequireAuth from "@/components/require-auth";
import { useAuthStore } from "@/lib/auth-store";
import { apiFetch, ApiError } from "@/lib/api";
import { useNotification } from "@/components/notification";

interface Issue {
  id: number;
  title: string;
  description: string;
  columnId: number;
  statusId: number | null;
  priorityId: number | null;
  categoryId: number;
  programmerId: number | null;
  customerId: number;
  trackedDuration: number;
  actualFixDuration: number | null;
  assignedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function IssuesPage() {
  const t = useTranslations("Issues");
  const token = useAuthStore((s) => s.token);
  const { notify } = useNotification();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeDialogOpen, setTimeDialogOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [actualDuration, setActualDuration] = useState("");

  useEffect(() => {
    apiFetch<Issue[]>("/issues/boards/1/issues", {}, token)
      .then(setIssues)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  function openTimeDialog(issue: Issue) {
    setSelectedIssue(issue);
    setActualDuration(issue.actualFixDuration?.toString() ?? "");
    setTimeDialogOpen(true);
  }

  async function handleSaveTime() {
    if (!selectedIssue) return;
    try {
      const duration = parseInt(actualDuration, 10);
      if (isNaN(duration) || duration < 0) {
        notify("Invalid duration", "error");
        return;
      }
      await apiFetch(
        `/issues/${selectedIssue.id}/time`,
        { method: "PUT", body: JSON.stringify({ actualFixDuration: duration }) },
        token,
      );
      setIssues((prev) =>
        prev.map((i) =>
          i.id === selectedIssue.id ? { ...i, actualFixDuration: duration } : i,
        ),
      );
      setTimeDialogOpen(false);
      notify("Time updated");
    } catch (err) {
      if (err instanceof ApiError) {
        notify(err.message, "error");
      } else {
        notify("Failed to update time", "error");
      }
    }
  }

  return (
    <RequireAuth>
      <DashboardLayout>
        <Box sx={{ py: 4 }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            {t("title")}
          </Typography>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
              <CircularProgress />
            </Box>
          ) : issues.length === 0 ? (
            <Typography variant="body1" color="text.secondary">
              {t("noIssues")}
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {issues.map((issue) => (
                <Box
                  key={issue.id}
                  sx={{
                    p: 2,
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {issue.title}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
                      <Chip
                        label={`${t("trackedTime")}: ${formatDuration(issue.trackedDuration)}`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={`${t("actualTime")}: ${formatDuration(issue.actualFixDuration)}`}
                        size="small"
                        variant="outlined"
                        color={issue.actualFixDuration ? "success" : "default"}
                      />
                    </Box>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => openTimeDialog(issue)}
                  >
                    {t("setActualTime")}
                  </Button>
                </Box>
              ))}
            </Box>
          )}
        </Box>

        <Dialog open={timeDialogOpen} onClose={() => setTimeDialogOpen(false)} maxWidth="xs">
          <DialogTitle>{t("setActualTime")}</DialogTitle>
          <DialogContent>
            <TextField
              label={t("actualTime")}
              type="number"
              value={actualDuration}
              onChange={(e) => setActualDuration(e.target.value)}
              fullWidth
              sx={{ mt: 1 }}
              inputProps={{ min: 0 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTimeDialogOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleSaveTime}>
              Save
            </Button>
          </DialogActions>
        </Dialog>
      </DashboardLayout>
    </RequireAuth>
  );
}
