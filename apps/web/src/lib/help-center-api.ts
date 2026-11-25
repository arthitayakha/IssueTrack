"use client";

import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";
import type { ContractContact } from "./notifications-api";

/** รายชื่อที่ลูกค้าเห็น — มีเฉพาะโปรแกรมเมอร์ของบริษัทนั้น (ไม่มี global fallback) */
export interface HelpCenterContact {
  id: number;
  contacts: ContractContact[];
  updatedAt: string | null;
}

/** config ดิบที่แอดมินใช้แก้ใน dialog — map company id → user id[] */
export interface HelpCenterContactConfig {
  id: number;
  contactUsersByCompany: Record<string, number[]>;
  updatedAt: string | null;
}

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
  contactUsersByCompany: Record<string, number[]>;
}): Promise<HelpCenterContactConfig> {
  return apiFetch<HelpCenterContactConfig>(
    "/help-center/contact",
    { method: "PATCH", body: JSON.stringify(input) },
    getToken(),
  );
}
