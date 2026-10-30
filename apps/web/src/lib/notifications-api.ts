"use client";

import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";

export type NotificationAction =
  | "created"
  | "assigned"
  | "unassigned"
  | "commented"
  | "moved"
  // milestone columns — the board renames them, the API sends these types
  | "needs_assignment"
  | "status_pending"
  | "in_progress"
  | "completed"
  | "edited"
  | "deleted"
  | "restored"
  | "rule_created"
  | "rule_updated"
  | "rule_deleted";

export interface AppNotification {
  id: number;
  /** Joined from `users` at read time — null when the actor account is gone. */
  actorName: string | null;
  /** Raw action string from the API — unknown values fall back to plain text. */
  action: string;
  target: string;
  context: string | null;
  link: string | null;
  /** Card behind the notification — used to rebuild deep links for old rows. */
  issueId: number | null;
  createdAt: string;
}

/** One page of the single inbox — every stored row is unread. */
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
  /** Whole-account total — reading a row deletes it, so this is the badge. */
  unreadCount: number;
}

function getToken(): string | null {
  return useAuthStore.getState().token;
}

/**
 * The badge number only — a tiny COUNT the navbar polls every 30s, so a page
 * load never pulls the inbox rows (those load when the bell is opened).
 */
export async function fetchNotificationCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/notifications/count", {}, getToken());
}

/**
 * Loads a single page of the inbox (5 rows by default — the popover scroll-loads
 * the rest). Called when the bell is opened, not on page load.
 */
export async function fetchNotifications(
  page = 1,
  limit = 5,
): Promise<NotificationListResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiFetch<NotificationListResponse>(`/notifications?${params.toString()}`, {}, getToken());
}

/** Reading a notification deletes it — it never comes back. */
export async function deleteNotification(
  id: number,
): Promise<{ deleted: boolean } | null> {
  return apiFetch<{ deleted: boolean } | null>(`/notifications/${id}`, {
    method: "DELETE",
  }, getToken());
}

/** The inbox header button — clears every unread row of this account. */
export async function clearNotifications(): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>("/notifications", {
    method: "DELETE",
  }, getToken());
}
