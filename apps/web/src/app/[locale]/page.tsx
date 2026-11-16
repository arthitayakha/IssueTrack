"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
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
import { fetchCompanies, type Company } from "@/lib/apps-api";
import { useAuthStore } from "@/lib/auth-store";
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
 *
 * `companyId` is the COMPANY picker at the top of the page — a data scope, not
 * a cross-filter: the server narrows EVERY aggregate (ring + total included)
 * to the cards whose reporter belongs to that company, the same rule the
 * board and `/reports` use. It is plain state (reloading the page starts on
 * "all companies" again) and the picker is only rendered when the seat has
 * something to pick (overview readers → every visible company, a customer →
 * their own company only, nobody-without-a-company customers → hidden).
 */
export default function HomePage() {
  const t = useTranslations("Dashboard");
  const { can, roleName } = usePermissions();
  const user = useAuthStore((s) => s.user);

  const scope: DashboardScope = can("dashboard.overview.view")
    ? "all"
    : roleName === "programmer"
      ? "assigned"
      : "reported";

  const [period, setPeriod] = useState<DashboardPeriod>("week");
  const [range, setRange] = useState<DashboardRange>({ from: "", to: "" });
  /** The status ring's cross-filter — null = the whole dashboard. */
  const [statusFilter, setStatusFilter] = useState<{ id: number; name: string } | null>(null);
  /** The company picker — null = every company (server side: `companyIds=[]`). */
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  /** Once the picker's source settled, a stale selection can be dropped. */
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Newest request wins — the retry below must not clobber a fresher run. */
  const seqRef = useRef(0);

  /** The company ids actually sent with the summary (empty = no filter). */
  const companyIds = useMemo(() => (companyId == null ? [] : [companyId]), [companyId]);

  /**
   * The picker's options — decided by how much of the system the seat can
   * already see (display only; the server never trusts this list):
   *
   *   - `dashboard.overview.view` → every visible company,
   *   - a customer → their OWN company only (their scope already limits them
   *     to their cards, so any other pick would just render zeros; `isVisible`
   *     is ignored here so master-data hiding never hides their own filter),
   *   - anyone else (e.g. a programmer) → every visible company,
   *   - a customer with no company → no options → the picker stays hidden.
   */
  const companyOptions = useMemo(() => {
    const visible = companies.filter((c) => c.isVisible);
    if (can("dashboard.overview.view")) return visible;
    if (roleName === "customer") {
      if (user?.companyId == null) return [];
      const own = companies.find((c) => c.id === user.companyId);
      return own ? [own] : [];
    }
    return visible;
  }, [companies, can, roleName, user?.companyId]);

  /**
   * The company list is fetched once; if it fails (or a company disappears)
   * the selection must not outlive its own option — otherwise the filter
   * would keep narrowing the page while its picker is gone. Fail-open: drop
   * the filter and show everything.
   */
  useEffect(() => {
    let cancelled = false;
    fetchCompanies()
      .then((res) => {
        if (!cancelled) setCompanies(res.data);
      })
      .catch(() => {
        // no options → the picker hides itself; nothing else to do
      })
      .finally(() => {
        if (!cancelled) setCompaniesLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!companiesLoaded || companyId == null) return;
    if (!companyOptions.some((c) => c.id === companyId)) setCompanyId(null);
  }, [companiesLoaded, companyId, companyOptions]);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    let failure: string | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const summary = await fetchDashboardSummary(
          scope,
          period,
          range,
          statusFilter?.id,
          companyIds,
        );
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
  }, [scope, period, range, statusFilter, companyIds, t]);

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

          {/* company picker — a data scope for the WHOLE page (ring + total
              included); hidden when the seat has nothing to pick */}
          {companyOptions.length > 0 && (
            <Box
              sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 1 }}
            >
              <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
                {t("company.label")}
              </Typography>
              <Select
                value={companyId == null ? "" : String(companyId)}
                onChange={(e) => setCompanyId(e.target.value === "" ? null : Number(e.target.value))}
                displayEmpty
                size="small"
                aria-label={t("company.label")}
                sx={{
                  minWidth: 220,
                  fontSize: 13,
                  bgcolor: "background.paper",
                  "& .MuiSelect-select": { py: 0.75, pr: "28px !important" },
                }}
              >
                <MenuItem value="">{t("company.all")}</MenuItem>
                {companyOptions.map((c) => (
                  <MenuItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            </Box>
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
                  companyIds={data.companyIds}
                />
                <UsageCard
                  apps={data.apps}
                  categories={data.categories}
                  scope={data.scope}
                  statusId={statusId}
                  companyIds={data.companyIds}
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
                  companyIds={data.companyIds}
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
