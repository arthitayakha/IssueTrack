"use client";

import { Box, Button, Card, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import DonutChart from "./donut-chart";
import { resolveStatusColor } from "@/lib/status-color";
import { useRouter } from "@/i18n/navigation";
import { usePermissions } from "@/lib/permissions";
import { drillHref } from "@/lib/dashboard-nav";
import type { DashboardCountRow } from "@kanban/shared";

/**
 * The status ring — one of the dashboard's three top-row cards (beside usage
 * and priority) and the source of its cross-filter.
 *
 * Clicking a slice (or its legend row) selects that status: the page refetches
 * every other aggregate narrowed to it, while THIS ring keeps all its columns
 * and just highlights the choice — it never filters itself, or it would
 * collapse to a single slice (Tableau's "Ignore Actions" / Power BI's
 * cross-highlight). Clicking the selected one again clears the filter; a
 * zero-count status keeps its legend row but isn't clickable, there is no
 * slice behind it.
 *
 * The whole filter state lives in this card rather than in a page-level chip:
 * the subtitle switches to "กำลังกรอง: X — คลิกอีกครั้งเพื่อล้าง" and a small
 * "ดู N งาน" button navigates to /reports filtered to that status — or to
 * /boards?view=table with the same filter for seats without `report.view`,
 * who would be bounced off the reports page. No popup: both destinations are
 * real pages with the filter already applied. The footer total is always the
 * page-wide total — this card never claims to be filtered.
 */
export default function StatusDonut({
  rows,
  total,
  selectedId,
  onSelect,
  companyIds,
}: {
  /** Every board column, zero-filled, in board order — never narrowed by `statusId`. */
  rows: DashboardCountRow[];
  /**
   * The page-wide total — the status cross-filter never touches it, but the
   * company filter does (it is a data scope, see the page).
   */
  total: number;
  selectedId: number | null;
  /** Toggle — picking the selected status again clears the cross-filter. */
  onSelect: (row: DashboardCountRow) => void;
  /** The page's company filter — carried into the drill destination. */
  companyIds?: number[];
}) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const { can } = usePermissions();

  const selected =
    selectedId == null ? null : (rows.find((r) => r.id === selectedId) ?? null);

  return (
    <>
      <Card
        elevation={0}
        sx={{
          // let the grid stretch this card to the same height as its two
          // siblings; the fixed header/subtitle/button slot below are what
          // keep a status click from reflowing its contents
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
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1.5,
            mb: 1,
            flexWrap: "nowrap",
            // keep the header the same height in both states — otherwise
            // selecting a status grows it and nudges the ring/legend/footer
            minHeight: 48,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{t("status.title")}</Typography>
            <Typography
              sx={{
                fontSize: "12.5px",
                lineHeight: "19px",
                height: "19px",
                color: "text.disabled",
                mt: "2px",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {selected
                ? t("status.filtered", { name: selected.name ?? "—" })
                : t("status.hint")}
            </Typography>
          </Box>
          {/* reserve the button's slot even when nothing is selected, so the
              card never reflows on click (visibility keeps the layout) */}
          <Box
            sx={{
              flexShrink: 0,
              visibility: selected && selected.count > 0 ? "visible" : "hidden",
            }}
          >
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                if (selected?.id == null) return;
                // /reports for seats with the permission, otherwise the
                // board's table view — never a popup (see drillHref)
                router.push(
                  drillHref(can("report.view"), { status: selected.id, company: companyIds }),
                );
              }}
              sx={{ textTransform: "none", fontWeight: 600, flexShrink: 0 }}
            >
              {t("filter.viewAll", { count: selected?.count ?? 0 })}
            </Button>
          </Box>
        </Box>

        <DonutChart
          rows={rows}
          emptyText={t("status.empty")}
          onSliceClick={onSelect}
          colorOf={(row) => resolveStatusColor(theme, row.color, row.name)}
          selectedId={selectedId}
        />

        <Box
          sx={{
            mt: 1.5,
            pt: 1.25,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
            {t("status.total", { count: total })}
          </Typography>
        </Box>
      </Card>
    </>
  );
}
