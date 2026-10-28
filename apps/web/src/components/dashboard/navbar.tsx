"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type NotificationCounts,
  type NotificationPage,
  type NotificationTab,
} from "@/lib/notifications-api";

export const DRAWER_WIDTH = 240;

/** Rows pulled per request — the popover loads the next batch when the list end shows. */
const PAGE_SIZE = 20;
/** Cap per tab per poll, so a long scroll-loaded list never makes the 30s refresh huge. */
const POLL_MAX_ROWS = 50;
const TABS: NotificationTab[] = ["inbox", "general", "archived"];
const EMPTY_PAGE: NotificationPage = { items: [], page: 0, total: 0 };
const EMPTY_TABS: Record<NotificationTab, NotificationPage> = {
  inbox: EMPTY_PAGE,
  general: EMPTY_PAGE,
  archived: EMPTY_PAGE,
};
const EMPTY_COUNTS: NotificationCounts = { inbox: 0, general: 0, archived: 0 };

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

  const [tabPages, setTabPages] = useState<Record<NotificationTab, NotificationPage>>(
    EMPTY_TABS,
  );
  const [counts, setCounts] = useState<NotificationCounts>(EMPTY_COUNTS);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bellAnchorEl, setBellAnchorEl] = useState<HTMLElement | null>(null);

  // polling and scroll-loading both need a fresh view of what is on screen
  const tabPagesRef = useRef(tabPages);
  tabPagesRef.current = tabPages;
  const loadingMoreRef = useRef(false);

  const refreshNotifications = useCallback(async () => {
    try {
      // refetch only the rows already on screen (capped) so the 30s poll never
      // shrinks the list while the user is reading it — and never grows huge
      const results = await Promise.all(
        TABS.map((tab) =>
          fetchNotifications(
            1,
            Math.min(
              Math.max(PAGE_SIZE, tabPagesRef.current[tab].items.length),
              POLL_MAX_ROWS,
            ),
            tab,
          ),
        ),
      );
      const next: Record<NotificationTab, NotificationPage> = { ...EMPTY_TABS };
      results.forEach((res, index) => {
        const tab = TABS[index];
        next[tab] = { items: res.data, page: res.page, total: res.total };
      });
      setTabPages(next);
      setCounts(results[0].counts);
      // the badge must reflect the server count, not just the loaded rows
      setUnreadCount(results[0].unreadCount);
    } catch {
      // keep the last known list — the next poll retries
    }
  }, []);

  useEffect(() => {
    refreshNotifications();
    const timer = setInterval(refreshNotifications, 30_000);
    return () => clearInterval(timer);
  }, [refreshNotifications]);

  const handleLoadMore = useCallback(async (tab: NotificationTab) => {
    if (loadingMoreRef.current) return;
    const current = tabPagesRef.current[tab];
    if (current.items.length >= current.total) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetchNotifications(current.page + 1, PAGE_SIZE, tab);
      setTabPages((prev) => {
        const existing = prev[tab];
        // a poll may have refreshed page 1 meanwhile — never show a row twice
        const seen = new Set(existing.items.map((n) => n.id));
        const fresh = res.data.filter((n) => !seen.has(n.id));
        return {
          ...prev,
          [tab]: {
            items: [...existing.items, ...fresh],
            page: res.page,
            total: res.total,
          },
        };
      });
      setCounts(res.counts);
      setUnreadCount(res.unreadCount);
    } catch {
      // the next poll retries
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  function findItem(id: number): { tab: NotificationTab; item: AppNotification } | null {
    for (const tab of TABS) {
      const item = tabPages[tab].items.find((n) => n.id === id);
      if (item) return { tab, item };
    }
    return null;
  }

  // optimistic update; on API failure the next poll resyncs the list
  function handleMarkRead(id: number) {
    const found = findItem(id);
    // already read → nothing to move (clicking a "general" row must not drop it)
    if (!found || found.item.isRead) return;
    const wasUnread = found.tab === "inbox";
    setTabPages((prev) => {
      const next: Record<NotificationTab, NotificationPage> = { ...prev };
      next[found.tab] = {
        ...next[found.tab],
        items: next[found.tab].items.filter((n) => n.id !== id),
        total: Math.max(0, next[found.tab].total - 1),
      };
      if (found.tab === "inbox") {
        // a read notification belongs to the "general" tab now
        next.general = {
          ...next.general,
          items: [{ ...found.item, isRead: true }, ...next.general.items],
          total: next.general.total + 1,
        };
      } else if (found.tab === "archived") {
        // archived rows stay where they are, only their read flag flips
        next.archived = {
          ...next.archived,
          items: next.archived.items.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
        };
      }
      return next;
    });
    if (wasUnread) {
      setUnreadCount((count) => Math.max(0, count - 1));
      setCounts((c) => ({ ...c, inbox: Math.max(0, c.inbox - 1), general: c.general + 1 }));
    }
    markNotificationRead(id).catch(refreshNotifications);
  }

  function handleMarkAllRead() {
    setTabPages((prev) => {
      const moved = prev.inbox.items.map((n) => ({ ...n, isRead: true }));
      return {
        ...prev,
        inbox: { ...prev.inbox, items: [], total: 0 },
        general: {
          ...prev.general,
          items: [...moved, ...prev.general.items],
          total: prev.general.total + prev.inbox.total,
        },
      };
    });
    setUnreadCount(0);
    setCounts((c) => ({ ...c, inbox: 0, general: c.general + c.inbox }));
    markAllNotificationsRead().catch(refreshNotifications);
  }

  function handleArchive(id: number) {
    const found = findItem(id);
    if (!found) return;
    setTabPages((prev) => {
      const next: Record<NotificationTab, NotificationPage> = { ...prev };
      next[found.tab] = {
        ...next[found.tab],
        items: next[found.tab].items.filter((n) => n.id !== id),
        total: Math.max(0, next[found.tab].total - 1),
      };
      next.archived = {
        ...next.archived,
        items: [{ ...found.item, isArchived: true }, ...next.archived.items],
        total: next.archived.total + 1,
      };
      return next;
    });
    setCounts((c) => ({
      inbox: found.tab === "inbox" ? Math.max(0, c.inbox - 1) : c.inbox,
      general: found.tab === "general" ? Math.max(0, c.general - 1) : c.general,
      archived: c.archived + 1,
    }));
    if (found.tab === "inbox") setUnreadCount((count) => Math.max(0, count - 1));
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
            data={tabPages}
            counts={counts}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
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
