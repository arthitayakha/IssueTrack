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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import HistoryIcon from "@mui/icons-material/History";
import { useLocale, useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { Link } from "@/i18n/navigation";
import { fetchRuleRuns, fetchRules } from "@/lib/rules-api";
import type { PaginatedRuns } from "@/lib/rules-api";
import type { RuleDto, RuleRunDto, RuleRunStatus } from "@kanban/shared";
import { getActionByKey, getTriggerByKey } from "@kanban/shared";
import { timeAgo } from "@/lib/time-ago";

const PAGE_SIZE = 50;

const STATUS_COLOR: Record<RuleRunStatus, "success" | "warning" | "error"> = {
  applied: "success",
  skipped: "warning",
  failed: "error",
};

/**
 * Rule run history — reads GET /rules/runs. The engine writes a row whenever a
 * rule's conditions pass, so this page shows what actually happened.
 */
export default function RuleRunsPage() {
  const t = useTranslations("Automation");
  const tRuns = useTranslations("Automation.runs");
  const theme = useTheme();
  const locale = useLocale();

  const [runs, setRuns] = useState<PaginatedRuns | null>(null);
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
        const data = await fetchRuleRuns({
          page,
          limit: PAGE_SIZE,
          ...(ruleFilter === "all" ? {} : { ruleId: Number(ruleFilter) }),
        });
        if (!cancelled) setRuns(data);
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

  function statusLabel(status: RuleRunStatus): string {
    if (status === "applied") return tRuns("statusApplied");
    if (status === "skipped") return tRuns("statusSkipped");
    return tRuns("statusFailed");
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
          {runs && (
            <Typography variant="body2" color="text.secondary">
              {tRuns("total", { count: runs.total })}
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
        ) : !runs || runs.data.length === 0 ? (
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
          <Box
            sx={{
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
              overflow: "hidden",
              bgcolor: "background.paper",
            }}
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{tRuns("columnTime")}</TableCell>
                  <TableCell>{tRuns("columnRule")}</TableCell>
                  <TableCell>{tRuns("columnTrigger")}</TableCell>
                  <TableCell>{tRuns("columnAction")}</TableCell>
                  <TableCell>{tRuns("columnIssue")}</TableCell>
                  <TableCell>{tRuns("columnStatus")}</TableCell>
                  <TableCell align="right">{tRuns("columnDuration")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {runs.data.map((run: RuleRunDto) => (
                  <TableRow key={run.id} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      <Tooltip title={new Date(run.createdAt).toLocaleString(locale)} placement="top">
                        <span>{timeAgo(run.createdAt, locale)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography variant="body2" noWrap fontWeight={600}>
                        {run.ruleName ?? `#${run.ruleId ?? "?"}`}
                      </Typography>
                    </TableCell>
                    <TableCell>{getTriggerByKey(run.triggerKey)?.label.th ?? run.triggerKey}</TableCell>
                    <TableCell>{getActionByKey(run.actionKey ?? "")?.label.th ?? run.actionKey ?? "—"}</TableCell>
                    <TableCell sx={{ maxWidth: 200 }}>
                      <Typography variant="body2" noWrap>
                        {run.issueTitle ?? "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={statusLabel(run.status)}
                        color={STATUS_COLOR[run.status]}
                        variant="outlined"
                      />
                      {run.detail && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block", mt: 0.25, maxWidth: 260 }}
                        >
                          {run.detail}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {run.durationMs} ms
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {runs && runs.totalPages > 1 && (
          <Box sx={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 1.5, mt: 2 }}>
            <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              {tRuns("prev")}
            </Button>
            <Typography variant="body2" color="text.secondary">
              {tRuns("pageOf", { page: runs.page, total: runs.totalPages })}
            </Typography>
            <Button
              size="small"
              disabled={page >= runs.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {tRuns("next")}
            </Button>
          </Box>
        )}
      </DashboardLayout>
    </RequirePermission>
  );
}
