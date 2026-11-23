"use client";

import { useState } from "react";
import {
  Box,
  Card,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import DonutChart from "./donut-chart";
import { useRouter } from "@/i18n/navigation";
import { usePermissions } from "@/lib/permissions";
import { drillHref } from "@/lib/dashboard-nav";
import type { DashboardCountRow } from "@kanban/shared";

/** The usage card's two tabs — which dimension the ring is cut from. */
type Dim = "app" | "category";

/**
 * The usage card — the two donuts (app / category) merged into one.
 *
 * Tabs in the header pick the dimension: **แอป** shows the app ring, **หมวดหมู่**
 * the category ring. **Every slice click navigates** pre-filtered to that slice
 * — app → `?app=<id>`, category → `?category=<id>`, and the NULL
 * slices ("ไม่มีแอป" / "ไม่มีหมวดหมู่", which carry no id) → `?noApp=1` /
 * `?noCategory=1`, the flags `IssuesService` / `ReportsService` read as
 * `app_id IS NULL`. The page's status cross-filter AND its company filter
 * ride along so the report opens on exactly the rows the number on the
 * slice counted.
 *
 * Seats without `report.view` go to `/boards?view=table` with the same filter
 * instead — `RequirePermission` would bounce them straight off `/reports`.
 * Both destinations are real pages with the filter applied; no popup.
 *
 * Both rings arrive in the same `GET /dashboard/summary` payload, so switching
 * tabs is free — there is no level-2 fetch any more (clicking an app used to
 * re-render the ring with its categories; that now goes to the report instead).
 */
export default function UsageCard({
  apps,
  categories,
  statusId,
  companyIds,
}: {
  apps: DashboardCountRow[];
  categories: DashboardCountRow[];
  /** The page's status cross-filter — the destination must agree with the number. */
  statusId?: number | null;
  /** The page's company filter — carried into the destination. */
  companyIds?: number[];
}) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const { can } = usePermissions();

  const [dim, setDim] = useState<Dim>("app");

  const noneLabel = dim === "app" ? t("usage.noApp") : t("usage.noCategory");

  const rawRows: DashboardCountRow[] = dim === "app" ? apps : categories;

  const rows: DashboardCountRow[] = rawRows.map((row) =>
    row.name == null ? { ...row, name: noneLabel } : row,
  );

  const emptyText = dim === "app" ? t("apps.empty") : t("categories.empty");

  /** Slice / legend click — navigate to the list behind that slice. */
  const handleSlice = (row: DashboardCountRow) => {
    // the NULL slice has no id — its own flag is the filter (see docblock)
    const nullFlag = dim === "app" ? { noApp: 1 } : { noCategory: 1 };
    router.push(
      drillHref(can("report.view"), {
        ...(row.id == null ? nullFlag : dim === "app" ? { app: row.id } : { category: row.id }),
        status: statusId,
        company: companyIds,
      }),
    );
  };

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
          minHeight: 0,
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: { xs: "flex-start", sm: "center" },
            justifyContent: "space-between",
            gap: 1.5,
            mb: 1,
            flexWrap: "wrap",
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
              {dim === "app" ? t("usage.titleApp") : t("usage.titleCategory")}
            </Typography>
            <Typography sx={{ fontSize: "12.5px", color: "text.disabled", mt: "2px" }}>
              {t("usage.hintList")}
            </Typography>
          </Box>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={dim}
            onChange={(_e, value: Dim | null) => {
              if (!value) return;
              setDim(value);
            }}
            sx={{
              bgcolor: "grey.100",
              borderRadius: "10px",
              flexShrink: 0,
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
            <ToggleButton value="app">{t("usage.tabApp")}</ToggleButton>
            <ToggleButton value="category">{t("usage.tabCategory")}</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <DonutChart rows={rows} emptyText={emptyText} onSliceClick={handleSlice} />
      </Card>
    </>
  );
}
