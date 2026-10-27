/**
 * Placeholder notification data for the bell dropdown (UI-only iteration).
 * Swap this for `apiFetch("/notifications?...")` once the backend exists.
 */

export type NotificationTab = "inbox" | "general" | "archived";

export type NotificationAction = "created" | "assigned" | "commented" | "moved" | "edited";

export interface AppNotification {
  id: number;
  actorName: string;
  action: NotificationAction;
  target: string;
  context: string;
  createdAt: string;
  isRead: boolean;
  isArchived: boolean;
}

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 1,
    actorName: "James",
    action: "assigned",
    target: "ปรับปรุงหน้าเข้าสู่ระบบ",
    context: "Kanban Tracker",
    createdAt: minutesAgo(36),
    isRead: false,
    isArchived: false,
  },
  {
    id: 2,
    actorName: "Aom",
    action: "commented",
    target: "บั๊กปุ่มบันทึกไม่ทำงาน",
    context: "Bug Fix",
    createdAt: minutesAgo(120),
    isRead: false,
    isArchived: false,
  },
  {
    id: 3,
    actorName: "Mary",
    action: "created",
    target: "รายงานประจำสัปดาห์",
    context: "Reporting",
    createdAt: minutesAgo(180),
    isRead: true,
    isArchived: false,
  },
  {
    id: 4,
    actorName: "Dima Phizig",
    action: "moved",
    target: "เพิ่มปุ่มส่งออก CSV",
    context: "Reporting",
    createdAt: minutesAgo(185),
    isRead: true,
    isArchived: false,
  },
  {
    id: 5,
    actorName: "Polly",
    action: "edited",
    target: "หน้า Landing Page",
    context: "Mobile App",
    createdAt: minutesAgo(600),
    isRead: true,
    isArchived: false,
  },
  {
    id: 6,
    actorName: "Arthitaya",
    action: "commented",
    target: "คำถามเรื่องสิทธิ์การเข้าถึง",
    context: "Permissions",
    createdAt: minutesAgo(1_440),
    isRead: true,
    isArchived: true,
  },
];
