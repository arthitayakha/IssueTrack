"use client";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

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

/**
 * The message worth showing a user: the **API's own answer** when it sent one,
 * otherwise the caller's already-translated `fallback` — never the browser's
 * raw `Failed to fetch` wording. Pair it with `apiFetch`'s silent retries: a
 * restart blip never reaches this line at all, and anything that does is
 * reported in the app's own language.
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (isNetworkError(e)) return fallback;
  return e instanceof Error ? e.message : fallback;
}

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

/**
 * Delays before each **silent** retry of a request that never reached the API.
 *
 * The dev API runs under `node --watch`, so every server-side edit closes port
 * 3002 for ~1–2s — long enough for a click to fail with the browser's raw
 * `TypeError: Failed to fetch` (the red toast nobody wants to see). Two
 * attempts spread over ~2s ride that window out instead of surfacing an error
 * for a server that was merely restarting.
 */
const NETWORK_RETRY_DELAYS_MS = [600, 1400];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One round-trip — no retry. Split out so `apiFetch` can loop over it. */
async function fetchOnce<T>(
  path: string,
  options: RequestInit,
  token?: string | null,
): Promise<T> {
  // FormData must let the browser set `multipart/form-data; boundary=…` itself
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
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

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  // GET/HEAD/PUT/DELETE are idempotent — a second attempt cannot double-apply
  // anything (`moveIssue` / `assignIssue` / `unlockIssue` / `updateIssue` /
  // `deleteIssue` are all PUT/DELETE here). POST (create issue / comment /
  // upload) may already have been processed before the connection dropped, so
  // it gets exactly ONE extra attempt — enough for a restart blip, not enough
  // to spam duplicates.
  const idempotent =
    method === "GET" || method === "HEAD" || method === "PUT" || method === "DELETE";
  const delays = idempotent ? NETWORK_RETRY_DELAYS_MS : NETWORK_RETRY_DELAYS_MS.slice(0, 1);

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fetchOnce<T>(path, options, token);
    } catch (e) {
      lastError = e;
      // only "never reached the server" is retried — an `ApiError` means the
      // API answered, and its verdict is final (a 400/403/404 must not rerun)
      if (!isNetworkError(e) || attempt === delays.length) throw e;
      await sleep(delays[attempt]);
    }
  }
  throw lastError; // unreachable — every attempt above returns or throws
}

/**
 * **The same verdict as `apiFetch`, but returns the raw `Response`** — สำหรับ
 * เส้นที่ต้องการ `blob()` (ดาวน์โหลดไฟล์/รูป) ซึ่ง `apiFetch` parse JSON ให้
 * ไม่ได้ · **401 ยังเรียก logout handler เหมือนกัน** (เดิม raw `fetch` 5 จุด
 * ในแอปเงียบ ๆ ตอน token หมดอายุ = session ค้างครึ่งหนึ่ง) และ `!ok` โยน
 * `ApiError` พร้อมข้อความจาก API · **ไม่มี retry loop** — คลิกดาวน์โหลด
 * ซ้ำได้ง่าย และ response ที่อ่านครึ่งทางแล้ว retry ไม่ปลอดภัย
 */
export async function apiFetchResponse(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<Response> {
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
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
  return res;
}
