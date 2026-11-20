import type { AppNotification } from "./notifications-api";

/** Where a non-contact row used to open (kept for the future toast / deep links). */
export const FALLBACK_LINK = "/boards";

/**
 * แปลงแถวแจ้งเตือน → ลิงก์ปลายทาง — อยู่ที่เดียวเพื่อให้กล่องเข้า / toast
 * (และโค้ดอื่น ๆ ในอนาคต) ไม่เพี้ยนจากกัน โดยเฉพาะแถวสัญญาเดิมที่ถูก backfill
 */
export function resolveLink(item: AppNotification): string {
  if (item.action === "deleted") return FALLBACK_LINK;
  if (item.issueId) return `${FALLBACK_LINK}?issue=${item.issueId}`;
  // แถวสัญญาที่สร้างก่อน migration 1838 ยังเก็บ `/systems` ธรรมดาไว้ใน link —
  // ถ้ามี appId/companyId ให้ rebuild deep-link จาก id เสมอ
  if (item.appId && item.companyId) {
    return `/systems?app=${item.appId}&company=${item.companyId}`;
  }
  const link = item.link;
  if (!link) return FALLBACK_LINK;
  if (link === "/issues" || link.startsWith("/issues?") || link.startsWith("/issues#")) {
    return FALLBACK_LINK;
  }
  return link;
}
