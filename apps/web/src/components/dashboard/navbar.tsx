"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  IconButton,
  Toolbar,
  Typography,
} from "@mui/material";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { useAuthStore } from "@/lib/auth-store";
import { usePathname, useRouter } from "@/i18n/navigation";
import LanguageSwitcher from "./language-switcher";
import NotificationPopover from "@/components/notifications/notification-popover";
import {
  archiveNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/notifications-api";

export const DRAWER_WIDTH = 240;

export default function Navbar({ header }: { header?: React.ReactNode }) {
  const t = useTranslations("Nav");
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const routeTitleMap: Record<string, string> = {
    "/issues/new": "reportIssue",
  };
  const routeTitleKey =
    routeTitleMap[pathname] ??
    (pathname.replace(/^\//, "").split("/")[0] || "dashboard");

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [bellAnchorEl, setBellAnchorEl] = useState<HTMLElement | null>(null);

  const refreshNotifications = useCallback(async () => {
    try {
      const res = await fetchNotifications();
      setNotifications(res.data);
      // the badge must reflect the server count, not just the loaded rows
      setUnreadCount(res.unreadCount);
    } catch {
      // keep the last known list — the next poll retries
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
    const timer = setInterval(refreshNotifications, 30_000);
    return () => clearInterval(timer);
  }, [refreshNotifications]);

  // optimistic update; on API failure the next poll resyncs the list
  function handleMarkRead(id: number) {
    const target = notifications.find((n) => n.id === id);
    const wasUnread = !!target && !target.isRead && !target.isArchived;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
    if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
    markNotificationRead(id).catch(refreshNotifications);
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    markAllNotificationsRead().catch(refreshNotifications);
  }

  function handleArchive(id: number) {
    const target = notifications.find((n) => n.id === id);
    const wasUnread = !!target && !target.isRead && !target.isArchived;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isArchived: true } : n)),
    );
    if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
    archiveNotification(id).catch(refreshNotifications);
  }

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
        ml: { sm: `${DRAWER_WIDTH}px` },
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Toolbar>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {header ?? (
            <Typography variant="h6" fontWeight={700} color="text.primary">
              {t(routeTitleKey)}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0 }}>
          <IconButton
            onClick={(event) => setBellAnchorEl(event.currentTarget)}
            aria-label={t("notifications")}
            title={t("notifications")}
            size="small"
            aria-haspopup="dialog"
            aria-expanded={Boolean(bellAnchorEl)}
          >
            <Badge badgeContent={unreadCount} color="error">
              <NotificationsNoneIcon fontSize="small" />
            </Badge>
          </IconButton>
          <NotificationPopover
            open={Boolean(bellAnchorEl)}
            anchorEl={bellAnchorEl}
            items={notifications}
            onClose={() => setBellAnchorEl(null)}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
            onArchive={handleArchive}
          />
          <LanguageSwitcher />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ display: { xs: "none", sm: "block" } }}
          >
            {user?.name}
          </Typography>
          <Avatar
            sx={{
              width: 32,
              height: 32,
              bgcolor: "primary.main",
              color: "primary.contrastText",
              fontSize: "0.875rem",
              fontWeight: 600,
            }}
          >
            {user?.name?.charAt(0).toUpperCase()}
          </Avatar>
          <IconButton onClick={handleLogout} aria-label={t("signOut")} size="small">
            <LogoutOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
