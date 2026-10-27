"use client";

import { useTheme } from "@mui/material";
import { Alert, Breadcrumbs, Box, Button, Link as MuiLink, Tooltip, Typography } from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { Link } from "@/i18n/navigation";

/**
 * Rule run history — shell only until GET /rules/runs exists, mirroring the
 * notifications page: explains the state instead of firing a failing request.
 */
export default function RuleRunsPage() {
  const t = useTranslations("Automation");
  const tRuns = useTranslations("Automation.runs");
  const theme = useTheme();

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

        <Alert severity="info" sx={{ mb: 3 }}>
          {tRuns("backendNote")}
        </Alert>

        <Box sx={{ py: 8, textAlign: "center" }}>
          <HistoryIcon sx={{ fontSize: 48, color: "text.disabled" }} />
          <Typography variant="h6" fontWeight={700} sx={{ color: theme.palette.navy.main, mt: 1 }}>
            {tRuns("emptyTitle")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {tRuns("emptyDescription")}
          </Typography>
          <Tooltip title={tRuns("refreshTooltip")}>
            <span>
              <Button variant="outlined" disabled startIcon={<RefreshIcon />} sx={{ mt: 2.5 }}>
                {tRuns("refresh")}
              </Button>
            </span>
          </Tooltip>
        </Box>
      </DashboardLayout>
    </RequirePermission>
  );
}
