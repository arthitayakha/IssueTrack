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
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import { useAuthStore } from "@/lib/auth-store";
import { useOwnAvatar } from "@/lib/avatar";
import { boardsNavKey, usePermissions } from "@/lib/permissions";
import { usePathname, useRouter } from "@/i18n/navigation";
import LanguageSwitcher from "./language-switcher";
import ProfileDialog from "./profile-dialog";
import NotificationPopover, {
  type NotificationListStatus,
} from "@/components/notifications/notification-popover";
import {
  fetchNotificationCount,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationPage,
} from "@/lib/notifications-api";
import {
  broadcastNotificationRead,
  subscribeToNotificationReads,
  subscribeToNotifications,
} from "@/lib/notification-stream";

export const DRAWER_WIDTH = 240;

/** Rows pulled per request — the popover loads the next batch when the list end shows. */
const PAGE_SIZE = 20;
/**
 * Server-side cap on `limit` (`NotificationsService.list` clamps to 200). A
 * list longer than this cannot be refreshed without shrinking it, so the poll
 * skips the rows and only the badge keeps updating.
 */
const MAX_ROWS = 200;
const EMPTY_PAGE: NotificationPage = { items: [], page: 0, total: 0 };

/** The list's lifecycle: `idle` until the bell is opened for the first time. */
type ListStatus = NotificationListStatus;

/**
 * The badge travels alone: one shared `/notifications/count` request in flight
 * for the whole app, so StrictMode's second effect pass and a Navbar remount on
 * navigation join it instead of firing a duplicate. The inbox ROWS are loaded by
 * the same 10s poll below, so they are fresh even before the bell is opened.
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
  const tn = useTranslations("Notifications");
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { roleName } = usePermissions();
  const ownAvatar = useOwnAvatar();

  const routeTitleMap: Record<string, string> = {
    "/issues/new": "reportIssue",
    // master-data keeps its old title; account settings lives in a popup now
    "/master-data": "settings",
  };
  const routeTitleKey =
    routeTitleMap[pathname] ??
    (pathname.replace(/^\//, "").split("/")[0] || "dashboard");
  /**
   * หน้า `/boards` — เมื่อผู้ใช้เป็นบทบาทลูกค้า หัวข้อเปลี่ยนจาก "บอร์ด" เป็น
   * **"ประวัติการแจ้งปัญหา"** (ลูกค้าเห็นเฉพาะงานที่ตัวเองแจ้ง) — ใช้ helper
   * `boardsNavKey()` ตัวเดียวกับที่ sidebar เลือกเมนู ทั้งสองจุดจึงไม่มีทางเพี้ยนจากกัน
   */
  const titleKey = routeTitleKey === "boards" ? boardsNavKey(roleName) : routeTitleKey;

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  // one list: the inbox. The server sends only unread rows; reading one marks
  // it read in the DB and drops it from this list (the row itself is kept).
  const [inbox, setInbox] = useState<NotificationPage>(EMPTY_PAGE);
  // `idle` until the bell opens the first time — rows are not fetched on load
  const [listStatus, setListStatus] = useState<ListStatus>("idle");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  /** A load-more that failed shows a manual retry instead of freezing. */
  const [loadMoreBlocked, setLoadMoreBlocked] = useState(false);
  /** An empty page means "no more rows" — hide the button without offering retry. */
  const [loadMoreExhausted, setLoadMoreExhausted] = useState(false);
  const [bellAnchorEl, setBellAnchorEl] = useState<HTMLElement | null>(null);
  // account popup — opened from the navbar avatar or the bell's gear
  const [profileOpen, setProfileOpen] = useState(false);
  // polling and scroll-loading both need a fresh view of what is on screen
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;
  const loadingMoreRef = useRef(false);
  /**
   * Number of whole PAGE_SIZE pages already requested from page 1 — the ONLY
   * source for the next offset. Deriving it from `items.length` is what broke
   * scroll-loading: reading a row drops it locally and an SSE row is prepended,
   * so the count no longer matches the server's page boundaries.
   */
  const loadedPagesRef = useRef(1);
  /** Load-more has its own guard — the 10s refresh must not drop its response. */
  const moreSeqRef = useRef(0);
  const listSeqRef = useRef(0); // out-of-order guard for list refreshes
  const statusRef = useRef(listStatus);
  statusRef.current = listStatus;
  // Live SSE rows and the 10s poll both land in the same inbox — never count
  // or prepend an id twice.
  const seenRef = useRef<Set<number>>(new Set());
  // ids already read — a late/duplicate SSE frame must never resurrect a row
  const readRef = useRef<Set<number>>(new Set());
  /** Timestamp of the last wheel/touch scroll inside the bell list. */
  const listScrollRecentRef = useRef(0);
  const handleScrollActivity = useCallback(() => {
    // plain write — no setState, so firing on every scroll event is cheap
    listScrollRecentRef.current = Date.now();
  }, []);

  /** Badge refresh — cheap COUNT only, never the rows. */
  const refreshCount = useCallback(async () => {
    try {
      setUnreadCount(await loadCount());
    } catch {
      // keep the last known badge — the next poll retries
    }
  }, []);

  /**
   * Fetches the inbox — on the 10s poll, on mount, when the bell opens, or on
   * retry. The first load shows the spinner; later ones refresh silently. The
   * sequence ref drops a late response so an old page can never clobber a
   * newer one (the bug behind "badge 43, empty list").
   */
  const refreshList = useCallback(async (reset = false) => {
    const seq = (listSeqRef.current += 1);
    if (reset) {
      // Opening the bell is a fresh session: page 1 only. `statusRef` is set
      // synchronously so this call shows the spinner instead of stale rows.
      statusRef.current = "idle";
      loadedPagesRef.current = 1;
      listScrollRecentRef.current = 0;
      setLoadMoreBlocked(false);
      setLoadMoreExhausted(false);
    }
    const firstLoad = statusRef.current !== "ready";
    if (firstLoad) setListStatus("loading");
    try {
      // A list past the server's max cannot be refreshed without SHRINKING it
      // (which yanks the scroll position mid-read) — leave the rows alone; the
      // badge has its own COUNT on the same tick, and nothing else is stale.
      if (!reset && inboxRef.current.items.length > MAX_ROWS) return;
      // The user is scrolling right now — replacing `items` would yank the
      // list out from under them (and leave a blank area once it shrinks).
      // Badge is refreshed separately by refreshCount(), so it stays live.
      if (
        !reset &&
        statusRef.current === "ready" &&
        Date.now() - listScrollRecentRef.current < 5_000
      ) {
        return;
      }
      // Always ask for exactly PAGE_SIZE rows — a 2-page refresh used to send
      // `limit=40`, which the UI never asked for. Pages loaded by scrolling are
      // merged back below instead of being replaced.
      const res = await fetchNotifications(1, PAGE_SIZE);
      if (seq !== listSeqRef.current) return;
      // a successful first-page fetch clears a previous load-more error
      setLoadMoreBlocked(false);
      for (const n of res.data) seenRef.current.add(n.id);
      // a row the user just read can still be on the server while the mark-read
      // PATCH is in flight — never let a refresh or a late SSE frame resurrect it.
      // Keep rows from pages already scroll-loaded: drop only ids present in the
      // fresh first page, so order/fields come from the server with no duplicates.
      // On a bell-open reset there is nothing to keep — start from page 1 only.
      setInbox((prev) => {
        const fresh = res.data.filter((n) => !readRef.current.has(n.id));
        if (reset) return { items: fresh, page: res.page, total: res.total };
        const freshIds = new Set(res.data.map((n) => n.id));
        const kept = prev.items.filter(
          (n) => !freshIds.has(n.id) && !readRef.current.has(n.id),
        );
        return { items: [...fresh, ...kept], page: res.page, total: res.total };
      });
      // the badge must reflect the server count, not just the loaded rows
      setUnreadCount(res.unreadCount);
      setListStatus("ready");
    } catch {
      if (seq !== listSeqRef.current) return;
      // keep the last known list — the next poll retries
      if (firstLoad) setListStatus("error");
    }
  }, []);

  // poll every 10s: badge COUNT + the inbox rows — a safety net under the
  // real-time stream (covers a missed frame or a reconnect gap)
  useEffect(() => {
    void refreshCount();
    void refreshList();
    const timer = setInterval(() => {
      void refreshCount();
      void refreshList();
    }, 10_000);
    return () => clearInterval(timer);
  }, [refreshCount, refreshList]);

  // A live row lands in the bell and bumps the badge immediately, instead of
  // waiting for the next poll. The toast itself is owned by NotificationProvider.
  useEffect(
    () =>
      subscribeToNotifications((item) => {
        if (seenRef.current.has(item.id) || readRef.current.has(item.id)) return;
        seenRef.current.add(item.id);
        setInbox((prev) => ({
          ...prev,
          items: prev.items.some((n) => n.id === item.id) ? prev.items : [item, ...prev.items],
          total: Math.max(prev.total + 1, prev.items.length + 1),
        }));
        setUnreadCount((count) => count + 1);
      }),
    [],
  );

  // Toast clicks (root provider) and other open tabs share this hint, so the
  // badge and the rows agree without waiting ~10s for the next poll.
  useEffect(
    () =>
      subscribeToNotificationReads((id) => {
        if (id === "all") {
          setInbox(EMPTY_PAGE);
          setUnreadCount(0);
          loadedPagesRef.current = 1;
          setLoadMoreBlocked(false);
          setLoadMoreExhausted(false);
          return;
        }
        if (readRef.current.has(id)) return;
        readRef.current.add(id);
        setInbox((prev) => ({
          ...prev,
          items: prev.items.filter((n) => n.id !== id),
          total: Math.max(0, prev.total - 1),
        }));
        setUnreadCount((count) => Math.max(0, count - 1));
      }),
    [],
  );

  const handleOpenBell = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      setBellAnchorEl(event.currentTarget);
      // every open starts over at page 1 — previously loaded pages are discarded
      void refreshList(true);
    },
    [refreshList],
  );

  const handleLoadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    const current = inboxRef.current;
    if (current.items.length >= current.total) return;
    // The next offset comes from the pages actually requested — never from
    // `items.length`, which drifts when a row is read (deleted) or an SSE row
    // is prepended. That drift was why pagination stopped after one batch.
    const nextPage = loadedPagesRef.current + 1;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    // Own sequence guard: the 10s refresh increments listSeqRef and must not
    // be able to throw this response away mid-flight.
    const seq = (moreSeqRef.current += 1);
    try {
      const res = await fetchNotifications(nextPage, PAGE_SIZE);
      if (seq !== moreSeqRef.current) return;
      for (const n of res.data) seenRef.current.add(n.id);
      loadedPagesRef.current = nextPage;
      // Append only — never replace. Dedupe by id so an SSE row, or an offset
      // shifted by a row that was read, can never show up twice.
      setInbox((prev) => {
        const seen = new Set(prev.items.map((n) => n.id));
        const add = res.data.filter((n) => !seen.has(n.id) && !readRef.current.has(n.id));
        if (add.length === 0) return prev;
        return { items: [...prev.items, ...add], page: nextPage, total: res.total };
      });
      setUnreadCount(res.unreadCount);
      // Empty page = nothing left to fetch, so the button disappears. `sum`
      // is deliberately NOT used here: it counts archived (read) rows too.
      if (res.data.length === 0) setLoadMoreExhausted(true);
    } catch {
      if (seq !== moreSeqRef.current) return;
      setLoadMoreBlocked(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  /** Manual escape hatch when a page request fails. */
  const handleRetryLoadMore = useCallback(() => {
    setLoadMoreBlocked(false);
    void handleLoadMore();
  }, [handleLoadMore]);

  // reading = UPDATE in the DB (is_read/read_at) — the row vanishes from the
  // bell but stays stored. Drop it locally now; on failure resync from server.
  function handleMarkRead(id: number) {
    // one path for the bell row and the toast: the shared read listener drops
    // the row + badge here and in every other open tab
    broadcastNotificationRead(id);
    markNotificationRead(id).catch(() => {
      void refreshCount();
      if (statusRef.current === "ready") void refreshList();
    });
  }

  function handleMarkAllRead() {
    setInbox(EMPTY_PAGE);
    setUnreadCount(0);
    loadedPagesRef.current = 1;
    setLoadMoreBlocked(false);
    setLoadMoreExhausted(false);
    markAllNotificationsRead().catch(() => {
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
          {header ??
            (titleKey ? (
              <Typography variant="h6" fontWeight={700} color="text.primary">
                {t(titleKey)}
              </Typography>
            ) : null)}
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
            loadMoreError={loadMoreBlocked}
            loadMoreExhausted={loadMoreExhausted}
            onLoadMore={handleLoadMore}
            onRetryLoadMore={handleRetryLoadMore}
            onRetry={() => void refreshList()}
            onScrollActivity={handleScrollActivity}
            onClose={() => {
              listScrollRecentRef.current = 0;
              setBellAnchorEl(null);
            }}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
          />
          <LanguageSwitcher />
          {/* Account actions — no dropdown: the avatar opens the profile popup */}
          <IconButton
            onClick={() => setProfileOpen(true)}
            aria-label={t("profile")}
            title={t("profile")}
            size="small"
            sx={{ p: 0.5 }}
          >
            <Avatar
              src={ownAvatar ?? undefined}
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
          </IconButton>
          <IconButton
            onClick={handleLogout}
            aria-label={t("signOut")}
            title={t("signOut")}
            size="small"
          >
            <LogoutOutlinedIcon fontSize="small" />
          </IconButton>
          <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
        </Box>
      </Toolbar>
    </AppBar>
  );
}
