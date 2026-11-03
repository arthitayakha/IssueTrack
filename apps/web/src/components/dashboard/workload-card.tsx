"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar, Box, Card, MenuItem, Select, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import type { DashboardWorkloadRow } from "@kanban/shared";

/**
 * "งานที่ยังไม่เสร็จ" — open cards + hours tracked on those cards per
 * programmer (server-sorted by open load desc). The list scrolls vertically
 * inside the card (never horizontally): the card stretches to the trend
 * chart's height, so any team size fits.
 *
 * Two client-side extras, both fed by the rows alone (no second request):
 *   - a position dropdown, rendered only when some row actually carries a
 *     position — the options are the positions present in the list;
 *   - a score bar per row (share of the busiest person's open load), shown
 *     only once the list is long enough to make comparison worthwhile.
 *
 * Overview readers only — personal scopes never reach this card.
 */

/** Below this many rows the bars add noise instead of insight. */
const SCORE_BAR_MIN_ROWS = 5;

/** The dropdown's "no position" sentinel — ids are positive ints. */
const NO_POSITION = "none";

export default function WorkloadCard({ rows }: { rows: DashboardWorkloadRow[] }) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");

  /** Selected position id as a string, `NO_POSITION`, or "" for all. */
  const [positionFilter, setPositionFilter] = useState("");

  // stable per-user avatar color from the theme palette (no hardcoded hex)
  const avatarPalette = [
    theme.palette.sky.dark,
    theme.palette.grey[200],
    theme.palette.sky.light,
    theme.palette.grey[100],
  ];

  /** Distinct positions held by people in the list, in list order. */
  const positionOptions = useMemo(() => {
    const seen = new Map<string, string>();
    let hasUnpositioned = false;
    for (const r of rows) {
      if (r.positionId == null) hasUnpositioned = true;
      else if (!seen.has(String(r.positionId))) seen.set(String(r.positionId), r.positionName ?? "");
    }
    const options = [...seen.entries()].map(([value, label]) => ({ value, label }));
    if (hasUnpositioned) options.push({ value: NO_POSITION, label: t("workload.noPosition") });
    return options;
  }, [rows, t]);

  const showPositionFilter = positionOptions.some((o) => o.value !== NO_POSITION);

  // A refetch can drop the picked position (person reassigned, list narrowed
  // by the status cross-filter) — fall back to showing everyone.
  useEffect(() => {
    setPositionFilter((cur) =>
      cur && !positionOptions.some((o) => o.value === cur) ? "" : cur,
    );
  }, [positionOptions]);

  const visibleRows = useMemo(() => {
    if (!positionFilter) return rows;
    if (positionFilter === NO_POSITION) return rows.filter((r) => r.positionId == null);
    const id = Number(positionFilter);
    return rows.filter((r) => r.positionId === id);
  }, [rows, positionFilter]);

  const maxOpen = visibleRows.reduce((m, r) => Math.max(m, r.openCount), 0);
  const showScoreBar = visibleRows.length >= SCORE_BAR_MIN_ROWS && maxOpen > 0;

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
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <Box sx={{ mb: 2, display: "flex", alignItems: "flex-start", gap: 1 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{t("workload.title")}</Typography>
          <Typography sx={{ fontSize: "12.5px", color: "text.disabled", mt: "2px" }}>
            {t("workload.subtitle")}
          </Typography>
        </Box>
        {showPositionFilter && (
          <Select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value)}
            displayEmpty
            size="small"
            aria-label={t("workload.allPositions")}
            sx={{
              flexShrink: 0,
              minWidth: 140,
              fontSize: 13,
              "& .MuiSelect-select": { py: 0.75, pr: "28px !important" },
            }}
          >
            <MenuItem value="">{t("workload.allPositions")}</MenuItem>
            {positionOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        )}
      </Box>

      {visibleRows.length === 0 ? (
        <Typography sx={{ color: "text.disabled", fontSize: 13.5, py: 2, textAlign: "center" }}>
          {t("workload.empty")}
        </Typography>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            pr: 0.5,
            "&::-webkit-scrollbar": { width: "6px" },
            "&::-webkit-scrollbar-thumb": {
              bgcolor: "grey.300",
              borderRadius: "999px",
            },
            "&::-webkit-scrollbar-track": { bgcolor: "transparent" },
          }}
        >
          {visibleRows.map((m, i) => {
            const hasOpen = m.openCount > 0;
            return (
              <Box
                key={m.userId}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  py: 1.4,
                  borderBottom: i === visibleRows.length - 1 ? "none" : "1px solid",
                  borderColor: "divider",
                  minWidth: 0,
                }}
              >
                <Avatar
                  sx={{
                    width: 38,
                    height: 38,
                    bgcolor: avatarPalette[i % avatarPalette.length],
                    color: "text.primary",
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  {m.name.charAt(0).toUpperCase()}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 14,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {m.name}
                  </Typography>
                  {showScoreBar && (
                    <Box
                      sx={{
                        mt: 0.75,
                        height: 6,
                        borderRadius: "999px",
                        bgcolor: "grey.200",
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        sx={{
                          height: "100%",
                          borderRadius: "999px",
                          bgcolor: "primary.main",
                          width: `${Math.round((m.openCount / maxOpen) * 100)}%`,
                        }}
                      />
                    </Box>
                  )}
                </Box>
                <Box sx={{ ml: "auto", textAlign: "right", flexShrink: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                    {t("workload.hours", { count: m.hours })}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: hasOpen ? "warning.dark" : "text.disabled",
                      fontWeight: hasOpen ? 700 : 400,
                    }}
                  >
                    {hasOpen ? t("workload.openCount", { count: m.openCount }) : t("workload.noOpen")}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Card>
  );
}
