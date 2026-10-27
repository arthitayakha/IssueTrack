"use client";

import { useState } from "react";
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
import { MOCK_NOTIFICATIONS } from "@/components/notifications/notifications.mock";

export const DRAWER_WIDTH = 240;

export default function Navbar({ header }: { header?: React.ReactNode }) {
  const t = useTranslations("Nav");
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const routeTitleMap: Record<string, string> = {
    "/issues/new": "reportIssue",
    "/issues": "issues",
  };
  const routeTitleKey =
    routeTitleMap[pathname] ??
    (pathname.replace(/^\//, "").split("/")[0] || "dashboard");

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  // TODO(backend): replace MOCK_NOTIFICATIONS with GET /notifications + polling
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);
  const [bellAnchorEl, setBellAnchorEl] = useState<HTMLElement | null>(null);
  const unreadCount = notifications.filter((n) => !n.isRead && !n.isArchived).length;

  function handleMarkRead(id: number) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }

  function handleArchive(id: number) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isArchived: true } : n)),
    );
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
