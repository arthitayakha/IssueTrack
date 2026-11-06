"use client";

import { PaginatedResponse } from "@kanban/shared";
import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";
import type { ExpiryStatus } from "./app-expiry";

/**
 * ข้อมูลแอป/บริษัท + การเรียก API ของแอป — **ที่เดียวที่สองหน้า
 * (`/master-data` กับ `/systems`) ใช้ร่วมกัน** เพื่อไม่ให้รูปแบบ response
 * เพี้ยนจากกันคนละที่
 *
 * อ่านอย่างเดียว: `/master-data` ใช้ `fetchApps()` (GET /apps — เปิดให้ทุกคน
 * ที่ล็อกอิน เพราะฟอร์มแจ้งปัญหาต้องใช้) ส่วน `/systems` ใช้
 * `fetchSystemsApps()` (GET /systems — กันด้้วย `system.view`) สองหน้าจึงให้
 * สิทธิ์แยกกันได้
 *
 * เขียน: `addAppRecord` / `updateAppRecord` / `deleteAppRecord` (รายการข้อมูล)
 * เป็นของ `/systems` · ส่วนชื่อแอป แท็บ `/master-data` เรียก `apiFetch` ตรง ๆ
 * เอง — สองเรื่องจึงไม่เขียนทับกัน
 */

/**
 * 1 แถวของ `app_companies` — **1 ช่วงเวลาของคู่ แอป×บริษัท** (migration 1810
 * ย้ายวันที่ออกจาก `apps` ลงมาที่ตารางเชื่อม · migration 1812 ทำให้คู่เดิม
 * มีได้หลายแถว → หน้า `/systems` จึงโชว์ **1 แถวต่อ 1 รายการ**)
 */
export interface AppCompanyLink {
  /** PK ของแถว — API ฝั่ง record (`/apps/:id/companies/:recordId`) ใช้ตัวนี้ */
  recordId: number;
  /** `company_id` — ฝั่ง `boards` / `reports` กรองบริษัทด้วยค่านี้ */
  id: number;
  name: string;
  /** `YYYY-MM-DD` from `app_companies.started_at`, null = ยังไม่กรอก */
  startedAt: string | null;
  /** `YYYY-MM-DD` from `app_companies.expires_at`, null = ไม่กำหนด */
  expiresAt: string | null;
  /** ชั่วโมง MA ของช่วงนี้จาก `app_companies.ma_hours`, null = ยังไม่กำหนด */
  maHours: number | null;
  /** stored state **ของแถวนี้** — ไม่กำหนด / ปกติ / ใกล้หมดอายุ (≤30 วัน) / หมดอายุ — UI โชว์เป็นจำนวนวันดูที่ `expiryChipLabel()` */
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

/** payload ของ `POST` / `PATCH /apps/:id/companies` — 1 รายการข้อมูลระบบ */
export interface AppRecordInput {
  /** บริษัทของรายการ — ตอนเพิ่มต้องระบุ · ตอนแก้ไขส่งมา = เปลี่ยนบริษัท */
  companyId?: number;
  /** `YYYY-MM-DD`, `null` = ยังไม่กรอก / ไม่กำหนด · ไม่ส่ง = คงเดิมไว้ */
  startedAt?: string | null;
  expiresAt?: string | null;
  /** ชั่วโมง MA ของช่วงนี้, `null` = ยังไม่กำหนด */
  maHours?: number | null;
}

function getToken(): string | null {
  return useAuthStore.getState().token;
}

export async function fetchApps(page = 1, limit = 100): Promise<PaginatedResponse<App>> {
  return apiFetch<PaginatedResponse<App>>(`/apps?page=${page}&limit=${limit}`, {}, getToken());
}

/**
 * `/systems` (ข้อมูลระบบ) อ่านผ่าน endpoint ของตัวเอง — กันด้้วย `system.view`
 * ให้หน้าแยกสิทธิ์จากแท็บแอปใน `/master-data` ได้ (payload เดียวกับ GET /apps)
 */
export async function fetchSystemsApps(page = 1, limit = 100): Promise<PaginatedResponse<App>> {
  return apiFetch<PaginatedResponse<App>>(`/systems?page=${page}&limit=${limit}`, {}, getToken());
}

/** `GET /companies` เปิดให้ทุกคนที่ล็อกอิน — ฟอร์มแอปต้องใช้รายการนี้ แม้ไม่มีสิทธิ์ดูแท็บบริษัท */
export async function fetchCompanies(page = 1, limit = 100): Promise<PaginatedResponse<Company>> {
  return apiFetch<PaginatedResponse<Company>>(
    `/companies?page=${page}&limit=${limit}`,
    {},
    getToken(),
  );
}

/**
 * **รายการข้อมูลระบบ** — 3 endpoint ใต้ `/apps/:id/companies`:
 * append / patch แถวเดียว / ลบแถวเดียว
 *
 * ตั้งใจ**ไม่มี** "ส่ง list ทั้งชุดมาแทนที่" อีกต่อไป เพราะคู่เดิมมีได้หลาย
 * ช่วงเวลา (migration 1812) — การส่ง list จะไปลบช่วงเก่าทิ้งเอง
 */
export async function addAppRecord(appId: number, data: AppRecordInput): Promise<App> {
  return apiFetch<App>(`/apps/${appId}/companies`, {
    method: "POST",
    body: JSON.stringify(data),
  }, getToken());
}

/** แก้ **แถวนั้นแถบเดียว** — ฟิลด์ที่ไม่ส่ง = คงเดิม, ส่ง `null` = ล้างค่า */
export async function updateAppRecord(
  appId: number,
  recordId: number,
  data: AppRecordInput,
): Promise<App> {
  return apiFetch<App>(`/apps/${appId}/companies/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }, getToken());
}

/** ลบรายการ — **แอปไม่หาย** (การลบแอปอยู่ที่แท็บแอปใน `/master-data`) */
export async function deleteAppRecord(
  appId: number,
  recordId: number,
): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/apps/${appId}/companies/${recordId}`, {
    method: "DELETE",
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
