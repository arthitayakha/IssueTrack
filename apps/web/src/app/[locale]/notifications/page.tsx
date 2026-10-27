"use client";

import { useTheme } from "@mui/material";
import { Alert, Box, Button, Tooltip, Typography } from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";

/**
 * Notification inbox — shell only for now. Nothing is fetched yet; when the
 * backend lands this page will list items from GET /notifications.
 */
export default function NotificationsPage() {
  const t = useTranslations("Notifications");
  const theme = useTheme();

  return (
    <DashboardLayout>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
          {t("title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t("subtitle")}
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        {t("backendNote")}
      </Alert>

      <Box sx={{ py: 8, textAlign: "center" }}>
        <NotificationsNoneIcon sx={{ fontSize: 48, color: "text.disabled" }} />
        <Typography
          variant="h6"
          fontWeight={700}
          sx={{ color: theme.palette.navy.main, mt: 1 }}
        >
          {t("emptyTitle")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t("emptyDescription")}
        </Typography>
        <Tooltip title={t("markReadTooltip")}>
          <span>
            <Button variant="outlined" disabled sx={{ mt: 2.5 }}>
              {t("markRead")}
            </Button>
          </span>
        </Tooltip>
      </Box>
    </DashboardLayout>
  );
}
