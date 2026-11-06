"use client";

import { useMemo, useState } from "react";
import { Box, Card, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DashboardPeriod,
  DashboardRange,
  DashboardScope,
  DashboardTrendRow,
} from "@kanban/shared";
import { DateRangeIconButton } from "@/components/date-range-select";
import IssuesDrillDialog, { type DrillSource } from "./issues-drill-dialog";
import { formatBucketLabel } from "./trend-labels";
import { useRouter } from "@/i18n/navigation";
import { usePermissions } from "@/lib/permissions";
import { bucketToRange, reportsHref } from "@/lib/dashboard-nav";

/**
 * Trend chart: new cards per bucket (day / week / month / year).
 *
 * The server returns only non-empty buckets (`date_trunc` in Bangkok time);
 * zero-filling the gaps is presentation, so it happens here — never an
 * aggregation. Every bar wears the same sky gradient from the theme — no
 * highlight for the peak.
 *
 * Two controls sit in the header:
 *   - the period toggle = the bucket size;
 *   - a 📅 popover = an optional custom window (`from`/`to`, Bangkok days).
 *     The window is echoed back by the server (`summary.from/to`) and this
 *     component mirrors the same fallback rules when zero-filling, so the bars
 *     never span a different period than the query did.
 *
 * Clicking a bar jumps to /reports filtered to that bucket's `from`/`to`
 * (plus the active status cross-filter) — the drill dialog only stays as a
 * fallback for users without `report.view`, who would otherwise be bounced
 * off the reports page.
 */

const PERIODS: DashboardPeriod[] = ["day", "week", "month", "year"];

/** Look-back buckets — must match the server's TREND_WINDOW_DAYS. */
const BUCKETS: Record<DashboardPeriod, number> = { day: 30, week: 12, month: 12, year: 3 };

/**
 * A custom range wider than this many buckets would render an unreadable
 * strip — the chart keeps the newest MAX_BUCKETS of the chosen span instead.
 * (Also guards against `from=1970-01-01` + period=day.)
 */
const MAX_BUCKETS = 400;

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** `yyyy-mm-dd` → local Date at midnight; null when malformed. */
function parseYmd(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** dd/mm/yyyy for the header — "…" on an open side of the range. */
function shortDate(value?: string): string {
  if (!value) return "…";
  const d = parseYmd(value);
  if (!d) return value;
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Bucket start (local wall clock) for a date at the given granularity. */
function bucketStart(d: Date, period: DashboardPeriod): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === "day") return s;
  if (period === "week") {
    // ISO week — Monday-based, same as Postgres date_trunc('week')
    const offset = (s.getDay() + 6) % 7;
    s.setDate(s.getDate() - offset);
    return s;
  }
  if (period === "month") return new Date(s.getFullYear(), s.getMonth(), 1);
  return new Date(s.getFullYear(), 0, 1);
}

function addPeriod(d: Date, period: DashboardPeriod, n: number): Date {
  const r = new Date(d);
  if (period === "day") r.setDate(r.getDate() + n);
  else if (period === "week") r.setDate(r.getDate() + 7 * n);
  else if (period === "month") r.setMonth(r.getMonth() + n);
  else r.setFullYear(r.getFullYear() + n);
  return r;
}

interface Bucket {
  bucket: string;
  count: number;
  /** Start-of-bucket Date for label formatting. */
  date: Date;
}

/**
 * Zero-fill inside the window the server used:
 *   custom `from` → that bucket; otherwise the period's look-back counted back
 *   from `to` (when only `to` was given) or from today; `to` caps the end.
 * Without a custom range this is exactly the old "last N buckets" behaviour,
 * leftover server buckets included.
 */
function zeroFilled(
  rows: DashboardTrendRow[],
  period: DashboardPeriod,
  range: DashboardRange,
): Bucket[] {
  const counts = new Map(rows.map((r) => [r.bucket, r.count]));
  const hasFrom = Boolean(range.from);
  const hasTo = Boolean(range.to);
  const custom = hasFrom || hasTo;

  const end = bucketStart(parseYmd(range.to) ?? new Date(), period);
  const start = hasFrom
    ? bucketStart(parseYmd(range.from) as Date, period)
    : addPeriod(end, period, -(BUCKETS[period] - 1));

  const out: Bucket[] = [];
  if (custom) {
    // newest MAX_BUCKETS of the span — a giant range must not freeze the page
    let cursor = start;
    if (bucketDistance(start, end, period) >= MAX_BUCKETS) {
      cursor = addPeriod(end, period, -(MAX_BUCKETS - 1));
    }
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard++ < MAX_BUCKETS) {
      const key = ymd(cursor);
      out.push({ bucket: key, count: counts.get(key) ?? 0, date: new Date(cursor) });
      counts.delete(key);
      cursor = addPeriod(cursor, period, 1);
    }
    // server buckets inside the span this clock did not line up with keep data
    const lo = out[0]?.bucket ?? "";
    const hi = out[out.length - 1]?.bucket ?? "";
    for (const [bucket, count] of counts) {
      if (count > 0 && bucket >= lo && bucket <= hi) {
        out.push({ bucket, count, date: new Date(`${bucket}T00:00:00`) });
      }
    }
  } else {
    for (let i = BUCKETS[period] - 1; i >= 0; i--) {
      const date = addPeriod(end, period, -i);
      const key = ymd(date);
      out.push({ bucket: key, count: counts.get(key) ?? 0, date });
      counts.delete(key);
    }
    // any bucket the server saw but this clock did not (timezone edge) keeps its data
    for (const [bucket, count] of counts) {
      if (count > 0) out.push({ bucket, count, date: new Date(`${bucket}T00:00:00`) });
    }
  }
  out.sort((a, b) => a.bucket.localeCompare(b.bucket));
  return out;
}

/** How many `period` steps separate two bucket starts (capped by the caller). */
function bucketDistance(a: Date, b: Date, period: DashboardPeriod): number {
  let n = 0;
  let cursor = a;
  while (cursor.getTime() < b.getTime() && n < MAX_BUCKETS + 1) {
    cursor = addPeriod(cursor, period, 1);
    n++;
  }
  return n;
}

interface DrillTarget {
  /** The bar behind the click — drives which endpoint the dialog calls. */
  source: DrillSource;
  /** "{label} · {count} งาน", built here where the bucket label lives. */
  title: string;
  count: number;
}

export default function TrendChart({
  rows,
  period,
  onPeriodChange,
  scope,
  range,
  onRangeChange,
  statusId,
}: {
  rows: DashboardTrendRow[];
  period: DashboardPeriod;
  onPeriodChange: (p: DashboardPeriod) => void;
  scope: DashboardScope;
  /** Custom window (yyyy-mm-dd) — empty strings mean "period default". */
  range: DashboardRange;
  onRangeChange: (range: DashboardRange) => void;
  /** The page's status cross-filter — a bar's list must match its count. */
  statusId?: number | null;
}) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const router = useRouter();
  const { can } = usePermissions();

  const [drill, setDrill] = useState<DrillTarget | null>(null);

  const data = useMemo(() => zeroFilled(rows, period, range), [rows, period, range]);
  const hasAny = data.some((b) => b.count > 0);
  const hasRange = Boolean(range.from || range.to);

  const labelOf = (key: string) => formatBucketLabel(key, period, locale);

  return (
    <>
      <Card
        elevation={0}
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          p: 2.5,
          borderRadius: "18px",
          border: "1px solid",
          borderColor: "divider",
          boxShadow: theme.custom.tableShadow,
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
            gap: 2,
            mb: 2,
            flexWrap: "wrap",
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{t("trend.title")}</Typography>
            <Typography sx={{ fontSize: "12.5px", color: "text.disabled", mt: "2px" }}>
              {t(`scope.${scope}`)}
              {hasRange ? ` · ${shortDate(range.from)} – ${shortDate(range.to)}` : ""}
              {hasAny ? ` · ${t("trend.hint")}` : ""}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            {/* calendar icon → the shared two-date popover (no preset menu here) */}
            <DateRangeIconButton
              value={{ from: range.from ?? "", to: range.to ?? "" }}
              onChange={onRangeChange}
              ariaLabel={t("trend.pickRange")}
            />
            <ToggleButtonGroup
              exclusive
              size="small"
              value={period}
              onChange={(_e, value: DashboardPeriod | null) => value && onPeriodChange(value)}
              sx={{
                bgcolor: "grey.100",
                borderRadius: "10px",
                "& .MuiToggleButton-root": {
                  border: "none",
                  borderRadius: "8px !important",
                  px: 1.5,
                  py: 0.5,
                  textTransform: "none",
                  fontSize: 13,
                  color: "text.secondary",
                  "&.Mui-selected": {
                    bgcolor: "background.paper",
                    color: "text.primary",
                    fontWeight: 700,
                    boxShadow: 1,
                  },
                },
              }}
            >
              {PERIODS.map((p) => (
                <ToggleButton key={p} value={p}>
                  {t(`period.${p}`)}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        </Box>

        {hasAny ? (
          <Box
            sx={{
              flex: 1,
              minHeight: 220,
              mx: -1,
              "& .recharts-bar-rectangle": { cursor: "pointer" },
              // recharts makes the <svg> focusable (accessibilityLayer) AND stamps
              // tabindex=-1 on the bar layer <g>; MUI restores focus to that <g>
              // when the drill-down dialog closes — which is exactly when Chrome
              // painted the frame around the plot. Nothing inside the chart ever
              // needs a visible ring (author styles beat the UA focus outline).
              "& .recharts-surface, & .recharts-surface *": { outline: "none" },
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 16, right: 8, bottom: 0, left: 0 }}
                // no focusable <svg>: it was the other source of the ring, and the
                // chart has no keyboard-only feature that needs it
                accessibilityLayer={false}
              >
                <defs>
                  <linearGradient id="dashBarFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.palette.sky.light} />
                    <stop offset="100%" stopColor={theme.palette.sky.main} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="bucket"
                  tickFormatter={labelOf}
                  interval="preserveStartEnd"
                  minTickGap={18}
                  tick={{ fontSize: 11, fill: theme.palette.text.disabled }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  width={32}
                  tick={{ fontSize: 11, fill: theme.palette.text.disabled }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: alpha(theme.palette.sky.main, 0.08) }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid",
                    borderColor: theme.palette.divider,
                    boxShadow: theme.custom.tableShadow,
                    fontSize: 12.5,
                  }}
                  labelFormatter={(label: ReactNode) =>
                    typeof label === "string" ? labelOf(label) : String(label ?? "")
                  }
                  formatter={(value) => [String(value), t("trend.title")]}
                />
                <Bar
                  dataKey="count"
                  fill="url(#dashBarFill)"
                  radius={[8, 8, 3, 3]}
                  onClick={(clicked) => {
                    const payload = clicked?.payload as Partial<Bucket> | undefined;
                    if (!payload?.bucket) return;
                    // to /reports with this bar's window (+ the status
                    // cross-filter as context); the dialog is only for seats
                    // without report.view, who cannot open the reports page
                    if (can("report.view")) {
                      const { from, to } = bucketToRange(payload.bucket, period);
                      router.push(reportsHref({ from, to, status: statusId }));
                      return;
                    }
                    const count = Number(payload.count ?? 0);
                    const label = formatBucketLabel(payload.bucket, period, locale, true);
                    setDrill({
                      source: { kind: "trend", bucket: payload.bucket, period },
                      title: t("trend.issuesTitle", { label, count }),
                      count,
                    });
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              minHeight: 220,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography sx={{ color: "text.disabled", fontSize: 13.5 }}>
              {t("trend.empty")}
            </Typography>
          </Box>
        )}
      </Card>

      {drill && (
        <IssuesDrillDialog
          title={drill.title}
          count={drill.count}
          source={drill.source}
          scope={scope}
          statusId={statusId}
          onClose={() => setDrill(null)}
        />
      )}
    </>
  );
}
