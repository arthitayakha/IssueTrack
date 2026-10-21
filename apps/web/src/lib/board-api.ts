"use client";

import { PaginatedResponse } from "@kanban/shared";
import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";

export interface IssueStatus {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  timerEnabled: boolean;
  timeEntryEnabled: boolean;
  customName?: string | null;
  issueCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IssuePriority {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  issueCount: number;
}

export interface UserSummary {
  id: string;
  name: string;
  roleId: number | null;
  roleName: string | null;
  positionId: number | null;
  positionName: string | null;
  isActive: boolean;
}

export interface BoardIssue {
  id: number;
  issueNumber: string | null;
  title: string;
  description: string;
  statusId: number | null;
  statusName: string | null;
  priorityId: number | null;
  priorityName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  customCategory: string | null;
  labelId: number | null;
  labelIds: number[];
  labelName: string | null;
  labelColor: string | null;
  labels: { id: number; name: string; color: string }[];
  programmerId: number | null;
  programmerName: string | null;
  customerId: number | null;
  customerName: string | null;
  commentCount: number;
  attachmentCount: number;
  trackedDuration?: number;
  actualFixDuration?: number | null;
  createdAt: string;
  updatedAt: string;
  statusTimerEnabled?: boolean;
  statusTimeEntryEnabled?: boolean;
  isLocked?: boolean;
}

export interface WorkSession {
  id: number;
  issueId: number;
  programmerId: number;
  startedAt: string;
  endedAt: string | null;
  duration: number;
  createdAt: string;
}

export interface ActivityLog {
  id: number;
  action: string;
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
  entityId: number | null;
  detail: string | null;
  createdAt: string;
}

export interface Comment {
  id: number;
  content: string;
  issueId: number;
  authorId: number;
  authorName: string;
  createdAt: string;
}

export interface TrashedIssue extends BoardIssue {
  deletedAt: string;
  deletedBy: number | null;
  deletedByName: string | null;
}

export function getToken(): string | null {
  return useAuthStore.getState().token;
}

export async function createStatus(name: string, description?: string): Promise<IssueStatus> {
  return apiFetch<IssueStatus>("/issue-statuses", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  }, getToken());
}

export async function updateStatus(
  id: number,
  data: { name?: string; description?: string; customName?: string; timerEnabled?: boolean; timeEntryEnabled?: boolean },
): Promise<IssueStatus> {
  return apiFetch<IssueStatus>(`/issue-statuses/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }, getToken());
}

export async function deleteStatus(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/issue-statuses/${id}`, {
    method: "DELETE",
  }, getToken());
}

export async function reorderStatuses(
  items: Array<{ id: number; sortOrder: number }>,
): Promise<{ reordered: number }> {
  return apiFetch<{ reordered: number }>("/issue-statuses/reorder", {
    method: "PATCH",
    body: JSON.stringify({ items }),
  }, getToken());
}

export async function fetchIssues(
  page = 1,
  limit = 100,
  statuses?: number[],
  search?: string,
  mine?: boolean,
): Promise<PaginatedResponse<BoardIssue>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (statuses && statuses.length > 0) {
    params.set("statuses", statuses.join(","));
  }
  if (search) {
    params.set("search", search);
  }
  if (mine) {
    params.set("mine", "true");
  }
  return apiFetch<PaginatedResponse<BoardIssue>>(
    `/issues?${params.toString()}`,
    {},
    getToken(),
  );
}

export async function createIssue(
  data: {
    title: string;
    description: string;
    statusId: number;
    priorityId?: number;
    categoryId?: number;
    customCategory?: string;
    programmerId?: number;
    customerId?: number;
  },
): Promise<BoardIssue> {
  return apiFetch<BoardIssue>("/issues", {
    method: "POST",
    body: JSON.stringify(data),
  }, getToken());
}

export async function updateIssue(
  id: number,
  data: {
    title?: string;
    description?: string;
    priorityId?: number | null;
    categoryId?: number;
    labelId?: number;
    labelIds?: number[];
  },
): Promise<BoardIssue> {
  return apiFetch<BoardIssue>(`/issues/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  }, getToken());
}

export async function moveIssue(id: number, statusId: number): Promise<BoardIssue> {
  return apiFetch<BoardIssue>(`/issues/${id}/move`, {
    method: "PUT",
    body: JSON.stringify({ statusId }),
  }, getToken());
}

export async function assignIssue(
  id: number,
  programmerId: number | null,
): Promise<BoardIssue> {
  return apiFetch<BoardIssue>(`/issues/${id}/assign`, {
    method: "PUT",
    body: JSON.stringify({ programmerId }),
  }, getToken());
}

export async function lockIssue(id: number): Promise<BoardIssue> {
  return apiFetch<BoardIssue>(`/issues/${id}/lock`, {
    method: "PUT",
  }, getToken());
}

export async function unlockIssue(id: number): Promise<BoardIssue> {
  return apiFetch<BoardIssue>(`/issues/${id}/unlock`, {
    method: "PUT",
  }, getToken());
}

export async function deleteIssue(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/issues/${id}`, {
    method: "DELETE",
  }, getToken());
}

export async function fetchIssueActivity(issueId: number): Promise<ActivityLog[]> {
  return apiFetch<ActivityLog[]>(`/issues/${issueId}/activity`, {}, getToken());
}

export async function fetchIssueComments(
  issueId: number,
  page = 1,
  limit = 10,
): Promise<PaginatedResponse<Comment>> {
  return apiFetch<PaginatedResponse<Comment>>(
    `/issues/${issueId}/comments?page=${page}&limit=${limit}`,
    {},
    getToken(),
  );
}

export async function createComment(issueId: number, content: string): Promise<Comment> {
  return apiFetch<Comment>(`/issues/${issueId}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  }, getToken());
}

export async function updateComment(id: number, content: string): Promise<Comment> {
  return apiFetch<Comment>(`/comments/${id}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  }, getToken());
}

export async function deleteComment(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/comments/${id}`, {
    method: "DELETE",
  }, getToken());
}

export interface Attachment {
  id: number;
  issueId: number;
  uploadedBy: number | null;
  fileName: string;
  filePath: string;
  fileType: string | null;
  fileSize: number | null;
  createdAt: string;
}

export async function uploadAttachment(
  issueId: number,
  file: File,
): Promise<Attachment> {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/issues/${issueId}/attachments`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message[0] : (body.message ?? res.statusText);
    throw new Error(message);
  }
  return res.json();
}

export async function fetchAttachments(issueId: number): Promise<Attachment[]> {
  return apiFetch<Attachment[]>(`/issues/${issueId}/attachments`, {}, getToken());
}

export async function deleteAttachment(id: number): Promise<void> {
  await apiFetch<void>(`/attachments/${id}`, { method: "DELETE" }, getToken());
}

export async function openAttachment(id: number): Promise<void> {
  const token = getToken();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}/attachments/${id}/download`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!res.ok) {
    throw new Error(`Failed to open attachment: ${res.statusText}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function fetchStatuses(
  page = 1,
  limit = 100,
): Promise<PaginatedResponse<IssueStatus>> {
  return apiFetch<PaginatedResponse<IssueStatus>>(
    `/issue-statuses?page=${page}&limit=${limit}`,
    {},
    getToken(),
  );
}

export async function fetchPriorities(): Promise<PaginatedResponse<IssuePriority>> {
  return apiFetch<PaginatedResponse<IssuePriority>>("/issue-priorities?page=1&limit=100", {}, getToken());
}

export async function fetchUsers(): Promise<PaginatedResponse<UserSummary>> {
  return apiFetch<PaginatedResponse<UserSummary>>("/users", {}, getToken());
}

export interface Category {
  id: number;
  name: string;
  isActive: boolean;
  issueCount: number;
}

export async function fetchCategories(): Promise<PaginatedResponse<Category>> {
  return apiFetch<PaginatedResponse<Category>>(
    "/categories?page=1&limit=100",
    {},
    getToken(),
  );
}

export async function fetchTrashedIssues(): Promise<TrashedIssue[]> {
  return apiFetch<TrashedIssue[]>("/issues/trash", {}, getToken());
}

export async function restoreIssue(id: number): Promise<BoardIssue> {
  return apiFetch<BoardIssue>(`/issues/${id}/restore`, {
    method: "PUT",
  }, getToken());
}

export async function startTimer(issueId: number): Promise<WorkSession> {
  return apiFetch<WorkSession>(`/work-sessions/issue/${issueId}/start`, {
    method: "POST",
  }, getToken());
}

export async function stopTimer(issueId: number): Promise<WorkSession> {
  return apiFetch<WorkSession>(`/work-sessions/issue/${issueId}/stop`, {
    method: "POST",
  }, getToken());
}

export async function getOpenTimer(issueId: number): Promise<WorkSession | null> {
  return apiFetch<WorkSession | null>(`/work-sessions/issue/${issueId}/open`, {}, getToken());
}

export async function getWorkSessions(issueId: number): Promise<WorkSession[]> {
  return apiFetch<WorkSession[]>(`/work-sessions/issue/${issueId}`, {}, getToken());
}

export async function setActualFixDuration(issueId: number, duration: number): Promise<BoardIssue> {
  return apiFetch<BoardIssue>(`/issues/${issueId}/time`, {
    method: "PUT",
    body: JSON.stringify({ actualFixDuration: duration }),
  }, getToken());
}
