"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Box, Divider, IconButton, Tooltip, Typography } from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import type { HelpCenterContact } from "@/lib/help-center-api";

/**
 * ข้อมูลติดต่อกลาง 1 ชุด (อีเมล/เบอร์/เวลาทำการ)
 * ใช้เป็น **fallback** ในป๊อปอัพ `/systems` เมื่อแอดมินยังไม่ได้เลือกโปรแกรมเมอร์
 * (เดิมอยู่ในศูนย์ช่วยเหลือ — ถูก extract ออกมาตอนถอดหน้านั้น)
 */
function gmailComposeUrl(to: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}`;
}

function ContactRow({
  icon,
  label,
  value,
  actions,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  actions?: ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, p: 1.5 }}>
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: 1.5,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          bgcolor: "action.hover",
          color: "primary.main",
          "& .MuiSvgIcon-root": { fontSize: 19 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" component="div">
          {label}
        </Typography>
        <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: "anywhere" }}>
          {value || "—"}
        </Typography>
      </Box>
      {actions}
    </Box>
  );
}

export default function CentralContactInfo({ contact }: { contact: HelpCenterContact }) {
  const t = useTranslations("SystemReports");
  const tn = useTranslations("Notifications");
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string, key: string) {
    void navigator.clipboard?.writeText(value).then(
      () => setCopied(key),
      () => {
        /* clipboard ถูกปฏิเสธ — ยังกด mailto:/tel: ได้อยู่ */
      },
    );
  }

  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 1 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ px: 1.5, pt: 1 }}>
        {t("contactAdminTitle")}
      </Typography>
      <ContactRow
        icon={<EmailOutlinedIcon />}
        label={t("contactEmail")}
        value={contact.supportEmail}
        actions={
          contact.supportEmail ? (
            <>
              <Tooltip title={tn("contactOpenEmail")}>
                <IconButton
                  size="small"
                  component="a"
                  href={gmailComposeUrl(contact.supportEmail)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={tn("contactOpenEmail")}
                >
                  <EmailOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copied === "email" ? tn("contactCopied") : tn("contactCopy")}>
                <IconButton
                  size="small"
                  onClick={() => copy(contact.supportEmail, "email")}
                  aria-label={tn("contactCopy")}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : undefined
        }
      />
      <Divider />
      <ContactRow
        icon={<PhoneOutlinedIcon />}
        label={t("contactPhone")}
        value={contact.supportPhone}
        actions={
          contact.supportPhone ? (
            <>
              <Tooltip title={tn("contactCall")}>
                <IconButton
                  size="small"
                  component="a"
                  href={`tel:${contact.supportPhone}`}
                  aria-label={tn("contactCall")}
                >
                  <PhoneOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={copied === "phone" ? tn("contactCopied") : tn("contactCopy")}>
                <IconButton
                  size="small"
                  onClick={() => copy(contact.supportPhone, "phone")}
                  aria-label={tn("contactCopy")}
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          ) : undefined
        }
      />
      <Divider />
      <ContactRow
        icon={<AccessTimeIcon />}
        label={t("contactWorkingHours")}
        value={contact.workingHours}
      />
    </Box>
  );
}
