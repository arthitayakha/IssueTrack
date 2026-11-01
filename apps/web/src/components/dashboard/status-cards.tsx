"use client";

import { Box, Card, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import type { DashboardCountRow } from "@kanban/shared";
import { resolveStatusColor } from "@/lib/status-color";

/**
 * Top row: one card per board column (status), zero-filled by the server so
 * every column renders even when empty. The count and the tinted icon follow
 * the column's real color — the same value the board uses — so a card reads
 * as "that column, at a glance".
 */
export default function StatusCards({ rows }: { rows: DashboardCountRow[] }) {
  const theme = useTheme();

  return (
    <Box
      sx={{
        display: "grid",
        gap: 2.5,
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: `repeat(auto-fit, minmax(180px, 1fr))`,
        },
      }}
    >
      {rows.map((row) => {
        const color = resolveStatusColor(theme, row.color, row.name);
        return (
          <Card
            key={row.id ?? row.name}
            elevation={0}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2,
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
                width: 52,
                height: 52,
                borderRadius: "16px",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: alpha(color, 0.14),
              }}
            >
              <Box sx={{ width: 18, height: 18, borderRadius: "50%", bgcolor: color }} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                sx={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, color }}
              >
                {row.count}
              </Typography>
              <Typography sx={{ fontSize: "13.5px", color: "text.secondary", mt: "2px" }}>
                {row.name}
              </Typography>
            </Box>
          </Card>
        );
      })}
    </Box>
  );
}
