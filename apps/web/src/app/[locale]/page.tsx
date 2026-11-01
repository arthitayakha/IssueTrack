"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequireAuth from "@/components/require-auth";
import StatusCards from "@/components/dashboard/status-cards";
import TrendChart from "@/components/dashboard/trend-chart";
import WorkloadCard from "@/components/dashboard/workload-card";
import DonutCard from "@/components/dashboard/donut-card";
import PriorityBars from "@/components/dashboard/priority-bars";
import { usePermissions } from "@/lib/permissions";
import { fetchDashboardSummary } from "@/lib/dashboard-api";
import type { DashboardPeriod, DashboardScope, DashboardSummary } from "@kanban/shared";

/**
 * The dashboard (`/`) — one round trip to GET /dashboard/summary.
 *
 * Scope is permission-driven: `dashboard.overview.view` readers see the whole
 * system ("all"); everyone else gets their own slice — assigned for
 * programmers, reported for customers. The server re-checks and may downgrade
 * "all" → "own", so the echoed `summary.scope` labels the charts, never the
 * requested one.
 */
export default function HomePage() {
  const t = useTranslations("Dashboard");
  const { can, roleName } = usePermissions();

  const scope: DashboardScope = can("dashboard.overview.view")
    ? "all"
    : roleName === "programmer"
      ? "assigned"
      : "reported";

  const [period, setPeriod] = useState<DashboardPeriod>("week");
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await fetchDashboardSummary(scope, period);
      setData(summary);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errorDesc"));
    } finally {
      setLoading(false);
    }
  }, [scope, period, t]);

  useEffect(() => {
    load();
  }, [load]);

  const showWorkload = can("dashboard.overview.view");

  return (
    <RequireAuth>
      <DashboardLayout>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3, py: 1 }}>
          {error && (
            <Alert
              severity="error"
              action={
                <Button color="inherit" size="small" onClick={load}>
                  {t("retry")}
                </Button>
              }
            >
              <Typography sx={{ fontWeight: 700 }}>{t("errorTitle")}</Typography>
              {error}
            </Alert>
          )}

          {loading && !data ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : data ? (
            <>
              <StatusCards rows={data.statuses} />

              {/* main row: trend 2/3 + การทำงาน 1/3 (กราฟเต็มกว้างเมื่อไม่มีสิทธิ์ภาพรวม) */}
              <Box
                sx={{
                  display: "grid",
                  gap: 2.5,
                  gridTemplateColumns: { xs: "1fr", md: showWorkload ? "2fr 1fr" : "1fr" },
                  alignItems: "stretch",
                }}
              >
                <TrendChart
                  rows={data.trend}
                  period={period}
                  onPeriodChange={setPeriod}
                  scope={data.scope}
                />
                {showWorkload && <WorkloadCard rows={data.workload} />}
              </Box>

              {/* bottom row: แอป / หมวดหมู่ / ความสำคัญ */}
              <Box
                sx={{
                  display: "grid",
                  gap: 2.5,
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "repeat(2, minmax(0, 1fr))",
                    lg: "repeat(3, minmax(0, 1fr))",
                  },
                }}
              >
                <DonutCard
                  title={t("apps.title")}
                  rows={data.apps}
                  emptyText={t("apps.empty")}
                />
                <DonutCard
                  title={t("categories.title")}
                  rows={data.categories}
                  emptyText={t("categories.empty")}
                />
                <PriorityBars rows={data.priorities} />
              </Box>
            </>
          ) : null}
        </Box>
      </DashboardLayout>
    </RequireAuth>
  );
}
