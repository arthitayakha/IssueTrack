"use client";

import { useTranslations } from "next-intl";
import { alpha } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import CloseIcon from "@mui/icons-material/Close";
import type { ContractContact } from "@/lib/notifications-api";
import type { HelpCenterContact } from "@/lib/help-center-api";
import {
  appDialogContentSizing,
  appDialogPaperSx,
  appDialogSx,
} from "@/components/common/dialog-style";
import AdminContactCards from "@/components/help-center/admin-contact-cards";
import CentralContactInfo from "@/components/help-center/central-contact-info";

export interface ContactTarget {
  appName: string;
  companyName: string;
  contacts: ContractContact[];
  /**
   * มีเฉพาะตอนไม่มีโปรแกรมเมอร์ที่แอดมินเลือก — โชว์ข้อมูลติดต่อกลางแทนการ์ด
   * (fallback ตามที่ตกลง: ไม่ปล่อยกล่องเปล่า)
   */
  central?: HelpCenterContact;
  /** มีเฉพาะตอนเปิดจากสัญญา — ใช้โชว์ปุ่ม "แจ้งเตือน..." */
  appId?: number;
  companyId?: number;
}

/**
 * **ป๊อปอัพ "ติดต่อแอดมิน"** — เปิดจากปุ่มท้ายป๊อปอัพสัญญาบน `/systems`
 * โชว์การ์ดโปรแกรมเมอร์ที่แอดมินเลือก (หรือข้อมูลติดต่อกลางถ้าไม่มีใครเลือก)
 * ศูนย์ช่วยเหลือถูกถอดออกแล้วจึงไม่มี surface อื่นที่ใช้กล่องนี้
 */
export default function ContactCustomerDialog({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: ContactTarget | null;
  onClose: () => void;
}) {
  const t = useTranslations("Notifications");
  const theme = useTheme();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      PaperProps={{ sx: appDialogPaperSx }}
      sx={appDialogSx}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.info.main, 0.04)})`,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: "12px",
            display: "grid",
            placeItems: "center",
            bgcolor: alpha(theme.palette.primary.main, 0.14),
            color: "primary.main",
          }}
        >
          <SupportAgentIcon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700}>
            {t("contactAdminTitle")}
          </Typography>
          {target && (target.appName || target.companyName) && (
            <Typography variant="body2" color="text.secondary">
              {target.appName}
              {target.companyName ? ` · ${target.companyName}` : ""}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} aria-label={t("contactClose")}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={appDialogContentSizing}>
        {target?.central ? (
          <CentralContactInfo contact={target.central} />
        ) : (
          <AdminContactCards contacts={target?.contacts ?? []} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("contactClose")}</Button>
      </DialogActions>
    </Dialog>
  );
}
