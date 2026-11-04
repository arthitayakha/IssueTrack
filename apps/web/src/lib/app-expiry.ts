/**
 * กฎอายุแอป **ฝั่ง client** — ทุกอย่างในไฟล์นี้เป็น pure function ไม่แตะ API
 * ใช้ร่วมกันโดยฟอร์มเพิ่ม/แก้ไขแอป (`AppFormDialog`) และตารางละเอียดหน้า
 * `/systems` — เก็บไว้ที่เดียวเพื่อไม่ให้สองหน้าคำนวณสถานะต่างกัน
 */

/** สถานะอายุทั้ง 5 — ต้องตรงกับ `AppExpiryStatus` ฝั่งเซิร์ฟเวอร์ */
export type ExpiryStatus = "none" | "normal" | "expiring_soon" | "critical" | "expired";

/** key ใน namespace `Settings` สำหรับ label ของแต่ละสถานะ */
export type ExpiryLabelKey =
  | "expiryNone"
  | "expiryNormal"
  | "expiryExpiringSoon"
  | "expiryCritical"
  | "expiryExpired";

/**
 * ต้องตรงกับ `EXPIRY_WARNING_DAYS` / `EXPIRY_CRITICAL_DAYS` ใน
 * `AppExpiryService` — ค่าสองตัวนี้ถูกจำลองฝั่ง client เพื่อให้ chip ใน
 * ฟอร์มอัปเดตทันทีที่ผู้ใช้เลือกวันที่ (ฝั่งเซิร์ฟเวอร์ยังเป็นคนตัวจริง)
 */
export const EXPIRY_WARNING_DAYS = 30;
export const EXPIRY_CRITICAL_DAYS = 7;

/** วันนี้แบบ local (Y/M/D) — กันไม่ให้เลื่อนวันผิดฝั่งเหมือนฝั่งเซิร์ฟเวอร์ */
export function todayLocalIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * วันที่เหลือจากวันนี้ (local) ถึง `value` — `null` = ไม่ได้กรอกวันที่
 * ตัวเลขเดียวกับที่เซิร์ฟเวอร์ใช้ตัดสินสถานะและเขียนในข้อความแจ้งเตือน
 */
export function daysLeftIso(value: string): number | null {
  if (!value) return null;
  return Math.round(
    (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${todayLocalIso()}T00:00:00Z`)) /
      86_400_000,
  );
}

/**
 * สถานะอายุจากวันที่ในฟอร์ม — กฎเดียวกับเซิร์ฟเวอร์ (นับวันตามปฏิทิน):
 * ไม่มีวันที่ → ไม่กำหนด · ติดลบ → หมดอายุ · ≤7 → วิกฤต · ≤30 → ใกล้หมดอายุ
 */
export function previewExpiryStatus(expiresAt: string): ExpiryStatus {
  const left = daysLeftIso(expiresAt);
  if (left === null) return "none";
  if (left < 0) return "expired";
  if (left <= EXPIRY_CRITICAL_DAYS) return "critical";
  if (left <= EXPIRY_WARNING_DAYS) return "expiring_soon";
  return "normal";
}

/** key ของ label — เรียกเป็น `t(expiryLabelKey(status))` เพื่อไม่ผูกกับ namespace */
export function expiryLabelKey(status: ExpiryStatus): ExpiryLabelKey {
  switch (status) {
    case "expiring_soon":
      return "expiryExpiringSoon";
    case "critical":
      return "expiryCritical";
    case "expired":
      return "expiryExpired";
    case "normal":
      return "expiryNormal";
    default:
      return "expiryNone";
  }
}

/** สีของ chip สถานะอายุ — เขียว→น้ำเงิน→ส้ม→แดง (ไล่ตามความรุนแรง) */
export function expiryColor(
  status: ExpiryStatus,
): "default" | "info" | "success" | "warning" | "error" {
  switch (status) {
    case "expiring_soon":
      return "info";
    case "critical":
      return "warning";
    case "expired":
      return "error";
    case "normal":
      return "success";
    default:
      return "default";
  }
}

/**
 * `2026-12-04` (a DATE column) or an ISO datetime → `4 ธ.ค. 2026`. A bare date
 * is parsed as *local* midnight so it never slides back a day in UTC+7, the
 * same rule the API uses when it formats `app_companies.expires_at`.
 */
export function formatDay(value: string, locale: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
