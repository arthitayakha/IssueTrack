"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequireAuth from "@/components/require-auth";
import StatusDonut from "@/components/dashboard/status-donut";
import TrendChart from "@/components/dashboard/trend-chart";
import WorkloadCard from "@/components/dashboard/workload-card";
import UsageCard from "@/components/dashboard/usage-card";
import PriorityBars from "@/components/dashboard/priority-bars";
import { usePermissions } from "@/lib/permissions";
import { fetchDashboardSummary } from "@/lib/dashboard-api";
import { isNetworkError } from "@/lib/api";
import type {
  DashboardCountRow,
  DashboardPeriod,
  DashboardRange,
  DashboardScope,
  DashboardSummary,
} from "@kanban/shared";

/**
 * The dashboard (`/`) — one round trip to GET /dashboard/summary.
 *
 * Scope is permission-driven: `dashboard.overview.view` readers see the whole
 * system ("all"); everyone else gets their own slice — assigned for
 * programmers, reported for customers. The server re-checks and may downgrade
 * "all" → "own", so the echoed `summary.scope` labels the charts, never the
 * requested one.
 *
 * `range` is the trend chart's custom window (empty = the period default); it
 * lives here because it must survive the refetch it triggers.
 *
 * `statusFilter` is the status ring's cross-filter — clicking a slice sets it
 * and every aggregate except the ring itself refetches narrowed to that
 * status. The ring keeps its columns (the server ignores the filter for
 * `statuses`) and just highlights the choice, so it never collapses to the one
 * status it filtered by.
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
  const [range, setRange] = useState<DashboardRange>({ from: "", to: "" });
  /** The status ring's cross-filter — null = the whole dashboard. */
  const [statusFilter, setStatusFilter] = useState<{ id: number; name: string } | null>(null);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Newest request wins — the retry below must not clobber a fresher run. */
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    let failure: string | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const summary = await fetchDashboardSummary(scope, period, range, statusFilter?.id);
        if (seq !== seqRef.current) return;
        setData(summary);
        setError(null);
        setLoading(false);
        return;
      } catch (e) {
        if (seq !== seqRef.current) return;
        // The dev API restarts on every server edit (port closed for ~1-2s) —
        // one silent retry rides out that window instead of erroring at once.
        if (isNetworkError(e) && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        failure = isNetworkError(e)
          ? t("errorNetwork")
          : e instanceof Error
            ? e.message
            : t("errorDesc");
        break;
      }
    }

    if (seq !== seqRef.current) return;
    setError(failure);
    setLoading(false);
  }, [scope, period, range, statusFilter, t]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * A status deleted while it was filtering would leave every other chart
   * narrowed by an id the ring no longer knows (all-zero, with a hint that
   * says nothing is filtered) — drop the filter rather than show that.
   */
  useEffect(() => {
    if (statusFilter && data && !data.statuses.some((s) => s.id === statusFilter.id)) {
      setStatusFilter(null);
    }
  }, [statusFilter, data]);

  /** Ring click — toggle the cross-filter (clicking the selected one clears). */
  const handleStatusSelect = useCallback((row: DashboardCountRow) => {
    const { id, name } = row;
    if (id == null) return;
    setStatusFilter((cur) => (cur?.id === id ? null : { id, name: name ?? "" }));
  }, []);

  const showWorkload = can("dashboard.overview.view");
  const statusId = statusFilter?.id ?? null;

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
              {/* top row: สถานะ / การใช้งาน / ความสำคัญ — 3 คอลัมน์เท่ากันตั้งแต่ md */}
              <Box
                sx={{
                  display: "grid",
                  gap: 2.5,
                  gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
                  alignItems: "stretch",
                }}
              >
                <StatusDonut
                  rows={data.statuses}
                  total={data.total}
                  selectedId={statusId}
                  onSelect={handleStatusSelect}
                  scope={data.scope}
                />
                <UsageCard
                  apps={data.apps}
                  categories={data.categories}
                  scope={data.scope}
                  statusId={statusId}
                />
                <PriorityBars rows={data.priorities} />
              </Box>

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
                  range={range}
                  onRangeChange={setRange}
                  statusId={statusId}
                />
                {showWorkload && <WorkloadCard rows={data.workload} />}
              </Box>
            </>
          ) : null}
        </Box>
      </DashboardLayout>
    </RequireAuth>
  );
}
