"use client";

import { PaginatedResponse } from "@kanban/shared";
import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";

export interface BoardColumn {
  id: number;
  statusId: number;
  statusName: string;
  customName: string | null;
  isHidden: boolean;
  isLocked: boolean;
  position: number;
  issueCount: number;
}

export interface IssueStatus {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  isTimerRunning: boolean;
  isEndStatus: boolean;
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
  title: string;
  description: string;
  columnId: number | null;
  statusId: number | null;
  priorityId: number | null;
  priorityName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  customCategory: string | null;
  labelId: number | null;
  labelIds: number[];
  labelName: string | null;
  labelColor: string | null;
  programmerId: number | null;
  programmerName: string | null;
  customerId: number | null;
  customerName: string | null;
  commentCount: number;
  attachmentCount: number;
  isLocked: boolean;
  trackedDuration?: number;
  actualFixDuration?: number | null;
  createdAt: string;
  updatedAt: string;
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

function getToken(): string | null {
  return useAuthStore.getState().token;
}

export async function fetchColumns(
  page = 1,
  limit = 100,
): Promise<PaginatedResponse<BoardColumn>> {
  return apiFetch<PaginatedResponse<BoardColumn>>(
    `/columns?page=${page}&limit=${limit}`,
    {},
    getToken(),
  );
}

export async function createColumn(statusId: number): Promise<BoardColumn> {
  return apiFetch<BoardColumn>("/columns", {
    method: "POST",
    body: JSON.stringify({ statusId }),
  }, getToken());
}

export async function createStatus(name: string, description?: string): Promise<IssueStatus> {
  return apiFetch<IssueStatus>("/issue-statuses", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  }, getToken());
}

export async function createColumnWithStatus(name: string, description?: string): Promise<BoardColumn> {
  const status = await createStatus(name, description);
  return createColumn(status.id);
}

export async function updateColumn(
  id: number,
  data: { customName?: string; isHidden?: boolean; isLocked?: boolean; position?: number },
): Promise<BoardColumn> {
  return apiFetch<BoardColumn>(`/columns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }, getToken());
}

export async function unlockColumn(id: number): Promise<BoardColumn> {
  return apiFetch<BoardColumn>(`/columns/${id}/unlock`, {
    method: "PATCH",
  }, getToken());
}

export async function deleteColumn(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/columns/${id}`, {
    method: "DELETE",
  }, getToken());
}

export async function reorderColumns(
  items: Array<{ id: number; position: number }>,
): Promise<{ reordered: number }> {
  return apiFetch<{ reordered: number }>("/columns/reorder", {
    method: "PATCH",
    body: JSON.stringify({ items }),
  }, getToken());
}

export async function fetchIssues(
  page = 1,
  limit = 100,
  statuses?: number[],
  search?: string,
): Promise<PaginatedResponse<BoardIssue>> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (statuses && statuses.length > 0) {
    params.set("statuses", statuses.join(","));
  }
  if (search) {
    params.set("search", search);
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
    columnId: number;
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
    priorityId?: number;
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

export async function moveIssue(id: number, columnId: number): Promise<BoardIssue> {
  return apiFetch<BoardIssue>(`/issues/${id}/move`, {
    method: "PUT",
    body: JSON.stringify({ columnId }),
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

export async function uploadAttachment(
  issueId: number,
  file: File,
): Promise<{ id: number; fileName: string; fileType: string | null; fileSize: number | null }> {
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
  return apiFetch<PaginatedResponse<IssuePriority>>("/issue-priorities", {}, getToken());
}

export async function fetchUsers(): Promise<PaginatedResponse<UserSummary>> {
  return apiFetch<PaginatedResponse<UserSummary>>("/users", {}, getToken());
}

export async function fetchTrashedIssues(): Promise<TrashedIssue[]> {
  return apiFetch<TrashedIssue[]>("/issues/trash", {}, getToken());
}

export async function restoreIssue(id: number): Promise<BoardIssue> {
  return apiFetch<BoardIssue>(`/issues/${id}/restore`, {
    method: "PUT",
  }, getToken());
}
