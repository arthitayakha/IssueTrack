"use client";

import { useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "@mui/material/styles";
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  ListItemButton,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { useRouter } from "@/i18n/navigation";
import { timeAgo } from "@/lib/time-ago";
import type { AppNotification, NotificationPage } from "@/lib/notifications-api";

/** The list's lifecycle as tracked by the navbar (idle until the bell opens). */
export type NotificationListStatus = "idle" | "loading" | "ready" | "error";

interface NotificationPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  /** One page of the single inbox — every row is unread; clicking one deletes it. */
  data: NotificationPage;
  /** First-open state: `loading` shows a spinner, `error` offers a retry. */
  status: NotificationListStatus;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Retry after a failed first load. */
  onRetry: () => void;
  onClose: () => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
}

/**
 * Where a row opens: issue events deep-link straight to that card's detail
 * dialog (`/boards?issue=N`) — including old rows stored as "/issues", since
 * the API now sends `issueId` alongside the link. A deleted card sits in the
 * recycle bin, so it only opens the board (nothing to fetch).
 */
const FALLBACK_LINK = "/boards";

function resolveLink(item: AppNotification): string {
  if (item.action === "deleted") return FALLBACK_LINK;
  if (item.issueId) return `${FALLBACK_LINK}?issue=${item.issueId}`;
  const link = item.link;
  if (!link) return FALLBACK_LINK;
  if (link === "/issues" || link.startsWith("/issues?") || link.startsWith("/issues#")) {
    return FALLBACK_LINK;
  }
  return link;
}

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

export default function NotificationPopover({
  open,
  anchorEl,
  data,
  status,
  loadingMore,
  onLoadMore,
  onRetry,
  onClose,
  onMarkRead,
  onMarkAllRead,
}: NotificationPopoverProps) {
  const t = useTranslations("Notifications");
  const locale = useLocale();
  const theme = useTheme();
  const router = useRouter();

  // one inbox, one list — a row disappears the moment it is read
  const visibleItems = data.items;
  const hasMore = status === "ready" && visibleItems.length < data.total;
  const inboxLabel = t("tabs.inbox");
  const emptyTitle = t("emptyInbox.title");
  const emptyDescription = t("emptyInbox.description");

  const actionLabels: Record<string, string> = {
    created: t("actions.created"),
    assigned: t("actions.assigned"),
    unassigned: t("actions.unassigned"),
    commented: t("actions.commented"),
    moved: t("actions.moved"),
    // milestone columns speak for themselves instead of the plain "moved"
    needs_assignment: t("actions.needs_assignment"),
    status_pending: t("actions.status_pending"),
    in_progress: t("actions.in_progress"),
    completed: t("actions.completed"),
    edited: t("actions.edited"),
    deleted: t("actions.deleted"),
    restored: t("actions.restored"),
    rule_created: t("actions.rule_created"),
    rule_updated: t("actions.rule_updated"),
    rule_deleted: t("actions.rule_deleted"),
  };

  function handleItemClick(item: AppNotification) {
    onMarkRead(item.id);
    onClose();
    router.push(resolveLink(item));
  }

  // Keep pulling pages until the list fills the box or runs out of rows.
  // A scroll heuristic never fires when a short batch leaves no scrollbar,
  // so watch a sentinel at the end of the list instead.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || !hasMore || loadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, hasMore, loadingMore, visibleItems.length, onLoadMore]);

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
            // fixed height so every tab (list or empty state) looks identical
            height: { xs: "70vh", sm: "72vh" },
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
          disabled={data.total === 0}
          sx={{
            p: 0,
            border: "none",
            bgcolor: "transparent",
            cursor: data.total > 0 ? "pointer" : "default",
            fontFamily: "inherit",
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: data.total > 0 ? "primary.main" : "text.disabled",
            "&:hover": data.total > 0 ? { textDecoration: "underline" } : {},
          }}
        >
          {t("markRead")}
        </Box>
      </Box>

      {/* The only tab left: the inbox (read rows are gone, so there is nothing else to show) */}
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
        <Box
          component="span"
          aria-current="page"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.75,
            p: 0,
            pt: 1,
            pb: 0.75,
            borderBottom: "2px solid",
            borderColor: "primary.main",
            fontSize: "0.8125rem",
            fontWeight: 700,
            color: "text.primary",
          }}
        >
          {inboxLabel}
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
              bgcolor: "primary.main",
              color: "primary.contrastText",
            }}
          >
            {status === "loading" ? "\u2026" : data.total}
          </Box>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Tooltip title={t("settings")}>
          <IconButton size="small" onClick={() => router.push("/settings")} sx={{ mb: 0.5 }}>
            <SettingsOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* List — first open shows a spinner, a failed load offers a retry */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          // spinner / error / empty state all fill the same box as the list
          ...(visibleItems.length === 0
            ? { display: "flex", flexDirection: "column", justifyContent: "center" }
            : {}),
        }}
      >
        {status === "loading" ? (
          <Box aria-label={t("loading")} sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        ) : status === "error" ? (
          <Box sx={{ px: 3, py: 5, textAlign: "center" }}>
            <NotificationsNoneIcon sx={{ fontSize: 36, color: "text.disabled", mb: 1 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t("loadError")}
            </Typography>
            <Button size="small" onClick={onRetry} sx={{ mt: 1.5 }}>
              {t("retry")}
            </Button>
          </Box>
        ) : visibleItems.length === 0 ? (
          <Box sx={{ px: 3, py: 5, textAlign: "center" }}>
            <NotificationsNoneIcon sx={{ fontSize: 36, color: "text.disabled", mb: 1 }} />
            <Typography variant="subtitle2" color="text.primary" fontWeight={600}>
              {emptyTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {emptyDescription}
            </Typography>
          </Box>
        ) : (
          visibleItems.map((item, index) => {
            return (
              <Box key={item.id}>
                {index > 0 && <Divider />}
                <ListItemButton
                  onClick={() => handleItemClick(item)}
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
                    {getInitials(item.actorName ?? "System")}
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
                      <Box
                        component="span"
                        sx={{
                          fontWeight: 700,
                          ...(item.action === "deleted"
                            ? { color: "text.secondary", textDecoration: "line-through" }
                            : {}),
                        }}
                      >
                        {item.actorName ?? "System"}
                      </Box>{" "}
                      {actionLabels[item.action] ?? item.action}{" "}
                      <Box
                        component="span"
                        sx={{
                          fontWeight: 700,
                          ...(item.action === "deleted"
                            ? { color: "text.secondary", textDecoration: "line-through" }
                            : {}),
                        }}
                      >
                        {item.target}
                      </Box>
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                      {timeAgo(item.createdAt, locale)}
                      {item.context ? ` • ${item.context}` : ""}
                    </Typography>
                  </Box>
                </ListItemButton>
              </Box>
            );
          })
        )}
        {/* Sentinel: while it stays visible the next page keeps loading */}
        {hasMore && <Box ref={sentinelRef} aria-hidden sx={{ height: 1 }} />}
        {loadingMore && (
          <Box
            aria-label={t("loading")}
            sx={{ display: "flex", justifyContent: "center", py: 1.5 }}
          >
            <CircularProgress size={20} />
          </Box>
        )}
      </Box>
    </Popover>
  );
}
