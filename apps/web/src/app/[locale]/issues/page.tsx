"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { fetchIssues, type BoardIssue } from "@/lib/board-api";

const PAGE_SIZE = 20;

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
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  // First page — also re-runs when the auth token appears/changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchIssues(1, PAGE_SIZE)
      .then((res) => {
        if (cancelled) return;
        setIssues(res.data);
        setHasMore(res.page < res.totalPages);
        setPage(1);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const next = page + 1;
    fetchIssues(next, PAGE_SIZE)
      .then((res) => {
        setIssues((prev) => {
          const seen = new Set(prev.map((i) => i.id));
          const fresh = res.data.filter((i) => !seen.has(i.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        });
        setHasMore(res.page < res.totalPages);
        setPage(res.page);
      })
      .catch(() => {})
      .finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [page]);

  // Scroll down → pull the remaining issues (infinite scroll).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <RequirePermission permission="issue.own.view">
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
                    {issue.appName && (
                      <Chip
                        label={issue.appName}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ mr: 1, mt: 0.5 }}
                      />
                    )}
                    <Chip
                      label={`${t("trackedTime")}: ${formatDuration(issue.trackedDuration)}`}
                      size="small"
                      variant="outlined"
                      sx={{ mt: 0.5 }}
                    />
                  </Box>
                </Box>
              ))}
              <Box ref={sentinelRef} sx={{ height: 1 }} />
              {loadingMore && (
                <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              )}
            </Box>
          )}
        </Box>
      </DashboardLayout>
    </RequirePermission>
  );
}
