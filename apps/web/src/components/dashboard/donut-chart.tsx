"use client";

import { Box, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DashboardCountRow } from "@kanban/shared";

/**
 * The ring + legend of one donut dimension — the body of `usage-card.tsx`
 * and `status-donut.tsx`.
 *
 * The ring sits to the LEFT of its legend wherever the card is wide enough,
 * so the card stays short instead of growing with every legend row; the legend
 * is capped at the ring's height and scrolls inside itself once it has more
 * rows than fit. The dashboard grid is one column below `md` and three from
 * `md`, so the row layout is on at `sm` (full-width card), off at `md` (each
 * card shrinks to ~270px — ring + legend side by side would leave no room for
 * names) and back on at `lg`. A dimension with no slice at all keeps the
 * stacked layout: there is nothing to sit beside.
 *
 * Colors come from `colorOf` when the caller has real ones (the status ring
 * uses each board column's own color, so the dashboard matches the board);
 * otherwise they cycle through the theme palette. The legend sits inside its
 * own bordered frame (`border` + `borderRadius: 2`, the reports empty-state
 * look) so the chart and the data read as two separate blocks, and lists name
 * + count for **every** row — a zero-count row keeps its place, because an
 * empty column is still board information — and every non-empty row is a
 * real `<button>`, so a slice and its legend row do exactly the same thing:
 * drill one level deeper (app → categories), open the issue list behind that
 * slice, or set the page's status cross-filter.
 *
 * `selectedId` is that cross-filter's highlight: the chosen slice stays at
 * full strength while the others fade, so the ring never collapses to the one
 * status it filtered by. An empty dimension shows a friendly note instead of
 * a blank ring.
 */
export default function DonutChart({
  rows,
  emptyText,
  onSliceClick,
  colorOf,
  selectedId = null,
}: {
  rows: DashboardCountRow[];
  emptyText: string;
  /** Clicking a slice or its legend row — the caller decides what drills. */
  onSliceClick: (row: DashboardCountRow) => void;
  /** Real per-row color (the status ring); omitted = the cycling palette. */
  colorOf?: (row: DashboardCountRow) => string;
  /** The cross-filtered row — highlighted while the others dim. */
  selectedId?: number | null;
}) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");

  const palette = [
    theme.palette.sky.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.navy.main,
    theme.palette.grey[500],
  ];
  /**
   * One color per row, resolved once — the ring only draws rows that have
   * cards, so deriving the palette index from *that* list would hand the
   * legend different colors than the slice it belongs to.
   */
  const colored = rows.map((row, i) => ({
    row,
    color: colorOf ? colorOf(row) : palette[i % palette.length],
  }));
  const ring = colored.filter((c) => c.row.count > 0);

  const isSelected = (row: DashboardCountRow) => selectedId != null && row.id === selectedId;
  const isFaded = (row: DashboardCountRow) => selectedId != null && !isSelected(row);
  /** No slice at all → nothing beside the legend, so keep the stacked layout. */
  const sideBySide = ring.length > 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {rows.length === 0 ? (
        <Typography
          sx={{ color: "text.disabled", fontSize: 13.5, py: 3, textAlign: "center", flex: 1 }}
        >
          {emptyText}
        </Typography>
      ) : (
        <Box
          sx={{
            display: "flex",
            // on at sm (card is full width), off at md (3-up grid → ~270px per
            // card), back on at lg
            flexDirection: sideBySide ? { xs: "column", sm: "row", md: "column", lg: "row" } : "column",
            alignItems: sideBySide
              ? { xs: "stretch", sm: "center", md: "stretch", lg: "center" }
              : "stretch",
            gap: 1.5,
            flex: 1,
            minHeight: 0,
          }}
        >
          {sideBySide && (
            <Box
              sx={{
                height: 140,
                flexShrink: 0,
                width: { xs: "100%", sm: 150, md: "100%", lg: 150 },
                "& .recharts-sector": { cursor: "pointer" },
              }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ring.map((c) => c.row)}
                    dataKey="count"
                    nameKey="name"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={2}
                    stroke="none"
                    // the sector's index maps 1:1 onto `ring` (and its <Cell>s)
                    onClick={(_sector, index) => {
                      const entry = ring[index];
                      if (entry) onSliceClick(entry.row);
                    }}
                  >
                    {ring.map(({ row, color }) => (
                      <Cell
                        key={row.id ?? row.name}
                        fill={alpha(color, isFaded(row) ? 0.28 : 1)}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid",
                      borderColor: theme.palette.divider,
                      boxShadow: theme.custom.tableShadow,
                      fontSize: 12.5,
                    }}
                    formatter={(value, name) => [`${value} ${t("cards")}`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          )}

          {/* the legend's own frame — chart and data read as two blocks */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              width: "100%",
              minHeight: 0,
              // never taller than the ring — extra rows scroll inside instead
              // of stretching the card
              maxHeight: 140,
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Box
              sx={{
                display: "grid",
                gap: 0.4,
                gridTemplateColumns: "1fr",
                alignContent: "start",
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                px: 1,
                py: 0.5,
              }}
            >
              {colored.map(({ row, color }) => {
                const selected = isSelected(row);
                const faded = isFaded(row);
                const empty = row.count === 0;
                return (
                  <Box
                    key={row.id ?? row.name}
                    component="button"
                    disabled={empty}
                    onClick={() => onSliceClick(row)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      minWidth: 0,
                      width: "100%",
                      mx: -0.75,
                      px: 0.75,
                      py: 0.4,
                      border: "none",
                      borderRadius: 1,
                      bgcolor: selected ? "action.selected" : "transparent",
                      color: "inherit",
                      textAlign: "left",
                      cursor: empty ? "default" : "pointer",
                      opacity: faded ? 0.6 : 1,
                      "&:not(:disabled):hover": {
                        bgcolor: selected ? "action.selected" : "action.hover",
                      },
                      "&:disabled": { opacity: faded ? 0.6 : 1 },
                    }}
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        flexShrink: 0,
                        bgcolor: color,
                        opacity: empty ? 0.4 : 1,
                      }}
                    />
                    <Typography
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13.5,
                        fontWeight: selected ? 700 : 400,
                        color: empty ? "text.disabled" : "text.secondary",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {row.name ?? "—"}
                    </Typography>
                    <Typography
                      sx={{ color: "text.disabled", fontSize: 12, minWidth: 34, textAlign: "right" }}
                    >
                      {row.count}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
