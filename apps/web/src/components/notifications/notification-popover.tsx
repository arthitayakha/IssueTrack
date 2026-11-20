"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "@mui/material/styles";
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  ListItemButton,
  Popover,
  Typography,
} from "@mui/material";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { useRouter } from "@/i18n/navigation";
import { timeAgo } from "@/lib/time-ago";
import { resolveLink } from "@/lib/notification-link";
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

/** Which of the three built-in sentences a row's title reads like. */
type RowVariant = "stale" | "system" | "actor";

interface NotificationRowProps {
  item: AppNotification;
  variant: RowVariant;
  /** `actionLabels[item.action] ?? item.action` — a plain, stable string. */
  label: string;
  /** `index > 0` — a divider belongs to the row below it. */
  divider: boolean;
  /** The popover's click handler — kept identical across renders (see openRow). */
  onOpen: (item: AppNotification) => void;
}

/**
 * แถวเดียวของ inbox — ห่อ `React.memo` เพราะ list re-render ทุกครั้งที่โหลดหน้า
 * ต่อ (`loadingMore` toggle) หรือ append แถวใหม่: ถ้าไม่มี memo แถว ~70 แถว
 * (sx object ใหม่ทุกแถว + `timeAgo()`) จะถูกสร้างใหม่บน main thread กลางตอน
 * กำลัง scroll → หลุดเฟรม = อาการ "กระตุก" ที่รายงานมา
 */
const NotificationRow = memo(function NotificationRow({
  item,
  variant,
  label,
  divider,
  onOpen,
}: NotificationRowProps) {
  const locale = useLocale();
  const handleClick = useCallback(() => onOpen(item), [onOpen, item]);
  const strike =
    item.action === "deleted"
      ? { color: "text.secondary", textDecoration: "line-through" }
      : {};
  return (
    <Box>
      {divider && <Divider />}
      <Box sx={{ display: "flex", alignItems: "stretch", "&:hover": { bgcolor: "action.hover" } }}>
        <ListItemButton
          onClick={handleClick}
          sx={{
            alignItems: "flex-start",
            gap: 1.5,
            px: 2,
            py: 1.5,
            flex: 1,
            minWidth: 0,
            // hover ถูกย้ายไปที่ Box รอบนอก (ปุ่มติดต่ออยู่ในแถวเดียวกัน)
            "&:hover, &.Mui-selected, &.Mui-selected:hover": { bgcolor: "transparent" },
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
          {getInitials(variant === "actor" ? item.actorName ?? "System" : item.target)}
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
            {variant === "stale" ? (
              <>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {item.target}
                </Box>{" "}
                {label} {item.context}
              </>
            ) : variant === "system" ? (
              <>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {item.target}
                </Box>{" "}
                {label}
              </>
            ) : (
              <>
                <Box component="span" sx={{ fontWeight: 700, ...strike }}>
                  {item.actorName ?? "System"}
                </Box>{" "}
                {label}{" "}
                <Box component="span" sx={{ fontWeight: 700, ...strike }}>
                  {item.target}
                </Box>
              </>
            )}
          </Typography>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              minWidth: 0,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {timeAgo(item.createdAt, locale)}
              {/* stale ใช้ context บนบรรทัดหัวแล้ว — ห้ามพิมพ์ซ้ำ */}
              {item.context && variant !== "stale" ? ` • ${item.context}` : ""}
            </Typography>
            {/* chip ความสำคัญ (สูง/กลาง/ต่ำ) ถูกถอดออกตามคำสั่ง — ความสำคัญ
                ยังคงบอกผ่านลำดับเรียง (สูงขึ้นก่อน) ฝั่ง server เท่านั้น */}
          </Box>
        </Box>
        </ListItemButton>
      </Box>
    </Box>
  );
});
NotificationRow.displayName = "NotificationRow";

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
    stale: t("actions.stale"),
    app_expiring: t("actions.app_expiring"),
    app_expired: t("actions.app_expired"),
    ma_depleted: t("actions.ma_depleted"),
    app_renewed: t("actions.app_renewed"),
    app_hours_purchased: t("actions.app_hours_purchased"),
    contact_message: t("actions.contact_message"),
    system_report_created: t("actions.system_report_created"),
  };

  /**
   * Handler อยู่หลัง ref: `openRow` คง identity เดียวตลอดแม้ `onMarkRead` /
   * `onClose` จะเป็น closure ใหม่ทุกครั้งที่ navbar render (ไม่งั้น row ที่ memo
   * ไว้จะ re-render หมดทุกแถว)
   */
  const rowHandlersRef = useRef({ onMarkRead, onClose, router });
  rowHandlersRef.current = { onMarkRead, onClose, router };

  /** กดแถว → อ่านแล้วลบแถว + ปิดกระดิ่ง + ไปตามลิงก์ของแถว (ทุกแถว behave เหมือนกัน) */
  const openRow = useCallback((item: AppNotification) => {
    const handlers = rowHandlersRef.current;
    handlers.onMarkRead(item.id);
    handlers.onClose();
    handlers.router.push(resolveLink(item));
  }, []);

  // Keep pulling pages until the list fills the box or runs out of rows.
  // A scroll heuristic never fires when a short batch leaves no scrollbar,
  // so watch a sentinel at the end of the list instead.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open || !hasMore || loadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      // เริ่มดึงหน้าถัดไป "ก่อน" ถึงท้าย ~300px — sentinel 1px ที่ปลายล่างสุด
      // เท่ากับรอจนกว่าจะถึงท้ายแล้วค่อยเริ่มรอ (จังหวะที่เห็นชัดว่า "ต้องรอ")
      { rootMargin: "300px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [open, hasMore, loadingMore, visibleItems.length, onLoadMore]);

  return (
    <>
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
      </Box>

      {/* List — first open shows a spinner, a failed load offers a retry */}
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          // ซ่อน scrollbar ของ Windows/macOS — เลื่อนด้วยล้อเมาส์/สัมผัสยังใช้ได้
          // (ตรงกับคอลัมน์บอร์ดใน boards/page.tsx)
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
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
            // แถวที่ระบบเป็นคนส่ง (ไม่มีคนกระทำ) — หัวข้อคือ "ชื่อแอป + บริษัท"
            // ขึ้นต้นด้วยสิ่งนั้นแทน "System" แล้วตามด้วย label:
            // **POS ครัวบ้านสวย** ใกล้หมดอายุ / **POS ครัวบ้านสวย** MA หมดแล้ว
            const isSystemRow =
              item.action === "app_expiring" ||
              item.action === "app_expired" ||
              item.action === "ma_depleted" ||
              // ใบยืนยันต่ออายุ/ซื้อชม. ก็ไม่มีคนกระทำ (ระบบเป็นคนส่ง)
              item.action === "app_renewed" ||
              item.action === "app_hours_purchased" ||
              // การ์ดค้าง (sweep 09:00) ก็ไม่มีคนกระทำ — เดิมหลุดไปโหมด "มีคนกระทำ"
              // แล้วเจอ fallback ตายตัว "System" หัวบรรทัดจึงอ่านว่า "System ค้างนาน …"
              item.action === "stale";
            // รายงานบั๊กจากศูนย์ช่วยเหลือ **ต้อง** โชว์โหมด "มีคนกระทำ" เพื่อให้
            // แอดมินเห็นชื่อผู้แจ้งในหัวข้อ (เป็น actor ของแถวนี้)
            // stale มีประโยคของตัวเองบรรทัดเดียวครบ:
            // **งาน ทดสอบ** ค้างที่สถานะ รอดำเนินการ · 7 วัน (context ไม่ซ้ำที่บรรทัดล่าง)
            const isStaleRow = item.action === "stale";
            // label ถูก derive ที่นี่ (string คงที่) เพื่อให้ row memo เทียบได้ —
            // object `actionLabels` ที่สร้างใหม่ทุก render ห้ามส่งเข้าไปใน row
            return (
              <NotificationRow
                key={item.id}
                item={item}
                variant={isStaleRow ? "stale" : isSystemRow ? "system" : "actor"}
                label={actionLabels[item.action] ?? item.action}
                divider={index > 0}
                onOpen={openRow}
              />
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
    </>
  );
}
