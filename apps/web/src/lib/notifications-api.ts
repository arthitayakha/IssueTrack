"use client";

import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";

/** Tab mapping: inbox = unread, general = read, archived = archived. */
export type NotificationTab = "inbox" | "general" | "archived";

export type NotificationAction =
  | "created"
  | "assigned"
  | "commented"
  | "moved"
  | "edited"
  | "deleted"
  | "restored";

export interface AppNotification {
  id: number;
  actorName: string | null;
  /** Raw action string from the API — unknown values fall back to plain text. */
  action: string;
  target: string;
  context: string | null;
  link: string | null;
  /** Card behind the notification — used to rebuild deep links for old rows. */
  issueId: number | null;
  createdAt: string;
  isRead: boolean;
  isArchived: boolean;
}

/** Total rows per tab over the whole account — drives the tab badges. */
export type NotificationCounts = Record<NotificationTab, number>;

/** One page of one tab; `total` is the full count for that tab. */
export interface NotificationPage {
  items: AppNotification[];
  page: number;
  total: number;
}

export interface NotificationListResponse {
  data: AppNotification[];
  page: number;
  limit: number;
  total: number;
  unreadCount: number;
  counts: NotificationCounts;
}

function getToken(): string | null {
  return useAuthStore.getState().token;
}

/**
 * Loads a single page of one tab (5 rows by default — the popover scroll-loads
 * the rest). Omit `tab` to get every row unfiltered.
 */
export async function fetchNotifications(
  page = 1,
  limit = 5,
  tab?: NotificationTab,
): Promise<NotificationListResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (tab) params.set("tab", tab);
  return apiFetch<NotificationListResponse>(`/notifications?${params.toString()}`, {}, getToken());
}

export async function markNotificationRead(id: number): Promise<AppNotification | null> {
  return apiFetch<AppNotification | null>(`/notifications/${id}/read`, {
    method: "PATCH",
  }, getToken());
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>("/notifications/read-all", {
    method: "POST",
  }, getToken());
}

export async function archiveNotification(id: number): Promise<AppNotification | null> {
  return apiFetch<AppNotification | null>(`/notifications/${id}/archive`, {
    method: "PATCH",
  }, getToken());
}
