"use client";

import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";

export interface Board {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  columnCount: number;
}

export interface BoardColumn {
  id: number;
  boardId: number;
  status: string;
  customName: string | null;
  isHidden: boolean;
  position: number;
  issueCount: number;
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
  programmerId: number | null;
  programmerName: string | null;
  customerId: number | null;
  customerName: string | null;
  commentCount: number;
  attachmentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BoardDetail {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  columns: BoardColumn[];
  issues: BoardIssue[];
}

export interface ActivityLog {
  id: number;
  action: string;
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
  boardId: number | null;
  entityId: number | null;
  detail: string | null;
  createdAt: string;
}

function getToken(): string | null {
  return useAuthStore.getState().token;
}

export async function fetchBoards(): Promise<Board[]> {
  return apiFetch<Board[]>("/boards", {}, getToken());
}

export async function fetchBoard(id: number): Promise<BoardDetail> {
  return apiFetch<BoardDetail>(`/boards/${id}`, {}, getToken());
}

export async function createBoard(name: string, description?: string): Promise<Board> {
  return apiFetch<Board>("/boards", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  }, getToken());
}

export async function createColumn(
  boardId: number,
  status: string,
  customName?: string,
): Promise<BoardColumn> {
  return apiFetch<BoardColumn>(`/boards/${boardId}/columns`, {
    method: "POST",
    body: JSON.stringify({ status, customName }),
  }, getToken());
}

export async function deleteColumn(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/columns/${id}`, {
    method: "DELETE",
  }, getToken());
}

export async function createIssue(
  boardId: number,
  data: {
    title: string;
    description: string;
    columnId: number;
    priorityId?: number;
    categoryId?: number;
    programmerId?: number;
    customerId?: number;
  },
): Promise<BoardIssue> {
  return apiFetch<BoardIssue>(`/boards/${boardId}/issues`, {
    method: "POST",
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

export async function deleteIssue(id: number): Promise<{ deleted: boolean }> {
  return apiFetch<{ deleted: boolean }>(`/issues/${id}`, {
    method: "DELETE",
  }, getToken());
}

export async function fetchIssueActivity(issueId: number): Promise<ActivityLog[]> {
  return apiFetch<ActivityLog[]>(`/issues/${issueId}/activity`, {}, getToken());
}
