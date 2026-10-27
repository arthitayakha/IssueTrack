"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "@mui/material/styles";
import {
  Avatar,
  Box,
  Divider,
  IconButton,
  ListItemButton,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { useRouter } from "@/i18n/navigation";
import { timeAgo } from "@/lib/time-ago";
import type { AppNotification, NotificationAction, NotificationTab } from "./notifications.mock";

interface NotificationPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  items: AppNotification[];
  onClose: () => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
  onArchive: (id: number) => void;
}

const TAB_ORDER: NotificationTab[] = ["inbox", "general", "archived"];

const AVATAR_COLORS = [
  "primary.main",
  "secondary.main",
  "info.main",
  "success.main",
  "warning.main",
];

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function matchesTab(item: AppNotification, tab: NotificationTab): boolean {
  if (tab === "archived") return item.isArchived;
  if (item.isArchived) return false;
  return tab === "inbox" ? !item.isRead : item.isRead;
}

export default function NotificationPopover({
  open,
  anchorEl,
  items,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onArchive,
}: NotificationPopoverProps) {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const theme = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<NotificationTab>("inbox");

  const counts: Record<NotificationTab, number> = {
    inbox: items.filter((item) => matchesTab(item, "inbox")).length,
    general: items.filter((item) => matchesTab(item, "general")).length,
    archived: items.filter((item) => matchesTab(item, "archived")).length,
  };

  const tabLabels: Record<NotificationTab, string> = {
    inbox: t("tabs.inbox"),
    general: t("tabs.general"),
    archived: t("tabs.archived"),
  };

  const emptyContent: Record<NotificationTab, { title: string; description: string }> = {
    inbox: { title: t("emptyInbox.title"), description: t("emptyInbox.description") },
    general: { title: t("emptyGeneral.title"), description: t("emptyGeneral.description") },
    archived: { title: t("emptyArchived.title"), description: t("emptyArchived.description") },
  };

  const actionLabels: Record<NotificationAction, string> = {
    created: t("actions.created"),
    assigned: t("actions.assigned"),
    commented: t("actions.commented"),
    moved: t("actions.moved"),
    edited: t("actions.edited"),
  };

  const visibleItems = items.filter((item) => matchesTab(item, tab));

  function handleItemClick(item: AppNotification) {
    onMarkRead(item.id);
    onClose();
    router.push("/issues");
  }

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
      slotProps={{
        paper: {
          sx: {
            width: 380,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "72vh",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            borderRadius: 2,
            border: "1px solid",
            borderColor: "divider",
            boxShadow: theme.custom.cardShadow,
          },
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          px: 2,
          py: 1.5,
        }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          {t("title")}
        </Typography>
        <Box
          component="button"
          type="button"
          onClick={onMarkAllRead}
          disabled={counts.inbox === 0}
          sx={{
            p: 0,
            border: "none",
            bgcolor: "transparent",
            cursor: counts.inbox > 0 ? "pointer" : "default",
            fontFamily: "inherit",
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: counts.inbox > 0 ? "primary.main" : "text.disabled",
            "&:hover": counts.inbox > 0 ? { textDecoration: "underline" } : {},
          }}
        >
          {t("markRead")}
        </Box>
      </Box>

      {/* Tabs */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        {TAB_ORDER.map((key) => {
          const active = tab === key;
          return (
            <Box
              key={key}
              component="button"
              type="button"
              onClick={() => setTab(key)}
              aria-current={active}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.75,
                p: 0,
                pt: 1,
                pb: 0.75,
                border: "none",
                borderBottom: "2px solid",
                borderColor: active ? "primary.main" : "transparent",
                bgcolor: "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: "0.8125rem",
                fontWeight: active ? 700 : 500,
                color: active ? "text.primary" : "text.secondary",
                "&:hover": { color: active ? "text.primary" : "text.primary" },
              }}
            >
              {tabLabels[key]}
              <Box
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 18,
                  height: 18,
                  px: 0.5,
                  borderRadius: "999px",
                  fontSize: "0.6875rem",
                  fontWeight: 700,
                  bgcolor: active ? "primary.main" : "action.hover",
                  color: active ? "primary.contrastText" : "text.secondary",
                }}
              >
                {counts[key]}
              </Box>
            </Box>
          );
        })}
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t("settings")}>
          <IconButton size="small" onClick={() => router.push("/settings")} sx={{ mb: 0.5 }}>
            <SettingsOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* List */}
      <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {visibleItems.length === 0 ? (
          <Box sx={{ px: 3, py: 5, textAlign: "center" }}>
            <NotificationsNoneIcon sx={{ fontSize: 36, color: "text.disabled", mb: 1 }} />
            <Typography variant="subtitle2" color="text.primary" fontWeight={600}>
              {emptyContent[tab].title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {emptyContent[tab].description}
            </Typography>
          </Box>
        ) : (
          visibleItems.map((item, index) => {
            const unread = !item.isRead && !item.isArchived;
            return (
              <Box key={item.id}>
                {index > 0 && <Divider />}
                <ListItemButton
                  onClick={() => handleItemClick(item)}
                  selected={unread}
                  sx={{
                    alignItems: "flex-start",
                    gap: 1.5,
                    px: 2,
                    py: 1.5,
                    "&:hover": { bgcolor: "action.hover" },
                    "&.Mui-selected, &.Mui-selected:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Avatar
                    sx={{
                      width: 36,
                      height: 36,
                      fontSize: 14,
                      fontWeight: 600,
                      bgcolor: AVATAR_COLORS[item.id % AVATAR_COLORS.length],
                      color: "background.paper",
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(item.actorName)}
                  </Avatar>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      color="text.primary"
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Box component="span" sx={{ fontWeight: 700 }}>
                        {item.actorName}
                      </Box>{" "}
                      {actionLabels[item.action]}{" "}
                      <Box component="span" sx={{ fontWeight: 700 }}>
                        {item.target}
                      </Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {timeAgo(item.createdAt, locale)} • {item.context}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 0.75,
                      flexShrink: 0,
                      pt: 0.25,
                    }}
                  >
                    {unread && (
                      <Box
                        aria-label={t("unread")}
                        sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main" }}
                      />
                    )}
                    {!item.isArchived && (
                      <Tooltip title={t("archive")}>
                        <IconButton
                          size="small"
                          aria-label={t("archive")}
                          onClick={(event) => {
                            event.stopPropagation();
                            onArchive(item.id);
                          }}
                          sx={{ opacity: 0.4, "&:hover": { opacity: 1 } }}
                        >
                          <ArchiveOutlinedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </ListItemButton>
              </Box>
            );
          })
        )}
      </Box>
    </Popover>
  );
}
