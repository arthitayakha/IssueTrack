"use client";

import { Box, Card, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import type { DashboardCountRow } from "@kanban/shared";

/**
 * Priority bars — name + count on the top line, colored bar below (the narrow-
 * friendly layout from the mockup). Priority colors follow the theme; a row
 * with `id: null` (ไม่ระบุ) renders gray. Every row navigates to `/reports`
 * filtered to that priority (the NULL bucket uses `?noPriority=1`), the same
 * destination the other dashboard charts use — no popup. Rows stay plain for
 * seats without `report.view`, who would only be bounced off the reports page.
 */
export default function PriorityBars({
  rows,
  onSelect,
}: {
  rows: DashboardCountRow[];
  onSelect?: (row: DashboardCountRow) => void;
}) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");

  const data = rows.filter((r) => r.count > 0 || r.id === null);
  const max = Math.max(...data.map((r) => r.count), 1);

  const colorOf = (name: string | null): string => {
    const key = (name ?? "").toLowerCase();
    if (!key) return theme.palette.grey[400];
    if (key.includes("critical") || key.includes("สูง") || key.includes("high")) {
      return theme.palette.error.main;
    }
    if (key.includes("medium") || key.includes("ปานกลาง")) return theme.palette.warning.main;
    if (key.includes("low") || key.includes("ต่ำ")) return theme.palette.success.main;
    return theme.palette.grey[400];
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
      <Box sx={{ mb: 2 }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{t("priority.title")}</Typography>
      </Box>

      {data.length === 0 ? (
        <Typography
          sx={{ color: "text.disabled", fontSize: 13.5, py: 3, textAlign: "center", flex: 1 }}
        >
          {t("priority.empty")}
        </Typography>
      ) : (
        <Box sx={{ flex: 1 }}>
          {data.map((r) => {
            const color = colorOf(r.name);
            return (
              <Box
                key={r.id ?? "none"}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onClick={onSelect ? () => onSelect(r) : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(r);
                        }
                      }
                    : undefined
                }
                sx={{
                  mb: 1.6,
                  "&:last-of-type": { mb: 0 },
                  mx: -1,
                  px: 1,
                  py: 0.5,
                  borderRadius: "10px",
                  cursor: onSelect ? "pointer" : "default",
                  transition: "background-color 150ms ease",
                  ...(onSelect
                    ? {
                        "&:hover": { bgcolor: "action.hover" },
                        "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
                      }
                    : {}),
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    gap: 1,
                    mb: 0.6,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                  >
                    {r.name ?? t("priority.none")}
                  </Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                    {r.count} <Typography component="span" sx={{ color: "text.disabled", fontWeight: 400, fontSize: 12 }}>{t("cards")}</Typography>
                  </Typography>
                </Box>
                <Box
                  sx={{
                    height: 9,
                    bgcolor: "grey.100",
                    borderRadius: "999px",
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      height: "100%",
                      width: `${(r.count / max) * 100}%`,
                      bgcolor: color,
                      borderRadius: "999px",
                      transition: "width .45s cubic-bezier(.3,1,.4,1)",
                    }}
                  />
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Card>
  );
}
