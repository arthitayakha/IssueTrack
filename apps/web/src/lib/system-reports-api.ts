"use client";

import { apiFetch, apiFetchResponse } from "./api";
import { useAuthStore } from "./auth-store";

/** `closed` stays in the type for legacy rows — the detail dialog only offers 3. */
export type SystemReportStatus = "open" | "in_progress" | "resolved" | "closed";
/** The three statuses an admin can pick in the detail dialog. */
export const VISIBLE_SYSTEM_REPORT_STATUSES: Exclude<SystemReportStatus, "closed">[] = [
  "open",
  "in_progress",
  "resolved",
];
export type SystemReportProblemType = "bug" | "improvement" | "other";
export const PROBLEM_TYPES: SystemReportProblemType[] = ["bug", "improvement", "other"];
export const PROBLEM_TYPE_KEYS: Record<SystemReportProblemType, string> = {
  bug: "problemTypeBug",
  improvement: "problemTypeImprovement",
  other: "problemTypeOther",
};

export interface SystemReportAttachment {
  id: number;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  createdAt: string;
}

export interface SystemReport {
  id: number;
  title: string;
  description: string;
  pageUrl: string | null;
  problemType: SystemReportProblemType;
  status: SystemReportStatus;
  reporterId: number;
  reporterName: string | null;
  reporterEmail: string | null;
  reporterPhone: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: SystemReportAttachment[];
}

function getToken(): string | null {
  return useAuthStore.getState().token;
}

/** ฟอร์มศูนย์ช่วยเหลือ — แนบภาพ/PDF ได้ (browser เป็นคนตั้ง boundary ของ FormData) */
export async function createSystemReport(input: {
  title: string;
  description: string;
  problemType: SystemReportProblemType;
  pageUrl?: string;
  files: File[];
}): Promise<SystemReport> {
  const body = new FormData();
  body.append("title", input.title);
  body.append("description", input.description);
  body.append("problemType", input.problemType);
  if (input.pageUrl?.trim()) body.append("pageUrl", input.pageUrl.trim());
  for (const file of input.files) body.append("files", file);
  return apiFetch<SystemReport>("/system-reports", { method: "POST", body }, getToken());
}

export async function fetchSystemReports(
  problemType?: SystemReportProblemType,
): Promise<SystemReport[]> {
  const query = problemType ? `?problemType=${encodeURIComponent(problemType)}` : "";
  return apiFetch<SystemReport[]>(`/system-reports${query}`, {}, getToken());
}

export async function fetchSystemReport(id: number): Promise<SystemReport> {
  return apiFetch<SystemReport>(`/system-reports/${id}`, {}, getToken());
}

export async function updateSystemReportStatus(
  id: number,
  status: SystemReportStatus,
): Promise<SystemReport> {
  return apiFetch<SystemReport>(
    `/system-reports/${id}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
    getToken(),
  );
}

/** ไฟล์แนบกันด้วย JWT — ต้องใช้ apiFetchResponse ไม่ใช่ <a href> (401/logout) */
export async function fetchSystemReportAttachment(
  reportId: number,
  attachmentId: number,
): Promise<Blob> {
  const res = await apiFetchResponse(
    `/system-reports/${reportId}/attachments/${attachmentId}/download`,
    {},
    getToken(),
  );
  return res.blob();
}
