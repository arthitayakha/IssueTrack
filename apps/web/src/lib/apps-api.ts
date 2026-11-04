"use client";

import { PaginatedResponse } from "@kanban/shared";
import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";
import type { ExpiryStatus } from "./app-expiry";

/**
 * ข้อมูลแอป/บริษัท + การเรียก API ของแอป — **ที่เดียวที่สองหน้า
 * (`/master-data` กับ `/systems`) ใช้ร่วมกัน** เพื่อไม่ให้รูปแบบ response
 * เพี้ยนจากกันคนละที่
 */

/**
 * 1 แถวของ `app_companies` — **คู่ แอป×บริษัท** พร้อมวันที่ของคู่นั้นเอง
 * (migration 1810 ย้ายวันที่ออกจาก `apps` ลงมาที่ตารางเชื่อม เพราะแต่ละ
 * บริษัทต่ออายุคนละช่วงเวลา)
 */
export interface AppCompanyLink {
  id: number;
  name: string;
  /** `YYYY-MM-DD` from `app_companies.started_at`, null = ยังไม่กรอก */
  startedAt: string | null;
  /** `YYYY-MM-DD` from `app_companies.expires_at`, null = ไม่กำหนด */
  expiresAt: string | null;
  /** ชั่วโมง MA ที่ตกลงให้คู่นี้จาก `app_companies.ma_hours`, null = ยังไม่กำหนด */
  maHours: number | null;
  /** stored state **ของคู่นี้** — ปกติ / ใกล้หมดอายุ / วิกฤต / หมดอายุ / ไม่กำหนด */
  expiryStatus: ExpiryStatus;
}

export interface App {
  id: number;
  name: string;
  isVisible: boolean;
  /** บริษัทที่ผูกอยู่ พร้อมวันที่ของแต่ละคู่ — many-to-many (`app_companies`) */
  companies: AppCompanyLink[];
  /** ISO datetime from `created_at` */
  createdAt: string;
  issueCount: number;
}

export interface Company {
  id: number;
  name: string;
  isVisible: boolean;
  /** จำนวนแอปที่ผูกกับบริษัทนี้ (นับจาก `app_companies`) */
  appCount: number;
}

/** 1 แถวของตารางย่อย/ dropdown ในฟอร์ม — บริษัท 1 แห่ง พร้อมวันที่ + ชั่วโมง MA */
export interface AppCompanyInput {
  id: number;
  /** `YYYY-MM-DD`, `null` = ยังไม่กรอก / ไม่กำหนด */
  startedAt: string | null;
  expiresAt: string | null;
  /** ชั่วโมง MA ที่ตกลงให้คู่นี้, `null` = ยังไม่กำหนด */
  maHours: number | null;
}

function getToken(): string | null {
  return useAuthStore.getState().token;
}

export async function fetchApps(page = 1, limit = 100): Promise<PaginatedResponse<App>> {
  return apiFetch<PaginatedResponse<App>>(`/apps?page=${page}&limit=${limit}`, {}, getToken());
}

/** `GET /companies` เปิดให้ทุกคนที่ล็อกอิน — ฟอร์มแอปต้องใช้รายการนี้ แม้ไม่มีสิทธิ์ดูแท็บบริษัท */
export async function fetchCompanies(page = 1, limit = 100): Promise<PaginatedResponse<Company>> {
  return apiFetch<PaginatedResponse<Company>>(
    `/companies?page=${page}&limit=${limit}`,
    {},
    getToken(),
  );
}

/** POST (ไม่ส่ง `id`) / PATCH (ส่ง `id`) — ฟอร์มส่งบริษัทเดียวเป็น array อันเดียว */
export async function saveApp(data: {
  id?: number;
  name: string;
  companies: AppCompanyInput[];
}): Promise<App> {
  const { id, ...body } = data;
  return apiFetch<App>(id ? `/apps/${id}` : "/apps", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  }, getToken());
}

export async function toggleAppActive(id: number, isActive: boolean): Promise<App> {
  return apiFetch<App>(`/apps/${id}/active`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  }, getToken());
}

export async function checkApp(id: number): Promise<{ canDelete: boolean; issueCount: number }> {
  return apiFetch<{ canDelete: boolean; issueCount: number }>(`/apps/${id}/check`, {}, getToken());
}

export async function deleteApp(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/apps/${id}`, { method: "DELETE" }, getToken());
}
