"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Box,
  Typography,
  CircularProgress,
  Chip,
} from "@mui/material";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { useAuthStore } from "@/lib/auth-store";
import { Pagination } from "@/components/pagination";
import { fetchIssues, type BoardIssue } from "@/lib/board-api";

function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
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
  const [issues, setIssues] = useState<BoardIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchIssues(1, 10)
      .then((res) => {
        setIssues(res.data);
        setTotalPages(res.totalPages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const pageIssues = issues.slice((page - 1) * 10, page * 10);


  return (
    <RequirePermission permission="issue.all.view">
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
              {pageIssues.map((issue) => (
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
                      <Chip
                      label={`${t("trackedTime")}: ${formatDuration(issue.trackedDuration)}`}
                      size="small"
                      variant="outlined"
                    />
                  </Box>
                </Box>
              ))}
              <Pagination
                page={page}
                totalPages={totalPages}
                total={issues.length}
                limit={10}
                onPageChange={setPage}
              />
            </Box>
          )}
        </Box>
      </DashboardLayout>
    </RequirePermission>
  );
}
