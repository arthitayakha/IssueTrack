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
import { useTheme } from "@mui/material/styles";
import CheckIcon from "@mui/icons-material/Check";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequireAuth from "@/components/require-auth";
import StatusDonut from "@/components/dashboard/status-donut";
import TrendChart from "@/components/dashboard/trend-chart";
import WorkloadCard from "@/components/dashboard/workload-card";
import UsageCard from "@/components/dashboard/usage-card";
import PriorityBars from "@/components/dashboard/priority-bars";
import { useRouter } from "@/i18n/navigation";
import { drillHref } from "@/lib/dashboard-nav";
import { usePermissions } from "@/lib/permissions";
import { fetchDashboardSummary } from "@/lib/dashboard-api";
import { fetchCompanies, type Company } from "@/lib/apps-api";
import { isNetworkError } from "@/lib/api";
import type {
  DashboardCountRow,
  DashboardPeriod,
  DashboardRange,
  DashboardScope,
  DashboardSummary,
} from "@kanban/shared";

/** One row of the company menu — rounded, and the picked one keeps a tint. */
const COMPANY_ITEM_SX = {
  borderRadius: "8px",
  fontSize: 13,
  py: 0.75,
  px: 1.25,
  gap: 1,
  "&.Mui-selected": { bgcolor: "action.selected", fontWeight: 600 },
  "&.Mui-selected:hover": { bgcolor: "action.selected" },
} as const;

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
 * "all companies" again) and it is **hidden from customers altogether** —
 * their `scope` already limits them to the cards they reported, so a company
 * selector would either show a meaningless single option or imply they can
 * see other companies. Overview readers and programmers keep every visible
 * company as options.
 */
export default function HomePage() {
  const t = useTranslations("Dashboard");
  const theme = useTheme();
  const { can, roleName } = usePermissions();
  const router = useRouter();

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
   * Customers see only the cards they reported (server-enforced `scope`), so a
   * company selector is meaningless for them — hide it entirely rather than
   * offering one lonely option or implying they can see other companies.
   */
  const showCompanyPicker = roleName !== "customer";

  /**
   * The picker's options — display only; the server never trusts this list.
   * No options for a customer → the `companyOptions.length > 0` guard below
   * hides the whole picker. Overview readers and programmers alike get every
   * visible company.
   */
  const companyOptions = useMemo(
    () => (showCompanyPicker ? companies.filter((c) => c.isVisible) : []),
    [companies, showCompanyPicker],
  );

  /** "ทุกบริษัท" first, then the options — one list drives the whole menu. */
  const companyItems: { key: string; id: number | null; name: string }[] = [
    { key: "", id: null, name: t("company.all") },
    ...companyOptions.map((c) => ({ key: String(c.id), id: c.id, name: c.name })),
  ];

  /**
   * The company list is fetched once (customers skip it — no picker to feed);
   * if it fails (or a company disappears) the selection must not outlive its
   * own option — otherwise the filter would keep narrowing the page while its
   * picker is gone. Fail-open: drop the filter and show everything.
   */
  useEffect(() => {
    if (!showCompanyPicker) {
      // no options for a customer → mark loaded so a stale companyId is dropped
      setCompaniesLoaded(true);
      return;
    }
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
  }, [showCompanyPicker]);

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
  const canReport = can("report.view");
  const statusId = statusFilter?.id ?? null;

  /**
   * Workload's "open" count excludes only the done column (status id 4 —
   * `DONE_STATUS_ID` in the API). The report must carry that same set or its
   * rows would include finished cards the number never counted. A status
   * cross-filter already narrowed the count, so only that id is sent then.
   */
  const openStatusIds = useMemo(
    () =>
      (data?.statuses ?? []).flatMap((s) =>
        s.id == null || s.id === 4 ? [] : [s.id],
      ),
    [data],
  );
  const reportStatusIds = statusId != null ? [statusId] : openStatusIds;

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
              included); hidden when the seat has nothing to pick. A white
              rounded pill with an always-on divider border (matching the other
              filter pills — only the SIZE stays small here, 13/py 0.75): the
              floating label/notch is gone, the name comes from `renderValue`
              (no icon, no visible label — the label lives on as the control's
              `aria-label` only) and the menu floats with 14px corners + a check
              on the picked row. */}
          {companyOptions.length > 0 && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 1,
                flexWrap: "wrap",
                rowGap: 0.5,
              }}
            >
              <Select
                value={companyId == null ? "" : String(companyId)}
                onChange={(e) => setCompanyId(e.target.value === "" ? null : Number(e.target.value))}
                displayEmpty
                size="small"
                aria-label={t("company.label")}
                renderValue={(raw) => {
                  const value = typeof raw === "string" ? raw : "";
                  const picked = companyOptions.find((c) => String(c.id) === value);
                  return (
                    <Box sx={{ minWidth: 0 }}>
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {picked ? picked.name : t("company.all")}
                      </Typography>
                    </Box>
                  );
                }}
                MenuProps={{
                  slotProps: {
                    paper: {
                      sx: {
                        borderRadius: "14px",
                        mt: 1,
                        p: 0.75,
                        border: "1px solid",
                        borderColor: "divider",
                        boxShadow: theme.custom.cardShadow,
                        maxWidth: 320,
                      },
                    },
                  },
                }}
                sx={{
                  minWidth: 150,
                  maxWidth: { xs: "100%", sm: 300 },
                  bgcolor: "common.white",
                  borderRadius: "10px",
                  transition: "background-color 150ms ease",
                  "&:hover": { bgcolor: "grey.50" },
                  // divider line at rest (white-on-white would otherwise vanish)
                  // → grey.400 on hover → primary on focus, so keyboard users
                  // still see where they are (no hidden notch)
                  "& .MuiOutlinedInput-notchedOutline": { border: "1px solid", borderColor: "divider" },
                  "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "grey.400" },
                  "&.Mui-focused .MuiOutlinedInput-notchedOutline": { borderColor: "primary.main" },
                  "& .MuiSelect-select": { py: 0.75, pr: "28px !important" },
                }}
              >
                {companyItems.map((item) => (
                  <MenuItem key={item.key} value={item.key} sx={COMPANY_ITEM_SX}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, flex: 1 }}>
                      <Typography
                        sx={{
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.name}
                      </Typography>
                      {companyId === item.id && (
                        <CheckIcon
                          sx={{ fontSize: 16, ml: "auto", flexShrink: 0, color: "primary.main" }}
                        />
                      )}
                    </Box>
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
                  companyIds={data.companyIds}
                />
                <UsageCard
                  apps={data.apps}
                  categories={data.categories}
                  statusId={statusId}
                  companyIds={data.companyIds}
                />
                <PriorityBars
                  rows={data.priorities}
                  onSelect={(row) =>
                    router.push(
                      drillHref(canReport, {
                        ...(row.id == null ? { noPriority: 1 } : { priority: row.id }),
                        status: statusId,
                        company: companyIds,
                      }),
                    )
                  }
                />
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
                {showWorkload && (
                  <WorkloadCard
                    rows={data.workload}
                    onSelect={(row) =>
                      router.push(
                        drillHref(canReport, {
                          assignee: row.userId,
                          status: reportStatusIds,
                          company: companyIds,
                        }),
                      )
                    }
                  />
                )}
              </Box>
            </>
          ) : null}
        </Box>
      </DashboardLayout>
    </RequireAuth>
  );
}
