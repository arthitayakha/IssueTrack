"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@mui/material";
import {
  Alert,
  Breadcrumbs,
  Box,
  Button,
  Chip,
  CircularProgress,
  Link as MuiLink,
  MenuItem,
  Select,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import HistoryIcon from "@mui/icons-material/History";
import { useLocale, useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { Link } from "@/i18n/navigation";
import { fetchRuleActivity, fetchRules } from "@/lib/rules-api";
import type { PaginatedActivity } from "@/lib/rules-api";
import { Pagination } from "@/components/pagination";
import DataTable, {
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from "@/components/data-table";
import type { RuleActivityDto, RuleDto } from "@kanban/shared";
import { timeAgo } from "@/lib/time-ago";

const PAGE_SIZE = 10;

/** Audit actions written by RulesService → label key + chip colour. */
const ACTION_STYLE: Record<
  string,
  { key: "actionCreated" | "actionUpdated" | "actionDeleted"; color: "success" | "info" | "error" }
> = {
  "rule.created": { key: "actionCreated", color: "success" },
  "rule.updated": { key: "actionUpdated", color: "info" },
  "rule.deleted": { key: "actionDeleted", color: "error" },
};

/**
 * Rule change history — reads GET /rules/activity (RulesService writes these
 * rows into activity_logs on create/update/delete). Who did what to which
 * rule, like a log — no engine runs and no durations here.
 */
export default function RuleHistoryPage() {
  const t = useTranslations("Automation");
  const tRuns = useTranslations("Automation.runs");
  const theme = useTheme();
  const locale = useLocale();

  const [activity, setActivity] = useState<PaginatedActivity | null>(null);
  const [rules, setRules] = useState<RuleDto[]>([]);
  const [ruleFilter, setRuleFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // rule list only feeds the filter dropdown — its failure must not hide history
  useEffect(() => {
    let cancelled = false;
    fetchRules()
      .then((data) => {
        if (!cancelled) setRules(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchRuleActivity({
          page,
          limit: PAGE_SIZE,
          ...(ruleFilter === "all" ? {} : { ruleId: Number(ruleFilter) }),
        });
        if (!cancelled) setActivity(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : tRuns("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleFilter, page, reloadKey]);

  function actionLabel(action: string): string {
    const style = ACTION_STYLE[action];
    return style ? tRuns(style.key) : action;
  }

  const header = (
    <Breadcrumbs aria-label={t("breadcrumbLabel")} separator="/">
      <MuiLink component={Link} href="/automation" underline="hover" color="inherit">
        {t("title")}
      </MuiLink>
      <Typography color="text.primary" fontWeight={600}>
        {tRuns("title")}
      </Typography>
    </Breadcrumbs>
  );

  return (
    <RequirePermission permission="automation.update">
      <DashboardLayout header={header}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
            {tRuns("title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {tRuns("subtitle")}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2, flexWrap: "wrap" }}>
          <Select
            size="small"
            value={ruleFilter}
            onChange={(e) => {
              setRuleFilter(e.target.value);
              setPage(1);
            }}
            sx={{ minWidth: 240 }}
            aria-label={tRuns("filterAll")}
          >
            <MenuItem value="all">{tRuns("filterAll")}</MenuItem>
            {rules.map((rule) => (
              <MenuItem key={rule.id} value={String(rule.id)}>
                {rule.name}
              </MenuItem>
            ))}
          </Select>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {tRuns("refresh")}
          </Button>
          {activity && (
            <Typography variant="body2" color="text.secondary">
              {tRuns("total", { count: activity.total })}
            </Typography>
          )}
        </Box>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
                {t("retry")}
              </Button>
            }
          >
            <Typography>{error}</Typography>
          </Alert>
        ) : !activity || activity.data.length === 0 ? (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <HistoryIcon sx={{ fontSize: 48, color: "text.disabled" }} />
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{ color: theme.palette.navy.main, mt: 1 }}
            >
              {tRuns("emptyTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {tRuns("emptyDescription")}
            </Typography>
          </Box>
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableRow>
                <DataTableCell>{tRuns("columnTime")}</DataTableCell>
                <DataTableCell>{tRuns("columnActor")}</DataTableCell>
                <DataTableCell>{tRuns("columnAction")}</DataTableCell>
                <DataTableCell>{tRuns("columnRule")}</DataTableCell>
              </DataTableRow>
            </DataTableHead>
            <DataTableBody>
              {activity.data.map((row: RuleActivityDto) => {
                const style = ACTION_STYLE[row.action];
                return (
                  <DataTableRow key={row.id}>
                    <DataTableCell sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip title={new Date(row.createdAt).toLocaleString(locale)} placement="top">
                        <span>{timeAgo(row.createdAt, locale)}</span>
                      </Tooltip>
                    </DataTableCell>
                    <DataTableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {row.actorName ?? "—"}
                      </Typography>
                      {row.actorRole && (
                        <Typography variant="caption" color="text.secondary">
                          {row.actorRole}
                        </Typography>
                      )}
                    </DataTableCell>
                    <DataTableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={style?.color ?? "default"}
                        label={actionLabel(row.action)}
                        sx={{ fontWeight: 600 }}
                      />
                    </DataTableCell>
                    <DataTableCell>
                      {row.ruleName ?? (row.ruleId != null ? `#${row.ruleId}` : "—")}
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTable>
        )}

        {activity && (
          <Pagination
            page={page}
            totalPages={activity.totalPages}
            total={activity.total}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </DashboardLayout>
    </RequirePermission>
  );
}
