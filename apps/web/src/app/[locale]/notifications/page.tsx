"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { errorMessage } from "@/lib/api";
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
  /**
   * The heading's number comes from the SERVER's `total`, never `items.length`:
   * the list is one page capped at 200 rows (a busy admin holds hundreds) and
   * `items.length` only says how many rows THIS load brought back — so a page
   * opened once and left alone went stale while the navbar badge kept polling,
   * and the two numbers on screen disagreed ("heading 63, badge 70").
   */
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  /** Out-of-order guard — a late response can never clobber a newer one. */
  const seqRef = useRef(0);
  /** True once a load has succeeded — a background poll failure stays quiet. */
  const loadedRef = useRef(false);

  /**
   * Loads the inbox. The first load (mount / manual reload) shows the spinner;
   * every later refresh is silent so rows never blink under the reader.
   */
  const load = useCallback(
    async (showSpinner: boolean) => {
      const seq = (seqRef.current += 1);
      if (showSpinner) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetchNotifications(1, 200);
        if (seq !== seqRef.current) return;
        setItems(res.data);
        setTotal(res.total);
        loadedRef.current = true;
      } catch (err) {
        if (seq !== seqRef.current) return;
        // a failed background poll keeps the last known list — the next tick
        // retries; only a first load (nothing on screen yet) shows the error
        if (!loadedRef.current) setError(errorMessage(err, t("loadError")));
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    },
    [t],
  );

  // explicit loads only (mount + the Refresh button + a failed mark-read resync)
  useEffect(() => {
    void load(true);
  }, [reloadKey, load]);

  /**
   * Keeps the heading in step with the navbar badge: the same 30s cadence the
   * badge polls on, plus a refresh whenever the tab comes back into view.
   */
  useEffect(() => {
    const timer = setInterval(() => void load(false), 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  /** Optimistic — the row is gone for good; a failed call resyncs from the server. */
  function handleMarkRead(id: number) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
    deleteNotification(id).catch(() => setReloadKey((k) => k + 1));
  }

  function handleMarkAllRead() {
    setItems([]);
    setTotal(0);
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
    stale: t("actions.stale"),
    app_expiring: t("actions.app_expiring"),
    app_expired: t("actions.app_expired"),
    ma_depleted: t("actions.ma_depleted"),
    // แถวเตือน 09:00 ที่ DailyReminderService สร้างให้ (ไม่ใช่เหตุการณ์จริง)
    daily_digest: t("actions.daily_digest"),
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
          {total > 0 ? `${t("tabs.inbox")} (${total})` : t("tabs.inbox")}
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
              // แถวที่ระบบเป็นคนส่ง (ไม่มีคนกระทำ) — ขึ้นต้นด้วย "ชื่อแอป + บริษัท"
              // แทนคำว่า "System" แล้วตามด้วย label: **POS ครัวบ้านสวย** ใกล้หมดอายุ
              const isSystemRow =
                item.action === "app_expiring" ||
                item.action === "app_expired" ||
                item.action === "ma_depleted" ||
                // digest 09:00 ก็ไม่มีคนกระทำ — ขึ้นหัวด้วยจำนวนที่ค้าง
                item.action === "daily_digest" ||
                // การ์ดค้าง (sweep 09:00) ก็ไม่มีคนกระทำ — เดิมหลุดไปโหมด "มีคนกระทำ"
                // แล้วเจอ fallback ตายตัว "System" หัวบรรทัดจึงอ่านว่า "System ค้างนาน …"
                item.action === "stale";
              // stale มีประโยคของตัวเองบรรทัดเดียวครบ (sync กับ notification-popover.tsx):
              // **งาน ทดสอบ** ค้างที่สถานะ รอดำเนินการ · 7 วัน (context ไม่ซ้ำที่บรรทัดล่าง)
              const isStaleRow = item.action === "stale";
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
                      {initials(isSystemRow ? item.target : (item.actorName ?? "System"))}
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
                        {isStaleRow ? (
                          <>
                            <Box component="span" sx={{ fontWeight: 700 }}>
                              {item.target}
                            </Box>{" "}
                            {t("actions.stale")} {item.context}
                          </>
                        ) : isSystemRow ? (
                          <>
                            <Box component="span" sx={{ fontWeight: 700 }}>
                              {item.target}
                            </Box>{" "}
                            {actionLabels[item.action] ?? item.action}
                          </>
                        ) : (
                          <>
                            <Box component="span" sx={{ fontWeight: 700 }}>
                              {item.actorName ?? "System"}
                            </Box>{" "}
                            {actionLabels[item.action] ?? item.action}{" "}
                            <Box component="span" sx={{ fontWeight: 700 }}>
                              {item.target}
                            </Box>
                          </>
                        )}
                      </Typography>
                    }
                    secondary={
                      <Box
                        component="span"
                        sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          component="span"
                          sx={{
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {timeAgo(item.createdAt, locale)}
                          {/* stale ใช้ context บนบรรทัดหัวแล้ว — ห้ามพิมพ์ซ้ำ */}
                          {item.context && !isStaleRow ? ` • ${item.context}` : ""}
                        </Typography>
                        {/* chip ความสำคัญ (สูง/กลาง/ต่ำ) ถูกถอดออกตามคำสั่ง — ความสำคัญ
                            ยังคงบอกผ่านลำดับเรียง (สูงขึ้นก่อน) ฝั่ง server เท่านั้น */}
                      </Box>
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
