"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@mui/material";
import {
  Alert,
  Avatar,
  Breadcrumbs,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Link as MuiLink,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Tooltip,
  Typography,
} from "@mui/material";
import DoneAllOutlinedIcon from "@mui/icons-material/DoneAllOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useLocale, useTranslations } from "next-intl";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import { Link } from "@/i18n/navigation";
import {
  clearNotifications,
  deleteNotification,
  fetchNotifications,
  type AppNotification,
} from "@/lib/notifications-api";
import { timeAgo } from "@/lib/time-ago";

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
 * The full notification inbox — same data and actions as the navbar bell.
 * There is only one list: reading a row deletes it, so nothing ever moves to
 * a "read" or "archived" tab (those tabs are gone).
 */
export default function NotificationsPage() {
  const t = useTranslations("Notifications");
  const theme = useTheme();
  const locale = useLocale();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchNotifications(1, 200);
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

  /** Optimistic — the row is gone for good; a failed call resyncs from the server. */
  function handleMarkRead(id: number) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    deleteNotification(id).catch(() => setReloadKey((k) => k + 1));
  }

  function handleMarkAllRead() {
    setItems([]);
    clearNotifications().catch(() => setReloadKey((k) => k + 1));
  }

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

  const header = (
    <Breadcrumbs aria-label="notifications" separator="/">
      <MuiLink component={Link} href="/" underline="hover" color="inherit">
        {t("title")}
      </MuiLink>
      <Typography color="text.primary" fontWeight={600}>
        {t("tabs.inbox")}
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
        <Typography variant="subtitle1" fontWeight={700}>
          {items.length > 0 ? `${t("tabs.inbox")} (${items.length})` : t("tabs.inbox")}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<DoneAllOutlinedIcon />}
            disabled={items.length === 0}
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
      ) : items.length === 0 ? (
        <Box sx={{ py: 8, textAlign: "center" }}>
          <NotificationsNoneIcon sx={{ fontSize: 48, color: "text.disabled" }} />
          <Typography variant="h6" fontWeight={700} sx={{ color: theme.palette.navy.main, mt: 1 }}>
            {t("emptyInbox.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {t("emptyInbox.description")}
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
            {items.map((item) => {
              const stricken = item.action === "deleted";
              return (
                <ListItem
                  key={item.id}
                  divider
                  sx={{ bgcolor: "action.hover" }}
                  secondaryAction={
                    <Tooltip title={t("markRead")}>
                      <IconButton size="small" onClick={() => handleMarkRead(item.id)}>
                        <DoneAllOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <ListItemAvatar sx={{ minWidth: 48 }}>
                    <Avatar
                      sx={{
                        width: 36,
                        height: 36,
                        bgcolor: "primary.main",
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
                          fontWeight: 700,
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
