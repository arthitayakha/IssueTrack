"use client";

import { Box, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequireAuth from "@/components/require-auth";

export default function HomePage() {
  const t = useTranslations("Dashboard");

  return (
    <RequireAuth>
      <DashboardLayout>
        <Box sx={{ py: 4, textAlign: "center" }}>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            {t("welcome")}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {t("subtitle")}
          </Typography>
        </Box>
      </DashboardLayout>
    </RequireAuth>
  );
}
