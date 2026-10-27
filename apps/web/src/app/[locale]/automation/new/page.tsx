"use client";

import { useTheme } from "@mui/material";
import { Breadcrumbs, Box, Link as MuiLink, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { Link } from "@/i18n/navigation";
import RuleWizard from "@/components/rules/rule-wizard";

export default function NewRulePage() {
  const t = useTranslations("Automation");
  const tWizard = useTranslations("Automation.wizard");
  const theme = useTheme();

  const header = (
    <Breadcrumbs aria-label={t("breadcrumbLabel")} separator="/">
      <MuiLink
        component={Link}
        href="/settings?tab=statuses"
        underline="hover"
        color="inherit"
      >
        {t("backToStatuses")}
      </MuiLink>
      <MuiLink
        component={Link}
        href="/automation"
        underline="hover"
        color="inherit"
      >
        {t("title")}
      </MuiLink>
      <Typography color="text.primary" fontWeight={600}>
        {tWizard("title")}
      </Typography>
    </Breadcrumbs>
  );

  return (
    <RequirePermission permission="automation.update">
      <DashboardLayout header={header}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
            {tWizard("title")}
          </Typography>
        </Box>

        <RuleWizard />
      </DashboardLayout>
    </RequirePermission>
  );
}
