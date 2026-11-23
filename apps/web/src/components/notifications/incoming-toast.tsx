"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Box, Grow, IconButton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import type { AppNotification } from "@/lib/notifications-api";
import {
  getActionLabels,
  getNotificationVariant,
  notificationSubject,
} from "@/lib/notification-format";
import { timeAgo } from "@/lib/time-ago";

/** Facebook-like popup — 5s, paused while the pointer rests on the card. */
export const TOAST_DURATION_MS = 5000;

interface IncomingToastProps {
  item: AppNotification | null;
  /** Click the card → read + navigate. */
  onOpen: (item: AppNotification) => void;
  /** Click × or let the timer run out → dismiss only; the row stays in the bell. */
  onDismiss: () => void;
}

export default function IncomingToast({ item, onOpen, onDismiss }: IncomingToastProps) {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const theme = useTheme();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!item || paused) return;
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [item, paused, onDismiss]);

  if (!item) return null;

  // Same wording as the inbox row — the label map and the variant live in one
  // shared module, so a translation change cannot reach only one of the two.
  const labels = getActionLabels(t);
  const variant = getNotificationVariant(item);
  const label = labels[item.action] ?? item.action;
  const strike = item.action === "deleted" ? { textDecoration: "line-through" as const } : {};

  return (
    <Grow in timeout={250}>
      <Box
        role="status"
        aria-live="polite"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onClick={() => onOpen(item)}
        sx={{
          position: "fixed",
          top: { xs: 68, sm: 76 },
          right: { xs: 12, sm: 24 },
          zIndex: 1400,
          width: 360,
          maxWidth: "calc(100vw - 24px)",
          display: "flex",
          alignItems: "flex-start",
          gap: 1.25,
          p: 1.5,
          cursor: "pointer",
          bgcolor: "background.paper",
          color: "text.primary",
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
          // Neutral primary accent — deliberately NOT the priority colour;
          // the earlier ruling removed priority chips from the inbox too.
          borderLeft: "3px solid",
          borderLeftColor: "primary.main",
          boxShadow: theme.custom.cardShadow,
          transition: "transform 180ms ease, box-shadow 180ms ease",
          // ⚠️ ต้องเป็นขาวทึบเสมอ — ห้ามใช้ `action.hover` (โปร่งใส rgba)
          // เพราะมันจะแทนที่พื้นหลังทำให้การ์ดดู "จาง" ตอนวางเม้าส์
          "&:hover": {
            bgcolor: "background.paper",
            boxShadow: theme.shadows[8],
            transform: "translateY(-2px)",
          },
        }}
      >
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: "primary.main",
            color: "primary.contrastText",
          }}
        >
          <NotificationsNoneIcon sx={{ fontSize: 20 }} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.45 }}>
            <Box component="span" sx={{ fontWeight: 700, ...strike }}>
              {notificationSubject(item, variant)}
            </Box>{" "}
            {label}{" "}
            {variant === "stale" ? (
              <Box component="span" sx={{ fontWeight: 700 }}>
                {item.context}
              </Box>
            ) : variant === "actor" ? (
              <Box component="span" sx={{ fontWeight: 700, ...strike }}>
                {item.target}
              </Box>
            ) : null}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
            {timeAgo(item.createdAt, locale)}
            {item.context && variant !== "stale" ? ` • ${item.context}` : ""}
          </Typography>
        </Box>

        <IconButton
          size="small"
          aria-label={t("dismiss")}
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
          sx={{ p: 0.25, color: "text.secondary", flexShrink: 0 }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
    </Grow>
  );
}
