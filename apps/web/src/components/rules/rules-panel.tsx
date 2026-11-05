"use client";

import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Typography, useTheme } from "@mui/material";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/lib/auth-store";
import { useNotification } from "@/components/notification";
import { fetchRules, deleteRule, toggleRule } from "@/lib/rules-api";
import { isApiError } from "@/lib/api";
import type { RuleDto } from "@kanban/shared";
import RuleList from "@/components/rules/rule-list";

interface RulesPanelProps {
  /**
   * `false` = view-only seat: rows render read-only (no switch / edit / delete).
   * Both hosts pass `can("automation.update")` — the list itself only needs
   * `automation.view`, which is what gates the host page/tab.
   */
  canUpdate: boolean;
}

/**
 * The rules list **body** (fetch + loading/error/empty + `RuleList`), shared by
 * the `/automation` page and the "ระบบอัตโนมัติ" tab in `/master-data` so the
 * two entry points can never drift apart. Header/title/buttons stay with each
 * host — they differ (breadcrumbs vs tab chrome).
 */
export default function RulesPanel({ canUpdate }: RulesPanelProps) {
  const t = useTranslations("Automation");
  const theme = useTheme();
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

  /**
   * A 404 means the rule is already gone from the DB (deleted from another
   * tab / session). Drop the stale row by refetching instead of leaving a
   * ghost that keeps failing every action.
   */
  function handleRuleGone(err: unknown): boolean {
    if (!isApiError(err, 404)) return false;
    notify(t("ruleGone"), "warning");
    setReloadKey((k) => k + 1);
    return true;
  }

  async function handleToggle(rule: RuleDto, isActive: boolean) {
    try {
      const updated = await toggleRule(rule.id, isActive);
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      if (handleRuleGone(err)) return;
      notify(err instanceof Error ? err.message : t("genericError"), "error");
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      notify(t("deleted"), "success");
    } catch (err) {
      if (handleRuleGone(err)) return;
      notify(err instanceof Error ? err.message : t("genericError"), "error");
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
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
    );
  }

  if (rules.length === 0) {
    return (
      <Box sx={{ py: 8, textAlign: "center" }}>
        <Typography variant="h6" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
          {t("emptyTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t("emptyDescription")}
        </Typography>
      </Box>
    );
  }

  return <RuleList rules={rules} onToggle={handleToggle} onDelete={handleDelete} canUpdate={canUpdate} />;
}
