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
  clearNotifications,
  deleteNotification,
  fetchNotificationCount,
  fetchNotifications,
  type NotificationPage,
} from "@/lib/notifications-api";

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

  // one list: the inbox. Every row is unread, and reading one deletes it.
  const [inbox, setInbox] = useState<NotificationPage>(EMPTY_PAGE);
  // `idle` until the bell opens the first time — rows are not fetched on load
  const [listStatus, setListStatus] = useState<ListStatus>("idle");
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bellAnchorEl, setBellAnchorEl] = useState<HTMLElement | null>(null);
  // account popup — opened from the navbar avatar or the bell's gear
  const [profileOpen, setProfileOpen] = useState(false);

  // polling and scroll-loading both need a fresh view of what is on screen
  const inboxRef = useRef(inbox);
  inboxRef.current = inbox;
  const loadingMoreRef = useRef(false);
  /**
   * `items.length` of the last load-more that returned **nothing new** (rows
   * shifted under a new arrival). Retrying the same page would loop forever —
   * while the length matches this, the scroll-load waits for the list itself
   * to change (a read, or the next refresh, which resets it).
   */
  const stalledAtRef = useRef(-1);
  const listSeqRef = useRef(0); // out-of-order guard for list responses
  const statusRef = useRef(listStatus);
  statusRef.current = listStatus;

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
  const refreshList = useCallback(async () => {
    const seq = (listSeqRef.current += 1);
    const firstLoad = statusRef.current !== "ready";
    if (firstLoad) setListStatus("loading");
    try {
      // A list past the server's max cannot be refreshed without SHRINKING it
      // (which yanks the scroll position mid-read) — leave the rows alone; the
      // badge has its own COUNT on the same tick, and nothing else is stale.
      if (inboxRef.current.items.length > MAX_ROWS) return;
      // Page-aligned refresh: limit = a whole multiple of PAGE_SIZE covering
      // every row already on screen, so (1) the list never shrinks while the
      // user is reading it, and (2) every loaded batch stays a whole number of
      // pages — the next load-more can then ask for the page right after the
      // rows on screen instead of re-fetching pages it already has (the bug
      // behind "scroll ถึงท้ายแล้วไม่มีอะไรขึ้น ต้องรอรอบถัดไป").
      const pages = Math.max(1, Math.ceil(inboxRef.current.items.length / PAGE_SIZE));
      const res = await fetchNotifications(1, pages * PAGE_SIZE);
      if (seq !== listSeqRef.current) return;
      stalledAtRef.current = -1; // a fresh prefix un-stalls any stalled load-more
      setInbox({ items: res.data, page: res.page, total: res.total });
      // the badge must reflect the server count, not just the loaded rows
      setUnreadCount(res.unreadCount);
      setListStatus("ready");
    } catch {
      if (seq !== listSeqRef.current) return;
      // keep the last known list — the next poll retries
      if (firstLoad) setListStatus("error");
    }
  }, []);

  // poll every 10s: badge COUNT + the inbox rows, whether the bell is open or not
  useEffect(() => {
    void refreshCount();
    void refreshList();
    const timer = setInterval(() => {
      void refreshCount();
      void refreshList();
    }, 10_000);
    return () => clearInterval(timer);
  }, [refreshCount, refreshList]);

  const handleOpenBell = useCallback(
    (event: MouseEvent<HTMLElement>) => {
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
    // The next batch = the first page boundary AT/AFTER the rows on screen,
    // derived from `items.length` — never from a stored `page`. A refresh uses
    // a bigger (page-aligned) limit, so `page + 1` from its response would ask
    // for rows already on screen: the dedupe dropped them all, nothing
    // appeared, and the user had to wait for yet another round trip.
    const nextPage = Math.floor(current.items.length / PAGE_SIZE) + 1;
    // an empty page at this exact length already failed once — wait for a change
    if (stalledAtRef.current === current.items.length) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const seq = listSeqRef.current;
    try {
      const res = await fetchNotifications(nextPage, PAGE_SIZE);
      if (seq !== listSeqRef.current) return; // a refresh replaced the list meanwhile
      const seen = new Set(inboxRef.current.items.map((n) => n.id));
      const fresh = res.data.filter((n) => !seen.has(n.id));
      stalledAtRef.current = fresh.length > 0 ? -1 : inboxRef.current.items.length;
      setInbox((prev) => {
        // never show a row twice
        const seenNow = new Set(prev.items.map((n) => n.id));
        const add = fresh.filter((n) => !seenNow.has(n.id));
        return { items: [...prev.items, ...add], page: nextPage, total: res.total };
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
            onLoadMore={handleLoadMore}
            onRetry={() => void refreshList()}
            onClose={() => setBellAnchorEl(null)}
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
