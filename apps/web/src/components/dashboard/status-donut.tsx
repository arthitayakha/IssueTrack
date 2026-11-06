"use client";

import { useState } from "react";
import { Box, Button, Card, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useTranslations } from "next-intl";
import DonutChart from "./donut-chart";
import IssuesDrillDialog from "./issues-drill-dialog";
import { resolveStatusColor } from "@/lib/status-color";
import { useRouter } from "@/i18n/navigation";
import { usePermissions } from "@/lib/permissions";
import { reportsHref } from "@/lib/dashboard-nav";
import type { DashboardCountRow, DashboardScope } from "@kanban/shared";

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
 * "ดู N งาน" button jumps to /reports filtered to that status (the drill
 * dialog only stays for seats without `report.view`, who would be bounced
 * off the reports page). The footer total is always the page-wide total —
 * this card never claims to be filtered.
 */
export default function StatusDonut({
  rows,
  total,
  selectedId,
  onSelect,
  scope,
}: {
  /** Every board column, zero-filled, in board order — never narrowed. */
  rows: DashboardCountRow[];
  /** The page-wide total; the cross-filter does not touch it. */
  total: number;
  selectedId: number | null;
  /** Toggle — picking the selected status again clears the cross-filter. */
  onSelect: (row: DashboardCountRow) => void;
  scope: DashboardScope;
}) {
  const theme = useTheme();
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const { can } = usePermissions();
  /** The list opened by "ดู N งาน" — null while the dialog is closed. */
  const [listFor, setListFor] = useState<DashboardCountRow | null>(null);

  const selected =
    selectedId == null ? null : (rows.find((r) => r.id === selectedId) ?? null);

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
            <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{t("status.title")}</Typography>
            <Typography sx={{ fontSize: "12.5px", color: "text.disabled", mt: "2px" }}>
              {selected
                ? t("status.filtered", { name: selected.name ?? "—" })
                : t("status.hint")}
            </Typography>
          </Box>
          {selected && selected.count > 0 && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                // to /reports with this status; the dialog only stays for
                // seats without report.view, who cannot open the reports page
                if (can("report.view") && selected.id != null) {
                  router.push(reportsHref({ status: selected.id }));
                  return;
                }
                setListFor(selected);
              }}
              sx={{ textTransform: "none", fontWeight: 600, flexShrink: 0 }}
            >
              {t("filter.viewAll", { count: selected.count })}
            </Button>
          )}
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

      {listFor && listFor.id != null && (
        <IssuesDrillDialog
          title={t("trend.issuesTitle", {
            label: listFor.name ?? "—",
            count: listFor.count,
          })}
          count={listFor.count}
          source={{ kind: "dimension", dim: "status", id: listFor.id }}
          scope={scope}
          onClose={() => setListFor(null)}
        />
      )}
    </>
  );
}
