"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@mui/material";
import {
  Alert,
  Avatar,
  Breadcrumbs,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Link as MuiLink,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from "@mui/material";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DoneAllOutlinedIcon from "@mui/icons-material/DoneAllOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useLocale, useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import { Link } from "@/i18n/navigation";
import {
  archiveNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationTab,
} from "@/lib/notifications-api";
import { timeAgo } from "@/lib/time-ago";

const TABS: NotificationTab[] = ["inbox", "general", "archived"];

/** Same rule the bell popover uses: inbox = unread, general = read, archived = archived. */
function matchesTab(item: AppNotification, tab: NotificationTab): boolean {
  if (tab === "archived") return item.isArchived;
  if (item.isArchived) return false;
  return tab === "inbox" ? !item.isRead : item.isRead;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * The full notification inbox — same data and actions as the navbar bell,
 * just with room for all three tabs and the complete list.
 */
export default function NotificationsPage() {
  const t = useTranslations("Notifications");
  const theme = useTheme();
  const locale = useLocale();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [tab, setTab] = useState<NotificationTab>("inbox");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchNotifications(200);
        if (!cancelled) setItems(res.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t("loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const visible = items.filter((item) => matchesTab(item, tab));
  const counts: Record<NotificationTab, number> = {
    inbox: items.filter((item) => matchesTab(item, "inbox")).length,
    general: items.filter((item) => matchesTab(item, "general")).length,
    archived: items.filter((item) => matchesTab(item, "archived")).length,
  };

  /** Optimistic update; a failed call resyncs from the server. */
  function handleMarkRead(id: number) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    markNotificationRead(id).catch(() => setReloadKey((k) => k + 1));
  }

  function handleMarkAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    markAllNotificationsRead().catch(() => setReloadKey((k) => k + 1));
  }

  function handleArchive(id: number) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isArchived: true } : n)));
    archiveNotification(id).catch(() => setReloadKey((k) => k + 1));
  }

  const actionLabels: Record<string, string> = {
    created: t("actions.created"),
    assigned: t("actions.assigned"),
    commented: t("actions.commented"),
    moved: t("actions.moved"),
    edited: t("actions.edited"),
    deleted: t("actions.deleted"),
    restored: t("actions.restored"),
    rule_created: t("actions.rule_created"),
    rule_updated: t("actions.rule_updated"),
  };

  const emptyContent: Record<NotificationTab, { title: string; description: string }> = {
    inbox: { title: t("emptyInbox.title"), description: t("emptyInbox.description") },
    general: { title: t("emptyGeneral.title"), description: t("emptyGeneral.description") },
    archived: { title: t("emptyArchived.title"), description: t("emptyArchived.description") },
  };

  const header = (
    <Breadcrumbs aria-label="notifications" separator="/">
      <MuiLink component={Link} href="/" underline="hover" color="inherit">
        {t("title")}
      </MuiLink>
      <Typography color="text.primary" fontWeight={600}>
        {t(`tabs.${tab}`)}
      </Typography>
    </Breadcrumbs>
  );

  return (
    <DashboardLayout header={header}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={700} sx={{ color: theme.palette.navy.main }}>
          {t("title")}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t("subtitle")}
        </Typography>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v as NotificationTab)}>
          {TABS.map((key) => (
            <Tab
              key={key}
              value={key}
              label={
                counts[key] > 0 ? `${t(`tabs.${key}`)} (${counts[key]})` : t(`tabs.${key}`)
              }
            />
          ))}
        </Tabs>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<DoneAllOutlinedIcon />}
            disabled={counts.inbox === 0}
            onClick={handleMarkAllRead}
          >
            {t("markRead")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => setReloadKey((k) => k + 1)}
          >
            {t("refresh")}
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => setReloadKey((k) => k + 1)}>
              {t("loadError")}
            </Button>
          }
        >
          <Typography>{error}</Typography>
        </Alert>
      ) : visible.length === 0 ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <NotificationsNoneIcon sx={{ fontSize: 48, color: "text.disabled" }} />
          <Typography variant="h6" fontWeight={700} sx={{ color: theme.palette.navy.main, mt: 1 }}>
            {emptyContent[tab].title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {emptyContent[tab].description}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            bgcolor: "background.paper",
            overflow: "hidden",
          }}
        >
          <List disablePadding>
            {visible.map((item) => {
              const stricken = item.action === "deleted";
              return (
                <ListItem
                  key={item.id}
                  divider
                  sx={{
                    bgcolor: item.isRead || item.isArchived ? "background.paper" : "action.hover",
                  }}
                  secondaryAction={
                    <Box sx={{ display: "flex", gap: 0.5 }}>
                      {!item.isRead && !item.isArchived && (
                        <Tooltip title={t("markRead")}>
                          <IconButton size="small" onClick={() => handleMarkRead(item.id)}>
                            <DoneAllOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!item.isArchived && (
                        <Tooltip title={t("archive")}>
                          <IconButton size="small" onClick={() => handleArchive(item.id)}>
                            <ArchiveOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  }
                >
                  <ListItemAvatar sx={{ minWidth: 48 }}>
                    <Avatar
                      sx={{
                        width: 36,
                        height: 36,
                        bgcolor: item.isRead || item.isArchived ? "grey.300" : "primary.main",
                        fontSize: "0.875rem",
                      }}
                    >
                      {initials(item.actorName ?? "System")}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: item.isRead ? 400 : 700,
                          color: stricken ? "text.secondary" : "text.primary",
                          textDecoration: stricken ? "line-through" : "none",
                        }}
                      >
                        <Box component="span" sx={{ fontWeight: 700 }}>
                          {item.actorName ?? "System"}
                        </Box>{" "}
                        {actionLabels[item.action] ?? item.action}{" "}
                        <Box component="span" sx={{ fontWeight: 700 }}>
                          {item.target}
                        </Box>
                      </Typography>
                    }
                    secondary={
                      <Typography variant="caption" color="text.secondary" component="span">
                        {timeAgo(item.createdAt, locale)}
                        {item.context ? ` • ${item.context}` : ""}
                        {!item.isRead && !item.isArchived && (
                          <Chip
                            size="small"
                            color="primary"
                            label={t("unread")}
                            sx={{ height: 18, fontSize: 10, ml: 1, fontWeight: 700 }}
                          />
                        )}
                      </Typography>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        </Box>
      )}
    </DashboardLayout>
  );
}
