"use client";

import { useMemo } from "react";
import {
  Box,
  Card,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardPeriod, DashboardScope, DashboardTrendRow } from "@kanban/shared";

/**
 * Trend chart: new cards per bucket (day / week / month / year).
 *
 * The server returns only non-empty buckets (`date_trunc` in Bangkok time);
 * zero-filling the gaps is presentation, so it happens here — never an
 * aggregation. Colors come from the theme (sky bars, navy peak).
 */

const PERIODS: DashboardPeriod[] = ["day", "week", "month", "year"];

const MONTHS_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Look-back windows — must match the server's TREND_WINDOW_DAYS. */
const BUCKETS: Record<DashboardPeriod, number> = { day: 30, week: 12, month: 12, year: 3 };

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
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

function zeroFilled(rows: DashboardTrendRow[], period: DashboardPeriod): Bucket[] {
  const counts = new Map(rows.map((r) => [r.bucket, r.count]));
  const n = BUCKETS[period];
  const last = bucketStart(new Date(), period);
  const out: Bucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = addPeriod(last, period, -i);
    const key = ymd(date);
    out.push({ bucket: key, count: counts.get(key) ?? 0, date });
    counts.delete(key);
  }
  // any bucket the server saw but this clock did not (timezone edge) keeps its data
  for (const [bucket, count] of counts) {
    if (count > 0) out.push({ bucket, count, date: new Date(`${bucket}T00:00:00`) });
  }
  out.sort((a, b) => a.bucket.localeCompare(b.bucket));
  return out;
}

export default function TrendChart({
  rows,
  period,
  onPeriodChange,
  scope,
}: {
  rows: DashboardTrendRow[];
  period: DashboardPeriod;
  onPeriodChange: (p: DashboardPeriod) => void;
  scope: DashboardScope;
}) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");
  const locale = useLocale();

  const data = useMemo(() => zeroFilled(rows, period), [rows, period]);
  const peak = useMemo(
    () =>
      data.reduce<Bucket>(
        (best, b) => (b.count > best.count ? b : best),
        { bucket: "", count: -1, date: new Date(0) },
      ),
    [data],
  );
  const hasAny = data.some((b) => b.count > 0);

  const labelOf = (key: string): string => {
    const d = new Date(`${key}T00:00:00`);
    if (Number.isNaN(d.getTime())) return key;
    if (period === "month") {
      const months = locale === "th" ? MONTHS_TH : MONTHS_EN;
      return `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    }
    if (period === "year") return String(d.getFullYear());
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  return (
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
          </Typography>
        </Box>
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

      {hasAny ? (
        <Box sx={{ flex: 1, minHeight: 220, mx: -1 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
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
              <Bar dataKey="count" radius={[8, 8, 3, 3]}>
                {data.map((b) => (
                  <Cell
                    key={b.bucket}
                    fill={
                      b.bucket === peak.bucket
                        ? theme.palette.navy.main
                        : "url(#dashBarFill)"
                    }
                  />
                ))}
              </Bar>
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
  );
}
