"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(e: unknown, status?: number): e is ApiError {
  return e instanceof ApiError && (status === undefined || e.status === status);
}

/**
 * A `fetch` that never reached the server (connection refused / reset / CORS)
 * throws a bare `TypeError` — unlike `ApiError`, which means the API answered.
 * The dev API restarts on every server-side edit, so callers use this to tell
 * "the server is momentarily gone" apart from "the server said no".
 */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError && !isApiError(e);
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      unauthorizedHandler?.();
    }
    const body = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    const message = Array.isArray(body.message)
      ? body.message[0]
      : (body.message ?? res.statusText);
    throw new ApiError(res.status, message);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
