"use client";

import { Box, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequireAuth from "@/components/require-auth";

export default function IssuesPage() {
  const t = useTranslations("Issues");

  return (
    <RequireAuth>
      <DashboardLayout>
        <Box sx={{ py: 4 }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            {t("title")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("comingSoon")}
          </Typography>
        </Box>
      </DashboardLayout>
    </RequireAuth>
  );
}
