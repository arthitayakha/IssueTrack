"use client";

import { API_URL } from "./api";
import { useAuthStore } from "./auth-store";
import type { AppNotification } from "./notifications-api";

type NewListener = (item: AppNotification) => void;
type ReadListener = (id: number) => void;

const newListeners = new Set<NewListener>();
const readListeners = new Set<ReadListener>();

let controller: AbortController | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
/** Flipped false on logout so an in-flight `read()` cannot reconnect. */
let wanted = false;

/** Register for brand-new rows pushed by `GET /notifications/stream`. */
export function subscribeToNotifications(listener: NewListener): () => void {
  newListeners.add(listener);
  return () => {
    newListeners.delete(listener);
  };
}

/**
 * A row was read (toast click / bell click). Other open tabs keep their own
 * copy of the inbox, so they need this hint to drop it without waiting ~10s
 * for the next poll. Purely local — no request is made here.
 */
export function broadcastNotificationRead(id: number): void {
  for (const listener of readListeners) listener(id);
}

export function subscribeToNotificationReads(listener: ReadListener): () => void {
  readListeners.add(listener);
  return () => {
    readListeners.delete(listener);
  };
}

/** Open the stream (idempotent). Call when a token appears. */
export function startNotificationStream(): void {
  wanted = true;
  if (controller || reconnectTimer) return;
  void connect();
}

/** Close the stream and cancel any pending reconnect (logout). */
export function stopNotificationStream(): void {
  wanted = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  controller?.abort();
  controller = null;
  reconnectDelay = 1000;
}

function scheduleReconnect(): void {
  if (!wanted || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, reconnectDelay);
  // 1s → 2s → 4s → … → 30s, so a dead API is not hammered
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
}

function dispatch(raw: string): void {
  let item: AppNotification;
  try {
    item = JSON.parse(raw) as AppNotification;
  } catch {
    return; // a malformed frame must never tear down the stream
  }
  if (!item || typeof item.id !== "number") return;
  for (const listener of newListeners) listener(item);
}

async function connect(): Promise<void> {
  const { token } = useAuthStore.getState();
  if (!wanted || !token) return;

  const ac = new AbortController();
  controller = ac;
  try {
    // EventSource cannot set the Authorization header — fetch() can, so the
    // JWT stays exactly where apiFetch puts it (never in the URL).
    const res = await fetch(`${API_URL}/notifications/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
      cache: "no-store",
    });
    if (res.status === 401) {
      // Token expired/revoked. The next regular API call handles the redirect;
      // here we simply stop instead of retrying forever with a dead token.
      stopNotificationStream();
      return;
    }
    if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
    reconnectDelay = 1000; // a successful connect resets the backoff
    if (!wanted) {
      ac.abort();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line. Nest writes "\n\n"; the
      // replace also covers a proxy that normalises them to CRLF.
      buffer = buffer.replace(/\r\n/g, "\n");
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) dispatch(data);
        end = buffer.indexOf("\n\n");
      }
    }
  } catch {
    // AbortError = deliberate stop; anything else = dev API restart / network.
    // Both are handled by the same reconnect scheduling below.
  } finally {
    if (controller === ac) controller = null;
  }
  scheduleReconnect();
}
