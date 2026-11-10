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
  /**
   * ชั่วโมงที่ **ทบมาจากช่วงแรก** ตอนต่ออายุ (`app_companies.carried_hours`,
   * migration 1824) — `null` = แถวนี้ไม่ได้ทบ (แถวเก่าที่มีก่อน migration /
   * รอบ 2 เป็นต้นไป / แถว `buy`) → ป๊อปอัพซ่อน chip "ทบมา" เอง
   */
  carriedHours: number | null;
  /**
   * แถวนี้มาจากอะไร (migration 1820) — `renew` = ต่ออายุ/เพิ่มรายการปกติ,
   * `buy` = ซื้อชั่วโมง MA เพิ่ม (วันที่เท่าเดิมแต่ `maHours` มากขึ้น) —
   * ใช้แยกแถบที่ซื้อในแท็บ "ประวัติการต่ออายุ"
   */
  kind: "renew" | "buy";
  /** stored state **ของแถวนี้** — ไม่กำหนด / ปกติ / ใกล้หมดอายุ (≤30 วัน) / หมดอายุ — UI โชว์เป็นจำนวนวันดูที่ `expiryChipLabel()` */
  expiryStatus: ExpiryStatus;
  /**
   * ISO datetime จาก `app_companies.created_at` — **วันที่บันทึกช่วงนั้น**
   * ใช้เป็นคอลัมน์ "วันที่" ของตารางประวัติการต่ออายุ (ต่างจาก `startedAt`
   * ที่เป็นวันที่ของสัญญา) · แถวที่สร้างก่อน migration 1819 ได้ค่าตอน migrate
   */
  createdAt: string | null;
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

/**
 * **ต่ออายุ** — ปิดช่วงเก่าแล้ว append ช่วงใหม่ให้คู่เดิม (`company_id` ยืม
 * จากแถวตั้งต้นที่เซิร์ฟเวอร์อ่านเอง ฟอร์มส่งมาแค่ 3 ช่องนี้)
 *
 * ต่างจาก `addAppRecord()`: ทั้ง 3 ฟิลด์**บังคับ**และ endpoint รับ
 * `system.update` (ไม่ใช่ `system.create`) — ปุ่มต่ออายุจึงเปิดได้เฉพาะ
 * คนที่แก้ข้อมูลระบบได้
 */
export interface AppRenewInput {
  /** `YYYY-MM-DD` — วันที่เริ่มใช้งานของช่วงใหม่ */
  startedAt: string;
  /** `YYYY-MM-DD` — วันหมดอายุของช่วงใหม่ (ต้องมากกว่า `startedAt`) */
  expiresAt: string;
  /** ชั่วโมง MA ของช่วงใหม่ */
  maHours: number;
  /**
   * ชั่วโมงที่ **ทบมาจากช่วงแรก** ตอนต่ออายุ (แสดงผลเท่านั้น) — ส่ง `0` เมื่อ
   * รอบนี้ไม่ทบ (เซิร์ฟเวอร์เก็บเป็น `NULL`) เพื่อให้ป๊อปอัพโชว์/ซ่อน chip
   * "ทบมา" ได้ถูกต้องย้อนหลัง · ต้องเป็นจำนวนเต็ม ≥ 0 และไม่เกิน `maHours`
   */
  carriedHours: number;
}

export async function renewAppRecord(
  appId: number,
  recordId: number,
  data: AppRenewInput,
): Promise<App> {
  return apiFetch<App>(`/apps/${appId}/companies/${recordId}/renew`, {
    method: "POST",
    body: JSON.stringify(data),
  }, getToken());
}

/**
 * payload ของ `POST /apps/:id/companies/:recordId/buy-hours` — **ซื้อชั่วโมง MA เพิ่ม**
 *
 * ต่างจาก `AppRenewInput`: ส่งมา**แค่จำนวนชั่วโมง** (จำนวนเต็ม > 0) — วันที่สัญญา
 * คงเดิมทุกประการ ฝั่งเซิร์ฟเวอร์ append แถบใหม่ให้คู่เดิมด้วย
 * `maHours = ของเดิม + ที่ซื้อ` และ `kind = 'buy'`
 */
export interface AppBuyInput {
  hours: number;
}

/**
 * **ซื้อชั่วโมง MA เพิ่ม** — ปุ่ม "ซื้อชั่วโมง" ในตาราง `/systems` ขึ้นเฉพาะ
 * แถวที่คงเหลือ ≤ 0 (ดู `canBuyHours()` ในหน้านั้น) และต้องมี `system.update`
 * เหมือนปุ่มต่ออายุ
 */
export async function buyAppHours(
  appId: number,
  recordId: number,
  data: AppBuyInput,
): Promise<App> {
  return apiFetch<App>(`/apps/${appId}/companies/${recordId}/buy-hours`, {
    method: "POST",
    body: JSON.stringify(data),
  }, getToken());
}

export async function toggleAppActive(id: number, isActive: boolean): Promise<App> {
  return apiFetch<App>(`/apps/${id}/active`, {
    method: "PATCH",
    body: JSON.stringify({ isActive }),
  }, getToken());
}

/* ------------------------------------------------------------------ */
/*  รายการที่ถูกตัดจากช่วง MA — รอบต่อรอบ                              */
/* ------------------------------------------------------------------ */

/**
 * แถวเดียวของ "งานที่ถูกตัดจากช่วง MA นี้" — ดูได้จากป๊อปอัพ `/systems`
 * และ drill-down ของรายงาน view "ตามบริษัท"
 */
export interface PeriodIssue {
  id: number;
  issueNumber: string | null;
  title: string;
  taskType: "bug" | "feature" | "requirement" | null;
  /** ชั่วโมงของงานนี้ (ปัด 1 ตำแหน่ง) */
  hours: number;
  /** ISO datetime ที่กรอกชั่วโมง — `null` = ข้อมูลก่อนระบบ (ไม่ระบุรอบ) */
  deductedAt: string | null;
  statusName: string | null;
  assigneeName: string | null;
}

/**
 * `GET /apps/:id/companies/:recordId/usage` — สรุปของ **1 รอบ**
 *
 * `pairUsedHours` = "ใช้ไป" ระดับคู่ (ตลอดเวลา) — **ตัวเดียวกับที่ตารางโชว์อยู่**
 * ส่วน `periodUsedHours` เป็นส่วนของรอบนี้ ซึ่งบวกทุกรอบ + `unattributedHours`
 * ต้องได้เท่ากับ `pairUsedHours` เสมอ (เซิร์ฟเวอร์คุมด้วยเทสต์ invariant)
 */
export interface PeriodUsage {
  recordId: number;
  appId: number;
  companyId: number;
  /** ลำดับรอบในคู่นี้ (ตรงกับ "รอบที่ N" ในแท็บประวัติ) */
  round: number;
  kind: "renew" | "buy";
  startedAt: string | null;
  expiresAt: string | null;
  maHours: number | null;
  pairUsedHours: number;
  periodUsedHours: number;
  /** ชั่วโมงที่ไม่รู้ว่ากรอกตอนไหน (ข้อมูลก่อนระบบ) — pair-level */
  unattributedHours: number;
  count: number;
  issues: PeriodIssue[];
}

/** `GET /apps/usage-counts?recordIds=` — นับอย่างเดียว ไม่โหลดรายการ (ยิงครั้งเดียวต่อหน้า) */
export interface UsageCount {
  recordId: number;
  count: number;
  periodUsedHours: number;
}

/** รายการจริงของรอบ — เรียกตอนผู้ใช้กดเปิดดู (ไม่โหลดตอนเปิดหน้า) */
/** `GET /apps/:id/companies/:recordId/usage` — สถานะฝั่ง UI ของรายการที่กางอยู่ */
export type DeductionState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: PeriodUsage };

export async function fetchPeriodUsage(
  appId: number,
  recordId: number,
): Promise<PeriodUsage> {
  return apiFetch<PeriodUsage>(
    `/apps/${appId}/companies/${recordId}/usage`,
    {},
    getToken(),
  );
}

/**
 * จำนวนรายการที่ถูกตัดของหลายๆ รอบในคำสั่งเดียว — คอลัมน์ "รายการที่ตัด"
 * ของรายงาน (นับทั้งหน้าพร้อมกัน ไม่ใช่ยิงต่อแถว)
 */
export async function fetchUsageCounts(recordIds: number[]): Promise<UsageCount[]> {
  if (recordIds.length === 0) return [];
  const qs = recordIds.join(",");
  return apiFetch<UsageCount[]>(`/apps/usage-counts?recordIds=${qs}`, {}, getToken());
}

export async function checkApp(id: number): Promise<{ canDelete: boolean; issueCount: number }> {
  return apiFetch<{ canDelete: boolean; issueCount: number }>(`/apps/${id}/check`, {}, getToken());
}

export async function deleteApp(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/apps/${id}`, { method: "DELETE" }, getToken());
}
