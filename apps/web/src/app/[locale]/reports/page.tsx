"use client";

import { Box, Typography } from "@mui/material";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";

export default function ReportsPage() {
  return (
    <RequirePermission permission="report.view">
      <DashboardLayout>
        <Box sx={{ py: 4 }}>
          <Typography variant="h5" gutterBottom>
            รายงาน
          </Typography>
          <Typography variant="body1" color="text.secondary">
            หน้ารายงาน
          </Typography>
        </Box>
      </DashboardLayout>
    </RequirePermission>
  );
}
