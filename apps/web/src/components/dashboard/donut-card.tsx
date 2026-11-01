"use client";

import { Box, Card, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { DashboardCountRow } from "@kanban/shared";

/**
 * Donut card for one dimension (app / category). Slices cycle through theme
 * palette colors; the legend lists name + count + share. An empty dimension
 * shows a friendly note instead of a blank ring.
 */
export default function DonutCard({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: DashboardCountRow[];
  emptyText: string;
}) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");

  const data = rows
    .filter((r) => r.count > 0)
    .map((r) => ({ id: r.id, name: r.name ?? "—", count: r.count }));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  const palette = [
    theme.palette.sky.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.navy.main,
    theme.palette.grey[500],
  ];

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
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{title}</Typography>
      </Box>

      {data.length === 0 ? (
        <Typography
          sx={{ color: "text.disabled", fontSize: 13.5, py: 3, textAlign: "center", flex: 1 }}
        >
          {emptyText}
        </Typography>
      ) : (
        <>
          <Box sx={{ height: 140, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="92%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((d, i) => (
                    <Cell key={d.id ?? d.name} fill={palette[i % palette.length]} />
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

          <Box sx={{ mt: 1.5, display: "flex", flexDirection: "column", gap: 1.1, flex: 1, minHeight: 0 }}>
            {data.map((d, i) => (
              <Box key={d.id ?? d.name} sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    flexShrink: 0,
                    bgcolor: palette[i % palette.length],
                  }}
                />
                <Typography
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13.5,
                    color: "text.secondary",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {d.name}
                </Typography>
                <Typography sx={{ fontWeight: 700, fontSize: 13.5, minWidth: 40, textAlign: "right" }}>
                  {total > 0 ? Math.round((d.count / total) * 100) : 0}%
                </Typography>
                <Typography
                  sx={{ color: "text.disabled", fontSize: 12, minWidth: 34, textAlign: "right" }}
                >
                  {d.count}
                </Typography>
              </Box>
            ))}
          </Box>
        </>
      )}
    </Card>
  );
}
