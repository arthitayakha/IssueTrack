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
  createdAt: string;
  isRead: boolean;
  isArchived: boolean;
}

export interface NotificationListResponse {
  data: AppNotification[];
  unreadCount: number;
}

function getToken(): string | null {
  return useAuthStore.getState().token;
}

export async function fetchNotifications(limit = 50): Promise<NotificationListResponse> {
  return apiFetch<NotificationListResponse>(`/notifications?limit=${limit}`, {}, getToken());
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
