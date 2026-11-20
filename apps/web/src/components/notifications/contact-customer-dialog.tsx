"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { alpha } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import SupportAgentIcon from "@mui/icons-material/SupportAgent";
import CloseIcon from "@mui/icons-material/Close";
import type { ContractContact } from "@/lib/notifications-api";
import {
  appDialogContentSizing,
  appDialogPaperSx,
  appDialogSx,
} from "@/components/common/dialog-style";

export interface ContactTarget {
  appName: string;
  companyName: string;
  contacts: ContractContact[];
  /** มีเฉพาะตอนเปิดจากสัญญา — ใช้โชว์ปุ่ม "แจ้งเตือน..." */
  appId?: number;
  companyId?: number;
}

/**
 * **ป๊อปอัพ "ติดต่อแอดมิน"** — ลูกค้า/สตาฟฟ์กดจากศูนย์ช่วยเหลือ → โชว์รายชื่อ/
 * อีเมล/เบอร์ของแอดมิน (ดึงผ่าน `GET /notifications/admin-contacts`)
 *
 * ไม่มีช่องทางติดต่อ → โชว์ข้อความแจ้งแทนการปล่อยช่องว่าง
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
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string, key: string) {
    void navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(key);
      },
      () => {
        /* clipboard ถูกปฏิเสธ (http/permission) — ยังกด mailto:/tel: ได้อยู่ */
      },
    );
  }

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
        {!target || target.contacts.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("contactAdminEmpty")}
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {target.contacts.map((contact) => {
              const hasEmail = Boolean(contact.email);
              const hasPhone = Boolean(contact.phone);
              return (
                <Box
                  key={contact.userId}
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1.5,
                    p: 1.5,
                  }}
                >
                  <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
                    {contact.name}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75 }}>
                    <EmailOutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                    <Typography
                      variant="body2"
                      color="text.primary"
                      sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
                    >
                      {contact.email || "—"}
                    </Typography>
                    {hasEmail && (
                      <>
                        <Tooltip title={t("contactOpenEmail")}>
                          <IconButton
                            size="small"
                            component="a"
                            href={`mailto:${contact.email}`}
                            aria-label={t("contactOpenEmail")}
                          >
                            <EmailOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={copied === `e${contact.userId}` ? t("contactCopied") : t("contactCopy")}>
                          <IconButton
                            size="small"
                            onClick={() => copy(contact.email!, `e${contact.userId}`)}
                            aria-label={t("contactCopy")}
                          >
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <PhoneOutlinedIcon sx={{ fontSize: 18, color: "text.secondary" }} />
                    <Typography variant="body2" color="text.primary" sx={{ flex: 1, minWidth: 0 }}>
                      {contact.phone || "—"}
                    </Typography>
                    {hasPhone && (
                      <Tooltip title={t("contactCall")}>
                        <IconButton
                          size="small"
                          component="a"
                          href={`tel:${contact.phone}`}
                          aria-label={t("contactCall")}
                        >
                          <PhoneOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </Box>
              );
            })}
            <Typography variant="caption" color="text.secondary">
              {t("contactAdminHint")}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {target && target.contacts.length > 0 && (
          <Chip
            size="small"
            variant="outlined"
            label={`${target.contacts.length} ${t("contactCount")}`}
            sx={{ mr: "auto" }}
          />
        )}
        <Button onClick={onClose}>{t("contactClose")}</Button>
      </DialogActions>
    </Dialog>
  );
}
