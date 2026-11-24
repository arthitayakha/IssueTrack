"use client";

import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";
import type { ContractContact } from "./notifications-api";

/**
 * ข้อมูลติดต่อที่ลูกค้าเห็น
 * - `contacts` = โปรแกรมเมอร์ที่ลูกค้าบริษัทนี้เห็น (mapping เฉพาะบริษัทหรือ global fallback)
 * - `scopedByCompany` = true เมื่อมาจาก mapping ของบริษัท那个人 (ใช้ debug/แยกเคส)
 * - `supportEmail`/`supportPhone`/`workingHours` = ข้อมูลกลาง (fallback เมื่อไม่มีใครเลือก)
 */
export interface HelpCenterContact {
  id: number;
  supportEmail: string;
  supportPhone: string;
  workingHours: string;
  contactUserIds: number[];
  contacts: ContractContact[];
  scopedByCompany: boolean;
  updatedAt: string | null;
}

/** config ดิบที่แอดมินใช้แก้ใน dialog — `GET contact` คืนตามคนเรียกจึงต้องใช้อันนี้แทน */
export interface HelpCenterContactConfig {
  id: number;
  supportEmail: string;
  supportPhone: string;
  workingHours: string;
  /** รายชื่อหลัก — ใช้กับบริษัทที่ยังไม่กำหนดเอง */
  contactUserIds: number[];
  /** map company id → user id[] · array ว่าง = บริษัทนั้นใช้ข้อมูลกลาง */
  contactUsersByCompany: Record<string, number[]>;
  updatedAt: string | null;
}

/** fail-open — API ยิงไม่ได้ก็ยังมีข้อมูลกลางให้โชว์ในป๊อปอัพ /systems */
export const FALLBACK_HELP_CENTER_CONTACT: HelpCenterContact = {
  id: 1,
  supportEmail: "support@issuetrack.com",
  supportPhone: "02-123-4567",
  workingHours: "จันทร์ - ศุกร์ 09:00 - 18:00 น.",
  contactUserIds: [],
  contacts: [],
  scopedByCompany: false,
  updatedAt: null,
};

function getToken(): string | null {
  return useAuthStore.getState().token;
}

/** รายชื่อที่คนล็อกอินอยู่เห็น (เซิร์ฟเวอร์อ่าน company_id จาก JWT เอง) */
export function fetchHelpCenterContact(): Promise<HelpCenterContact> {
  return apiFetch<HelpCenterContact>("/help-center/contact", {}, getToken());
}

/** config เต็มสำหรับ dialog จัดการผู้ติดต่อ (แอดมินเท่านั้น) */
export function fetchHelpCenterContactConfig(): Promise<HelpCenterContactConfig> {
  return apiFetch<HelpCenterContactConfig>("/help-center/contact/config", {}, getToken());
}

/** ตัวเลือกโปรแกรมเมอร์ใน dialog "จัดการผู้ติดต่อ" (แอดมินเท่านั้น) */
export function fetchProgrammerContacts(): Promise<ContractContact[]> {
  return apiFetch<ContractContact[]>("/help-center/programmers", {}, getToken());
}

export function updateHelpCenterContact(input: {
  supportEmail: string;
  supportPhone: string;
  workingHours: string;
  contactUserIds: number[];
  contactUsersByCompany: Record<string, number[]>;
}): Promise<HelpCenterContactConfig> {
  return apiFetch<HelpCenterContactConfig>(
    "/help-center/contact",
    { method: "PATCH", body: JSON.stringify(input) },
    getToken(),
  );
}
