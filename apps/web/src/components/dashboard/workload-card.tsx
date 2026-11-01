"use client";

import { Avatar, Box, Card, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import type { DashboardWorkloadRow } from "@kanban/shared";

/**
 * "การทำงาน" — open load + tracked hours per programmer (server-sorted by
 * hours desc). The list scrolls vertically inside the card (never horizontally):
 * the card stretches to the trend chart's height, so any team size fits.
 * Overview readers only — personal scopes never reach this card.
 */
export default function WorkloadCard({ rows }: { rows: DashboardWorkloadRow[] }) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");

  // stable per-user avatar color from the theme palette (no hardcoded hex)
  const avatarPalette = [
    theme.palette.sky.dark,
    theme.palette.grey[200],
    theme.palette.sky.light,
    theme.palette.grey[100],
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
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{t("workload.title")}</Typography>
        <Typography sx={{ fontSize: "12.5px", color: "text.disabled", mt: "2px" }}>
          {t("workload.subtitle")}
        </Typography>
      </Box>

      {rows.length === 0 ? (
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
          {rows.map((m, i) => {
            const hasOpen = m.openCount > 0;
            return (
              <Box
                key={m.userId}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                  py: 1.4,
                  borderBottom: i === rows.length - 1 ? "none" : "1px solid",
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
