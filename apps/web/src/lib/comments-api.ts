"use client";

import { PaginatedResponse } from "@kanban/shared";
import { apiFetch } from "./api";
import { useAuthStore } from "./auth-store";

export interface Comment {
  id: number;
  content: string;
  issueId: number;
  authorId: number;
  authorName: string | null;
  createdAt: string;
}

function getToken(): string | null {
  return useAuthStore.getState().token;
}

export async function fetchComments(
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

