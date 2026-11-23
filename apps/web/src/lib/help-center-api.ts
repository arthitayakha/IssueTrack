"use client";

import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";

/** ข้อมูลติดต่อกลางของศูนย์ช่วยเหลือ (แอดมินเป็นคนแก้) */
export interface HelpCenterContact {
  id: number;
  supportEmail: string;
  supportPhone: string;
  workingHours: string;
  updatedAt: string | null;
}

function getToken(): string | null {
  return useAuthStore.getState().token;
}

export function fetchHelpCenterContact(): Promise<HelpCenterContact> {
  return apiFetch<HelpCenterContact>("/help-center/contact", {}, getToken());
}

export function updateHelpCenterContact(input: {
  supportEmail: string;
  supportPhone: string;
  workingHours: string;
}): Promise<HelpCenterContact> {
  return apiFetch<HelpCenterContact>(
    "/help-center/contact",
    { method: "PATCH", body: JSON.stringify(input) },
    getToken(),
  );
}

