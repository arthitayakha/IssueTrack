"use client";

import { Box, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";

export default function LabelsPage() {
  const t = useTranslations("Labels");

  return (
    <RequirePermission permission="board.view">
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
    </RequirePermission>
  );
}
