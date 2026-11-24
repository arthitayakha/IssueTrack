"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Avatar, Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import LocalPhoneOutlinedIcon from "@mui/icons-material/LocalPhoneOutlined";
import type { ContractContact } from "@/lib/notifications-api";

/** วงกลมอักษรย่อ — ดึงสีจาก theme เสมอ ไม่ hardcode hex */
const AVATAR_COLORS = [
  "primary.main",
  "info.main",
  "success.main",
  "warning.main",
  "secondary.main",
];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * การ์ดรายชื่อผู้ติดต่อ (ชื่อ/อีเมล/เบอร์ + mailto/tel/ก๊อปปี้)
 * ใช้ในป๊อปอัพ `ContactCustomerDialog` บน `/systems` — รายชื่อตอนนี้คือ
 * โปรแกรมเมอร์ที่แอดมินเลือก (ผ่าน `GET /help-center/contact`)
 */
export default function AdminContactCards({
  contacts,
  emptyText,
}: {
  contacts: ContractContact[];
  emptyText?: string;
}) {
  const t = useTranslations("Notifications");
  const theme = useTheme();
  const [copied, setCopied] = useState<string | null>(null);

  function copy(value: string, key: string) {
    void navigator.clipboard?.writeText(value).then(
      () => setCopied(key),
      () => {
        /* clipboard ถูกปฏิเสธ — ยังกด mailto:/tel: ได้อยู่ */
      },
    );
  }

  if (contacts.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {emptyText ?? t("contactAdminEmpty")}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      {contacts.map((contact, index) => {
        const hasEmail = Boolean(contact.email);
        const hasPhone = Boolean(contact.phone);
        return (
          <Box
            key={contact.userId}
            sx={{
              display: "flex",
              gap: 1.5,
              p: 1.75,
              border: 1,
              borderColor: alpha(theme.palette.primary.main, 0.16),
              borderRadius: 2,
              bgcolor: alpha(theme.palette.primary.main, 0.04),
              transition: "box-shadow .15s, border-color .15s",
              "&:hover": { borderColor: "primary.main", boxShadow: theme.custom.cardShadow },
            }}
          >
            <Avatar
              sx={{
                width: 40,
                height: 40,
                flexShrink: 0,
                fontSize: 14,
                fontWeight: 700,
                bgcolor: AVATAR_COLORS[index % AVATAR_COLORS.length],
                color: "background.paper",
              }}
            >
              {initials(contact.name)}
            </Avatar>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
                {contact.name}
              </Typography>

              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
                <EmailOutlinedIcon sx={{ fontSize: 17, color: "text.secondary", flexShrink: 0 }} />
                <Typography
                  variant="body2"
                  color="text.primary"
                  sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
                >
                  {contact.email || "—"}
                </Typography>
                {hasEmail && (
                  <Box sx={{ display: "flex", flexShrink: 0 }}>
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
                    <Tooltip
                      title={
                        copied === `e${contact.userId}` ? t("contactCopied") : t("contactCopy")
                      }
                    >
                      <IconButton
                        size="small"
                        onClick={() => copy(contact.email!, `e${contact.userId}`)}
                        aria-label={t("contactCopy")}
                      >
                        <ContentCopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                )}
              </Box>

              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.5, minWidth: 0 }}>
                <LocalPhoneOutlinedIcon sx={{ fontSize: 17, color: "text.secondary", flexShrink: 0 }} />
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
                      <LocalPhoneOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
          </Box>
        );
      })}

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mt: 0.25 }}>
        <Chip
          size="small"
          label={`${contacts.length} ${t("contactCount")}`}
          sx={{ bgcolor: alpha(theme.palette.primary.main, 0.12), color: "primary.main", fontWeight: 700 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 180 }}>
          {t("contactAdminHint")}
        </Typography>
      </Box>
    </Box>
  );
}
