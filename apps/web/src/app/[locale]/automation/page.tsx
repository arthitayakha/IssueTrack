"use client";

import { useTheme } from "@mui/material";
import { Breadcrumbs, Box, Button, Link as MuiLink, Tooltip, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import HistoryIcon from "@mui/icons-material/History";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import RequirePermission from "@/components/require-permission";
import { Link, useRouter } from "@/i18n/navigation";
import { usePermissions } from "@/lib/permissions";
import RulesPanel from "@/components/rules/rules-panel";

/**
 * รายการกฎ — gate ด้วย **`automation.view`** (ดูได้) ส่วนปุ่ม "สร้างกฎ" ขึ้นเฉพาะ
 * **`automation.update`** ตรงกับ backend (`GET /rules` = view, mutation = update)
 * ทำให้ช่อง "ดูกฎ" ใน dialog สิทธิ์มีผลจริง
 */
export default function AutomationPage() {
  const t = useTranslations("Automation");
  const theme = useTheme();
  const router = useRouter();
  const { can } = usePermissions();

  const canUpdate = can("automation.update");

  /**
   * ทางกลับ: ใครมี `status.view` กลับแท็บสถานะเหมือนเดิม — แต่คนที่มีแต่สิทธิ์กฎ
   * ไม่มีแท็บสถานะให้กลับ จึงชี้ไปแท็บระบบอัตโนมัติแทน (ไม่งั้นโดนเด้งออกหน้าแรก)
   */
  const backHref = can("status.view") ? "/master-data?tab=statuses" : "/master-data?tab=automation";
  const backLabel = can("status.view") ? t("backToStatuses") : t("backToMasterData");

  const header = (
    <Breadcrumbs aria-label={t("breadcrumbLabel")} separator="/">
      <MuiLink
        component={Link}
        href={backHref}
        underline="hover"
        color="inherit"
        sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
      >
        {backLabel}
      </MuiLink>
      <Typography color="text.primary" fontWeight={600}>
        {t("title")}
      </Typography>
    </Breadcrumbs>
  );

  return (
    <RequirePermission permission="automation.view">
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
              {canUpdate && (
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
              )}
            </Box>
          </Box>
        </Box>

        {/* fetch + loading/error/empty + รายการ — แชร์กับแท็บใน /master-data */}
        <RulesPanel canUpdate={canUpdate} />
      </DashboardLayout>
    </RequirePermission>
  );
}
