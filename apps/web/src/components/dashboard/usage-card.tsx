"use client";

import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Card,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import DonutChart from "./donut-chart";
import IssuesDrillDialog, { type DrillSource } from "./issues-drill-dialog";
import { fetchDrilldown } from "@/lib/dashboard-api";
import { useRouter } from "@/i18n/navigation";
import { usePermissions } from "@/lib/permissions";
import { reportsHref } from "@/lib/dashboard-nav";
import type { DashboardCountRow, DashboardScope } from "@kanban/shared";

/** The usage card's two tabs — which dimension the ring is cut from. */
type Dim = "app" | "category";

/** What a clicked slice is heading for: the issue list behind it. */
interface DrillTarget {
  source: DrillSource;
  /** "{name} · {count} งาน" — only this card knows which slice was clicked. */
  title: string;
  count: number;
}

/**
 * The usage card — the two donuts (app / category) merged into one.
 *
 * Tabs in the header pick the dimension: **แอป** shows the app ring, and
 * clicking a slice drills *into* that app (the ring re-renders as the
 * categories inside it, with a ← กลับ control); clicking a category slice then
 * jumps to /reports filtered to that category (the drill dialog only stays as
 * a fallback without `report.view`). The **หมวดหมู่** tab is the overall
 * category ring — one click straight to its filtered report.
 *
 * Both top-level rings arrive in the same `GET /dashboard/summary` payload, so
 * switching tabs and going back are free; only the level-2 ring fetches
 * (`GET /dashboard/drilldown`), scoped exactly like the numbers above it.
 */
export default function UsageCard({
  apps,
  categories,
  scope,
  statusId,
}: {
  apps: DashboardCountRow[];
  categories: DashboardCountRow[];
  scope: DashboardScope;
  /** The page's status cross-filter — level 2 must agree with its parent. */
  statusId?: number | null;
}) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const { can } = usePermissions();

  const [dim, setDim] = useState<Dim>("app");
  /** The app we drilled into (level 2) — null on the top level. */
  const [parent, setParent] = useState<{ id: number; name: string } | null>(null);
  const [level2Rows, setLevel2Rows] = useState<DashboardCountRow[] | null>(null);
  const [level2Status, setLevel2Status] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [attempt, setAttempt] = useState(0);
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  /** Newest level-2 request wins — a fast tab-back must not clobber it. */
  const seqRef = useRef(0);

  const level2 = dim === "app" && parent !== null;
  const parentAppId = dim === "app" ? (parent?.id ?? null) : null;

  useEffect(() => {
    if (parentAppId == null) {
      setLevel2Rows(null);
      setLevel2Status("idle");
      return;
    }
    const seq = ++seqRef.current;
    setLevel2Status("loading");
    fetchDrilldown({ dim: "category", app: parentAppId, scope, statusId })
      .then((rows) => {
        if (seq !== seqRef.current) return;
        setLevel2Rows(rows);
        setLevel2Status("ready");
      })
      .catch(() => {
        if (seq !== seqRef.current) return;
        setLevel2Status("error");
      });
  }, [parentAppId, scope, statusId, attempt]);

  /**
   * The server groups cards with no app/category into one `id: null, name:
   * null` row (the ring must count every live card) — its label lives here,
   * since names are translated on the client. The label follows the ring's
   * dimension: the app tab's top level is the only app slice, everything else
   * (category tab, level-2 inside a drilled app) is a category.
   */
  const noneLabel = dim === "app" && !level2 ? t("usage.noApp") : t("usage.noCategory");

  const rawRows: DashboardCountRow[] = level2
    ? level2Status === "ready"
      ? (level2Rows ?? [])
      : []
    : dim === "app"
      ? apps
      : categories;

  const rows: DashboardCountRow[] = rawRows.map((row) =>
    row.name == null ? { ...row, name: noneLabel } : row,
  );

  const emptyText = level2
    ? t("usage.drillEmpty")
    : dim === "app"
      ? t("apps.empty")
      : t("categories.empty");

  const subtitle = parent
    ? `${t("usage.inApp", { name: parent.name })} · ${t("usage.hintList")}`
    : dim === "app"
      ? t("usage.hintDrill")
      : t("usage.hintList");

  /** Slice / legend click — drill one level deeper, or go to the list. */
  const handleSlice = (row: DashboardCountRow) => {
    const name = row.name ?? "—";

    // the NULL slice (no app / no category) has no id to drill or to filter
    // /reports by — it opens its own list, the same dialog every other slice
    // falls back to
    if (row.id == null) {
      const nullDim: "app" | "category" = dim === "app" && parent === null ? "app" : "category";
      setDrill({
        source: {
          kind: "dimension",
          dim: nullDim,
          id: "none",
          ...(parentAppId != null ? { app: parentAppId } : {}),
        },
        title: t("trend.issuesTitle", {
          label:
            parentAppId != null
              ? `${name} · ${t("usage.inApp", { name: parent?.name ?? "" })}`
              : name,
          count: row.count,
        }),
        count: row.count,
      });
      return;
    }

    // app tab, top level → drill into that app's categories
    if (dim === "app" && parent === null) {
      setParent({ id: row.id, name });
      return;
    }

    // category slice (either tab) → /reports filtered to it (+ the app it
    // was drilled through + the page's status cross-filter as context).
    // The dialog only stays for seats without report.view, who would be
    // bounced off the reports page.
    const appId = parentAppId;
    if (can("report.view")) {
      router.push(reportsHref({ category: row.id, app: appId, status: statusId }));
      return;
    }

    // level-2 category (inside the drilled app) → its list, count must match
    setDrill({
      source: {
        kind: "dimension",
        dim: "category",
        id: row.id,
        ...(appId != null ? { app: appId } : {}),
      },
      title: t("trend.issuesTitle", {
        label: appId != null ? `${name} · ${t("usage.inApp", { name: parent?.name ?? "" })}` : name,
        count: row.count,
      }),
      count: row.count,
    });
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
              {subtitle}
            </Typography>
          </Box>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={dim}
            onChange={(_e, value: Dim | null) => {
              if (!value) return;
              setDim(value);
              setParent(null); // a tab switch always starts from the top level
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

        {level2 && (
          <Box sx={{ mb: 0.5 }}>
            <Button
              size="small"
              startIcon={<ArrowBackIcon sx={{ fontSize: 16 }} />}
              onClick={() => setParent(null)}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                color: "text.secondary",
                px: 1,
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              {t("usage.back")}
            </Button>
          </Box>
        )}

        {level2 && level2Status === "error" && (
          <Box
            sx={{
              flex: 1,
              minHeight: 140,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 1.5,
            }}
          >
            <Typography sx={{ fontSize: 13, color: "text.disabled" }}>
              {t("errorNetwork")}
            </Typography>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setAttempt((a) => a + 1)}
              sx={{ textTransform: "none", fontWeight: 600 }}
            >
              {t("retry")}
            </Button>
          </Box>
        )}

        {level2 && level2Status !== "ready" && level2Status !== "error" && (
          <Box
            sx={{
              flex: 1,
              minHeight: 140,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CircularProgress size={28} />
          </Box>
        )}

        {(!level2 || level2Status === "ready") && (
          <DonutChart rows={rows} emptyText={emptyText} onSliceClick={handleSlice} />
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
