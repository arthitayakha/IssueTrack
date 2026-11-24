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
  | "rule_deleted"
  // a card sat past a board-policy rule's days (daily 09:00 sweep)
  | "stale"
  // system rows the API can also send (not in every older payload)
  | "app_expiring"
  | "app_expired"
  | "ma_depleted";

/**
 * ความสำคัญ — chip สี (แดง/เหลือง/เทา) + ลำดับในกล่องเข้า (สูงก่อน)
 */
export type NotificationPriority = "high" | "medium" | "low";

/** ช่องทางติดต่อลูกค้าของบริษัท — แนบมาในแถวแจ้งเตือน (เฉพาะคนมี `user.view`) */
export interface ContractContact {
  userId: number;
  name: string;
  email: string | null;
  phone: string | null;
}

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
  /** คู่สัญญาที่แจ้งเตือนพูดถึง — ใช้ deep-link ไปแถวนั้นใน `/systems` */
  appId: number | null;
  companyId: number | null;
  /**
   * รายชื่อ "ฝ่ายตรงข้าม": แอดมินเห็นลูกค้าของบริษัทในแถว ·
   * ลูกค้า/สตาฟฟ์เห็นแอดมินที่ active (แนบทุกแถว)
   */
  contacts: ContractContact[];
  createdAt: string;
  /** ระดับของแถว — chip สี + ลำดับเรียง + หน้าต่างเตือน (เซิร์ฟเวอร์ส่งมาเสมอ) */
  priority: NotificationPriority;
  /** อ่านแล้ว — แถวที่อ่านแล้วจะไม่ถูกส่งกลับจาก `GET /notifications` */
  isRead: boolean;
  /** เวลาที่กดอ่าน (เก็บไว้ใน DB แม้แถวหายจากกระดิ่ง) */
  readAt: string | null;
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
  /** ยอดแถวยังไม่อ่าน (badge) — แถวที่อ่านแล้วอยู่ใน DB แต่ไม่ถูกส่งมาใน `data` */
  unreadCount: number;
  /** ยอดแถวยังไม่อ่าน — ตัวเดียวกับ `unreadCount`/badge (ไม่รวมแถวที่อ่านแล้ว) */
  sum: number;
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

/**
 * ประวัติที่อ่านแล้ว — แถวที่กดอ่านแล้วไม่หายจาก DB แต่ไม่โชว์ในกล่องเข้า
 * (endpoint นี้เป็นทางเดียวที่จะดึงแถวนั้นกลับมาได้) · response shape เดียวกับ
 * `fetchNotifications` · ยังไม่มี UI เรียกใช้
 */
export async function fetchReadNotifications(
  page = 1,
  limit = 20,
): Promise<NotificationListResponse> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return apiFetch<NotificationListResponse>(
    `/notifications/read?${params.toString()}`,
    {},
    getToken(),
  );
}

/** ลูกค้าทั้งหมด (active) — ใช้ตอนกด "ติดต่อลูกค้า" บน navbar ของแอดมิน */
export async function fetchAllCustomerContacts(): Promise<ContractContact[]> {
  return apiFetch<ContractContact[]>("/notifications/customer-contacts", {}, getToken());
}

/**
 * ผู้ติดต่อของแอดมิน — ใช้ตอนกด "ติดต่อแอดมิน" บน `/systems` ในบัญชีลูกค้า
 * (กล่องเข้าได้รายชื่อนี้แนบมาในแถวอยู่แล้ว ไม่ต้องยิงซ้ำ) · ไม่ต้อง `user.view`
 */
export async function fetchAdminContacts(): Promise<ContractContact[]> {
  return apiFetch<ContractContact[]>("/notifications/admin-contacts", {}, getToken());
}

/**
 * ผู้ติดต่อของบริษัท — ใช้ตอนกดปุ่ม "ติดต่อลูกค้า" ในป๊อปอัพสัญญาบน `/systems`
 * (กล่องเข้าได้ข้อมูลนี้แนบมาในแถวอยู่แล้ว ไม่ต้องยิงซ้ำ) · กันด้วย `user.view`
 */
export async function fetchCompanyContacts(companyId: number): Promise<ContractContact[]> {
  return apiFetch<ContractContact[]>(
    `/notifications/contacts?companyId=${companyId}`,
    {},
    getToken(),
  );
}

/**
 * กด "แจ้งเตือน..." จากป๊อปอัพสัญญา — สร้างแถวในกล่องเข้า + ส่งอีเมลให้ฝ่ายตรงข้าม
 * (ฝั่งเซิร์ฟเวอร์เป็นคนกำหนดผู้รับจากสิทธิ์ + คู่สัญญา — ห้ามส่ง userId มาเอง)
 */
export async function sendContactMessage(input: {
  message: string;
  appId: number;
  companyId: number;
  appName: string;
  companyName: string;
}): Promise<{ sent: number }> {
  return apiFetch<{ sent: number }>(
    "/notifications/contact",
    { method: "POST", body: JSON.stringify(input) },
    getToken(),
  );
}

/**
 * กดอ่าน = UPDATE ใน DB (แถวหายจากกระดิ่งแต่ยังเก็บอยู่) — ไม่ใช่ DELETE
 * คนละคนกับแถวจะได้ `null` กลับมา
 */
export async function markNotificationRead(
  id: number,
): Promise<{ read: boolean; id: number } | null> {
  return apiFetch<{ read: boolean; id: number } | null>(
    `/notifications/${id}/read`,
    { method: "PATCH" },
    getToken(),
  );
}

/** ปุ่ม "ทำเครื่องหมายว่าอ่านแล้ว" — mark ทุกแถวที่ยังไม่อ่าน (ไม่ลบข้อมูล) */
export async function markAllNotificationsRead(): Promise<{ read: number }> {
  return apiFetch<{ read: number }>(
    "/notifications/read-all",
    { method: "PATCH" },
    getToken(),
  );
}

/** ลบถาวร — ใช้ทำความสะอาดเท่านั้น (ปกติการกดอ่านใช้ `markNotificationRead`) */
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
