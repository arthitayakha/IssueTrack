"use client";

import { useMemo, useRef, useState } from "react";
import { Box, Card, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useLocale, useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type {
  DashboardPeriod,
  DashboardRange,
  DashboardScope,
  DashboardTrendRow,
  DashboardTrendSeries,
} from "@kanban/shared";
import { DateRangeIconButton } from "@/components/date-range-select";
import { formatBucketLabel } from "./trend-labels";
import { useRouter } from "@/i18n/navigation";
import { usePermissions } from "@/lib/permissions";
import { bucketToRange, drillHref } from "@/lib/dashboard-nav";

/**
 * Trend chart: two bars per bucket (day / week / month / year) —
 *   - **รอดำเนินการ** = cards CREATED inside the bucket that are still NOT in
 *     the done column right now (every other status, including no status);
 *   - **เสร็จสิ้น** = cards created in that same bucket that ARE in the done
 *     column right now.
 *
 * Both bars are one cohort split by CURRENT status, so `pending + done =
 * total`. It is a snapshot, not an event log: finishing last month then
 * dragging back counts as pending today. The tooltip prints only the series
 * under the pointer, not the whole split.
 *
 * The server returns only non-empty buckets (`date_trunc` in Bangkok time)
 * and one row carries all three counts; zero-filling the gaps is presentation,
 * so it happens here — never an aggregation. The two bars wear theme colours
 * only (indigo = pending, cyan = done).
 *
 * Two controls sit in the header:
 *   - the period toggle = the bucket size;
 *   - a 📅 popover = an optional custom window (`from`/`to`, Bangkok days).
 *     The window is echoed back by the server (`summary.from/to`) and this
 *     component mirrors the same fallback rules when zero-filling, so the bars
 *     never span a different period than the query did.
 *
 * Clicking EITHER bar navigates to /reports filtered to that bucket's
 * `from`/`to` (plus the active status and company filters) — or to
 * /boards?view=table with the same window for seats without `report.view`.
 * Both bars send `series=pending|done` so the destination adds the matching
 * current-status clause (`status=4` / `notDone=1`) and the list adds up to the
 * number on the bar.
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
  /** Cards born in the bucket that are still not done. */
  pending: number;
  /** Cards born in the bucket that are in the done column now. */
  done: number;
  /** The whole cohort — pending + done. */
  total: number;
  /** Start-of-bucket Date for label formatting. */
  date: Date;
}

/**
 * Zero-fill inside the window the server used:
 *   custom `from` → that bucket; otherwise the period's look-back counted back
 *   from `to` (when only `to` was given) or from today; `to` caps the end.
 * Without a custom range this is exactly the old "last N buckets" behaviour,
 * leftover server buckets included. Both series are filled together — a
 * bucket with only completions (or only creations) must still render.
 */
function zeroFilled(
  rows: DashboardTrendRow[],
  period: DashboardPeriod,
  range: DashboardRange,
): Bucket[] {
  const counts = new Map(
    rows.map((r) => [r.bucket, { pending: r.pending, done: r.done, total: r.total }]),
  );
  const hasFrom = Boolean(range.from);
  const hasTo = Boolean(range.to);
  const custom = hasFrom || hasTo;

  const end = bucketStart(parseYmd(range.to) ?? new Date(), period);
  const start = hasFrom
    ? bucketStart(parseYmd(range.from) as Date, period)
    : addPeriod(end, period, -(BUCKETS[period] - 1));

  const bucketOf = (key: string, date: Date): Bucket => {
    const seen = counts.get(key);
    counts.delete(key);
    return {
      bucket: key,
      pending: seen?.pending ?? 0,
      done: seen?.done ?? 0,
      total: seen?.total ?? 0,
      date,
    };
  };

  const out: Bucket[] = [];
  if (custom) {
    // newest MAX_BUCKETS of the span — a giant range must not freeze the page
    let cursor = start;
    if (bucketDistance(start, end, period) >= MAX_BUCKETS) {
      cursor = addPeriod(end, period, -(MAX_BUCKETS - 1));
    }
    let guard = 0;
    while (cursor.getTime() <= end.getTime() && guard++ < MAX_BUCKETS) {
      out.push(bucketOf(ymd(cursor), new Date(cursor)));
      cursor = addPeriod(cursor, period, 1);
    }
    // server buckets inside the span this clock did not line up with keep data
    const lo = out[0]?.bucket ?? "";
    const hi = out[out.length - 1]?.bucket ?? "";
    for (const [bucket, seen] of counts) {
      if ((seen.pending > 0 || seen.done > 0) && bucket >= lo && bucket <= hi) {
        out.push(bucketOf(bucket, new Date(`${bucket}T00:00:00`)));
      }
    }
  } else {
    for (let i = BUCKETS[period] - 1; i >= 0; i--) {
      const date = addPeriod(end, period, -i);
      out.push(bucketOf(ymd(date), date));
    }
    // any bucket the server saw but this clock did not (timezone edge) keeps its data
    for (const [bucket, seen] of counts) {
      if (seen.pending > 0 || seen.done > 0) {
        out.push(bucketOf(bucket, new Date(`${bucket}T00:00:00`)));
      }
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

/**
 * Y-axis scale derived from the data instead of fixed 8/16/24/32: aim for
 * ~4 intervals and round the step up to a readable number (a multiple of 50
 * once we reach the hundreds). The top is the first step that covers the
 * peak, so the labels change as soon as the data does — 31 gives
 * 0/8/16/24/32, 400 gives 0/100/200/300/400, 450 gives 0/150/300/450.
 */
function yAxisTicks(peak: number): { domain: [number, number]; ticks: number[] } {
  const raw = Math.max(1, Math.ceil(Math.max(0, peak) / 4));
  const step = raw >= 100 ? Math.ceil(raw / 50) * 50 : raw;
  const top = Math.max(step, Math.ceil(Math.max(0, peak) / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top; value += step) ticks.push(value);
  return { domain: [0, top], ticks };
}

export default function TrendChart({
  rows,
  period,
  onPeriodChange,
  scope,
  range,
  onRangeChange,
  statusId,
  companyIds,
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
  /** The page's company filter — carried into /reports. */
  companyIds?: number[];
}) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");
  const locale = useLocale();
  const router = useRouter();
  const { can } = usePermissions();

  /**
   * Our own tooltip — Recharts' <Tooltip> is deliberately NOT used: it owns
   * the active index and positions the box at the hovered bar's centre, which
   * puts it away from the cursor. Here the box follows the pointer exactly.
   */
  type TrendHover = {
    x: number;
    y: number;
    label: string;
    /** Which bar is under the pointer — the tooltip prints this series only. */
    seriesKey: DashboardTrendSeries;
    value: number;
  };
  const [hover, setHover] = useState<TrendHover | null>(null);
  /** Latest pointer position, so a bar's onMouseEnter can place the box
   * on the very first frame (no flash at 0,0 before the next mousemove). */
  const pointerRef = useRef({ x: 0, y: 0 });

  const data = useMemo(() => zeroFilled(rows, period, range), [rows, period, range]);
  const hasAny = data.some((b) => b.pending > 0 || b.done > 0);
  const hasRange = Boolean(range.from || range.to);
  /** The ticks follow the data — see yAxisTicks(). */
  const yAxis = useMemo(
    () => yAxisTicks(data.reduce((max, b) => Math.max(max, b.pending, b.done), 0)),
    [data],
  );

  const labelOf = (key: string) => formatBucketLabel(key, period, locale);

  /**
   * The two series — the legend's dots, the tooltip's words and the bar
   * order all read from here so they can never drift apart. Colours come
   * from the theme's chart palette only (indigo = the bar on the left, cyan
   * = the one on the right), same order as the `<Bar>`s below.
   */
  const series: { key: DashboardTrendSeries; label: string; color: string }[] = [
    { key: "pending", label: t("trend.seriesPending"), color: theme.custom.chartColors.created },
    { key: "done", label: t("trend.seriesDone"), color: theme.custom.chartColors.completed },
  ];
  /**
   * EITHER bar navigates with this bucket's created-date range. The bar's
   * `series` rides along so the destination adds the matching current-status
   * clause (`status=4` / `notDone=1`) — the list then adds up to the bar.
   * Seats without `report.view` land on the board's table view with the same
   * filters.
   */
  const openBucket = (payload: Partial<Bucket> | undefined, seriesKey: DashboardTrendSeries) => {
    if (!payload?.bucket) return;
    const { from, to } = bucketToRange(payload.bucket, period);
    router.push(
      drillHref(can("report.view"), {
        from,
        to,
        series: seriesKey,
        status: statusId,
        company: companyIds,
      }),
    );
  };

  /** The bar under the pointer — the tooltip's dot and word come from here. */
  const hoveredSeries = hover ? series.find((s) => s.key === hover.seriesKey) : undefined;

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

        {/* legend — dot + label per bar, drawn here (not by recharts) so it
            can wrap with the header and stay in the theme's typography */}
        {hasAny && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1, flexWrap: "wrap" }}>
            {series.map((s) => (
              <Box key={s.key} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box
                  sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: s.color, flexShrink: 0 }}
                />
                <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>{s.label}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {hasAny ? (
          <Box
            // the tooltip is absolutely positioned inside this box, so the
            // pointer coordinates below map 1:1 to where the box is painted
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const x = event.clientX - rect.left;
              const y = event.clientY - rect.top;
              pointerRef.current = { x, y };
              // Recharts fires a Bar's onMouseEnter for the WHOLE category
              // band, not just the drawn rectangle — so a tooltip can hang
              // around after the pointer has left the bar. Hit-test the real
              // element under the cursor instead and drop it immediately.
              const overBar = Boolean(
                (event.target as Element | null)?.closest?.(".recharts-bar-rectangle"),
              );
              if (!overBar) {
                setHover(null);
                return;
              }
              setHover((prev) => (prev ? { ...prev, x, y } : null));
            }}
            onMouseLeave={() => setHover(null)}
            sx={{
              flex: 1,
              minHeight: 340,
              mx: -1,
              position: "relative",
              "& .recharts-bar-rectangle": { cursor: "pointer" },
              // recharts makes the <svg> focusable (accessibilityLayer) AND stamps
              // tabindex=-1 on the bar layer <g>; the browser can then paint a
              // focus ring around the plot after a click. Nothing inside the
              // chart needs a visible ring (author styles beat the UA outline).
              "& .recharts-surface, & .recharts-surface *": { outline: "none" },
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 16, right: 8, bottom: 0, left: 0 }}
                // two bars per bucket: keep them tight against each other and
                // a clear notch between neighbouring buckets
                barGap={2}
                barCategoryGap="25%"
                // no focusable <svg>: it was the other source of the ring, and the
                // chart has no keyboard-only feature that needs it
                accessibilityLayer={false}
              >
                {/* horizontal dashed grid only — the reference look */}
                <CartesianGrid vertical={false} stroke={theme.palette.divider} strokeDasharray="4 4" />
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
                  // domain/ticks come from the data so the labels scale from
                  // single digits to the hundreds instead of staying at 8/16
                  domain={yAxis.domain}
                  ticks={yAxis.ticks}
                  tick={{ fontSize: 11, fill: theme.palette.text.disabled }}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar
                  dataKey="pending"
                  name={series[0].label}
                  fill={series[0].color}
                  barSize={14}
                  radius={[5, 5, 2, 2]}
                  isAnimationActive={false}
                  onMouseEnter={(entry) => {
                    const payload = entry?.payload as Partial<Bucket> | undefined;
                    if (!payload?.bucket) return;
                    setHover({
                      ...pointerRef.current,
                      label: labelOf(payload.bucket),
                      seriesKey: "pending",
                      value: Number(payload.pending ?? 0),
                    });
                  }}
                  onClick={(clicked) => {
                    const payload = clicked?.payload as Partial<Bucket> | undefined;
                    openBucket(payload, "pending");
                  }}
                />
                <Bar
                  dataKey="done"
                  name={series[1].label}
                  fill={series[1].color}
                  barSize={14}
                  radius={[5, 5, 2, 2]}
                  isAnimationActive={false}
                  onMouseEnter={(entry) => {
                    const payload = entry?.payload as Partial<Bucket> | undefined;
                    if (!payload?.bucket) return;
                    setHover({
                      ...pointerRef.current,
                      label: labelOf(payload.bucket),
                      seriesKey: "done",
                      value: Number(payload.done ?? 0),
                    });
                  }}
                  onClick={(clicked) => {
                    const payload = clicked?.payload as Partial<Bucket> | undefined;
                    openBucket(payload, "done");
                  }}
                />
              </BarChart>
            </ResponsiveContainer>

            {/* our own tooltip: painted at the pointer, not at the bar's
                centre — no Recharts active-index/position/animation involved */}
            {hover && (
              <Box
                sx={{
                  position: "absolute",
                  left: hover.x + 12,
                  top: Math.max(0, hover.y - 64),
                  zIndex: 2,
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  // fixed footprint: a value going 8 → 16 → 400 must never
                  // resize the box (tabular digits stop the text shifting)
                  width: 164,
                  height: 60,
                  boxSizing: "border-box",
                  overflow: "hidden",
                  fontVariantNumeric: "tabular-nums",
                  bgcolor: theme.palette.navy.main,
                  color: theme.palette.common.white,
                  borderRadius: "8px",
                  boxShadow: theme.custom.cardShadow,
                  px: 1.5,
                  py: 1,
                  fontSize: 12.5,
                }}
              >
                <Typography sx={{ color: "inherit", fontWeight: 700, mb: 0.5 }}>
                  {hover.label}
                </Typography>
                {/* Only the bar under the pointer — the other series and the
                    combined total are deliberately not printed here. */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: hoveredSeries?.color,
                      flexShrink: 0,
                    }}
                  />
                  <Typography sx={{ color: "inherit", fontSize: 12.5 }}>
                    {hoveredSeries?.label} : {hover.value}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              flex: 1,
              minHeight: 340,
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
    </>
  );
}
