"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@mui/material";
import { Alert, Breadcrumbs, Box, Button, CircularProgress, Link as MuiLink, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import HistoryIcon from "@mui/icons-material/History";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { useNotification } from "@/components/notification";
import { fetchRules, deleteRule, toggleRule } from "@/lib/rules-api";
import type { RuleDto } from "@kanban/shared";
import RuleList from "@/components/rules/rule-list";

export default function AutomationPage() {
  const t = useTranslations("Automation");
  const theme = useTheme();
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const { notify } = useNotification();

  const [rules, setRules] = useState<RuleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchRules();
        if (!cancelled) {
          setRules(data);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("loadError"));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, reloadKey]);

  async function handleToggle(rule: RuleDto, isActive: boolean) {
    try {
      const updated = await toggleRule(rule.id, isActive);
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      notify(err instanceof Error ? err.message : t("genericError"), "error");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      notify(t("deleted"), "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : t("genericError"), "error");
    }
  }

  const header = (
    <Breadcrumbs aria-label={t("breadcrumbLabel")} separator="/">
      <MuiLink
        component={Link}
        href="/settings?tab=statuses"
        underline="hover"
        color="inherit"
        sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
      >
        {t("backToStatuses")}
      </MuiLink>
      <Typography color="text.primary" fontWeight={600}>
        {t("title")}
      </Typography>
    </Breadcrumbs>
  );

  return (
    <RequirePermission permission="permission.update">
      <DashboardLayout header={header}>
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
            <Box>
              <Typography variant="h4" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
                {t("title")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t("subtitle")}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<HistoryIcon />}
                onClick={() => router.push("/automation/runs")}
              >
                {t("history")}
              </Button>
              <Tooltip title={t("createTooltip")}>
                <span>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => router.push("/automation/new")}
                  >
                    {t("create")}
                  </Button>
                </span>
              </Tooltip>
            </Box>
          </Box>
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
        ) : rules.length === 0 ? (
          <Box sx={{ py: 8, textAlign: "center" }}>
            <Typography variant="h6" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
              {t("emptyTitle")}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t("emptyDescription")}
            </Typography>
          </Box>
        ) : (
          <RuleList rules={rules} onToggle={handleToggle} onDelete={handleDelete} />
        )}
      </DashboardLayout>
    </RequirePermission>
  );
}
