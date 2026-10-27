"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@mui/material";
import { Alert, Breadcrumbs, Box, Button, CircularProgress, Link as MuiLink, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import RuleWizard from "@/components/rules/rule-wizard";
import { fetchRule } from "@/lib/rules-api";
import type { RuleDto } from "@kanban/shared";

/** Edit an existing rule — loads it first, then hands it to the wizard. */
export default function EditRulePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("Automation");
  const tWizard = useTranslations("Automation.wizard");
  const theme = useTheme();

  const [rule, setRule] = useState<RuleDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchRule(id);
        if (!cancelled) setRule(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadKey]);

  const header = (
    <Breadcrumbs aria-label={t("breadcrumbLabel")} separator="/">
      <MuiLink
        component={Link}
        href="/automation"
        underline="hover"
        color="inherit"
      >
        {t("title")}
      </MuiLink>
      <Typography color="text.primary" fontWeight={600}>
        {tWizard("editTitle")}
      </Typography>
    </Breadcrumbs>
  );

  return (
    <RequirePermission permission="permission.update">
      <DashboardLayout header={header}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
            {tWizard("editTitle")}
          </Typography>
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
        ) : rule ? (
          <RuleWizard initialRule={rule} />
        ) : (
          <Alert severity="warning">{t("loadError")}</Alert>
        )}
      </DashboardLayout>
    </RequirePermission>
  );
}
