"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
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
import MenuIcon from "@mui/icons-material/Menu";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { useAuthStore } from "@/lib/auth-store";
import { usePathname, useRouter } from "@/i18n/navigation";
import LanguageSwitcher from "./language-switcher";
import NotificationPopover, {
  type NotificationListStatus,
} from "@/components/notifications/notification-popover";
import {
  clearNotifications,
  deleteNotification,
  fetchNotificationCount,
  fetchNotifications,
  type NotificationPage,
} from "@/lib/notifications-api";

export const DRAWER_WIDTH = 240;

/** Rows pulled per request — the popover loads the next batch when the list end shows. */
const PAGE_SIZE = 20;
/** Cap per refresh, so a reopened, long scroll-loaded list never fetches huge. */
const POLL_MAX_ROWS = 50;
const EMPTY_PAGE: NotificationPage = { items: [], page: 0, total: 0 };

/** The list's lifecycle: `idle` until the bell is opened for the first time. */
type ListStatus = NotificationListStatus;

/**
 * The badge travels alone: one shared `/notifications/count` request in flight
 * for the whole app, so StrictMode's second effect pass and a Navbar remount on
 * navigation join it instead of firing a duplicate. The inbox ROWS are never
 * fetched here — only when the bell is opened.
 */
let countInflight: Promise<number> | null = null;
function loadCount(): Promise<number> {
  if (!countInflight) {
    countInflight = fetchNotificationCount()
      .then((res) => res.count)
      .finally(() => {
        countInflight = null;
      });
  }
  return countInflight;
}

export default function Navbar({
  header,
  onMenuToggle,
  showMenuButton = false,
}: {
  header?: React.ReactNode;
  /** Toggles the mobile drawer — only rendered while `showMenuButton` is true. */
  onMenuToggle?: () => void;
  /** True on screens below `xl`, where the sidebar is a temporary drawer. */
  showMenuButton?: boolean;
}) {
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

  // one list: the inbox. Every row is unread, and reading one deletes it.
  const [inbox, setInbox] = useState<NotificationPage>(EMPTY_PAGE);
  // `idle` until the bell opens the first time — rows are not fetched on load
  const [listStatus, setListStatus] = useState<ListStatus>("idle");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bellAnchorEl, setBellAnchorEl] = useState<HTMLElement | null>(null);

  // polling and scroll-loading both need a fresh view of what is on screen
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;
  const loadingMoreRef = useRef(false);
  const listSeqRef = useRef(0); // out-of-order guard for list responses
  const statusRef = useRef(listStatus);
  statusRef.current = listStatus;
  const openRef = useRef(false); // the rows only ride the 30s poll while visible

  /** Badge refresh — cheap COUNT only, never the rows. */
  const refreshCount = useCallback(async () => {
    try {
      setUnreadCount(await loadCount());
    } catch {
      // keep the last known badge — the next poll retries
    }
  }, []);

  /**
   * Fetches the inbox — only ever called when the bell opens (first time =
   * spinner, later = silent refresh of what is on screen) or on retry. The
   * sequence ref drops a late response so an old page can never clobber a
   * newer one (the bug behind "badge 43, empty list").
   */
  const refreshList = useCallback(async () => {
    const seq = (listSeqRef.current += 1);
    const firstLoad = statusRef.current !== "ready";
    if (firstLoad) setListStatus("loading");
    try {
      // keep the rows already on screen (capped) so a refresh never shrinks
      // the list while the user is reading it — and never grows huge
      const res = await fetchNotifications(
        1,
        Math.min(Math.max(PAGE_SIZE, inboxRef.current.items.length), POLL_MAX_ROWS),
      );
      if (seq !== listSeqRef.current) return;
      setInbox({ items: res.data, page: res.page, total: res.total });
      // the badge must reflect the server count, not just the loaded rows
      setUnreadCount(res.unreadCount);
      setListStatus("ready");
    } catch {
      if (seq !== listSeqRef.current) return;
      // keep the last known list — the next open / 30s poll retries
      if (firstLoad) setListStatus("error");
    }
  }, []);

  // badge poll: COUNT every 30s; the rows only ride along while on screen
  useEffect(() => {
    void refreshCount();
    const timer = setInterval(() => {
      void refreshCount();
      if (openRef.current && statusRef.current === "ready") void refreshList();
    }, 30_000);
    return () => clearInterval(timer);
  }, [refreshCount, refreshList]);

  const handleOpenBell = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      openRef.current = true;
      setBellAnchorEl(event.currentTarget);
      // every open refreshes: the first shows the spinner, later ones update silently
      void refreshList();
    },
    [refreshList],
  );

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    const current = inboxRef.current;
    if (current.items.length >= current.total) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const seq = listSeqRef.current;
    try {
      const res = await fetchNotifications(current.page + 1, PAGE_SIZE);
      if (seq !== listSeqRef.current) return; // a refresh replaced the list meanwhile
      setInbox((prev) => {
        // never show a row twice
        const seen = new Set(prev.items.map((n) => n.id));
        const fresh = res.data.filter((n) => !seen.has(n.id));
        return { items: [...prev.items, ...fresh], page: res.page, total: res.total };
      });
      setUnreadCount(res.unreadCount);
    } catch {
      // the next poll retries
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  // reading = deleting — drop the row and the badge now; on failure the list
  // and the count both resync from the server (the row was never deleted)
  function handleMarkRead(id: number) {
    setInbox((prev) => ({
      ...prev,
      items: prev.items.filter((n) => n.id !== id),
      total: Math.max(0, prev.total - 1),
    }));
    setUnreadCount((count) => Math.max(0, count - 1));
    deleteNotification(id).catch(() => {
      void refreshCount();
      if (statusRef.current === "ready") void refreshList();
    });
  }

  function handleMarkAllRead() {
    setInbox(EMPTY_PAGE);
    setUnreadCount(0);
    clearNotifications().catch(() => {
      void refreshCount();
      if (statusRef.current === "ready") void refreshList();
    });
  }

  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        width: { xl: `calc(100% - ${DRAWER_WIDTH}px)` },
        ml: { xl: `${DRAWER_WIDTH}px` },
        bgcolor: "background.paper",
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Toolbar>
        {showMenuButton && (
          <IconButton
            edge="start"
            onClick={onMenuToggle}
            aria-label={t("menu")}
            title={t("menu")}
            sx={{ mr: 1 }}
          >
            <MenuIcon />
          </IconButton>
        )}
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {header ?? (
            <Typography variant="h6" fontWeight={700} color="text.primary">
              {t(routeTitleKey)}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0 }}>
          <IconButton
            onClick={handleOpenBell}
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
            data={inbox}
            status={listStatus}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
            onRetry={() => void refreshList()}
            onClose={() => {
              openRef.current = false;
              setBellAnchorEl(null);
            }}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
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
