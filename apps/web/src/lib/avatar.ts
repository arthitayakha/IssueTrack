"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "./auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

/**
 * The signed-in user's picture per user id: an objectURL, or **null when the
 * user has no picture** — a miss is cached exactly like a hit. The navbar, the
 * avatar menu and the profile tab all remount on every navigation (each page
 * renders its own `DashboardLayout`), and only a *successful* lookup used to be
 * cached, so a 404 fired one request per consumer per navigation — a page full
 * of them. `invalidateAvatar` drops the entry after an upload/removal so the
 * next read refetches; a reload clears this module-level map anyway, so a
 * picture changed on another device shows up on the next page load.
 */
const urlCache = new Map<string, string | null>();

/**
 * Lookups currently on the wire, keyed by user id. The navbar and the profile
 * popup mount together and would otherwise both ask for the same picture;
 * sharing one promise also keeps React StrictMode's double-invoked effect to a
 * single request in dev.
 */
const inflight = new Map<string, Promise<string | null>>();

/**
 * Listeners fire whenever a picture is uploaded/removed — every
 * `useOwnAvatar` consumer refetches, so the navbar, the menu and the
 * profile tab all show the new picture without a reload.
 */
const listeners = new Set<() => void>();

function drop(userId: string) {
  const cached = urlCache.get(userId);
  if (cached) URL.revokeObjectURL(cached);
  urlCache.delete(userId);
  inflight.delete(userId);
}

/** Call after uploading/deleting the picture so every consumer refetches. */
export function invalidateAvatar(userId?: string) {
  const ids = userId ? [userId] : [...new Set([...urlCache.keys(), ...inflight.keys()])];
  for (const id of ids) drop(id);
  for (const listener of listeners) listener();
}

/**
 * The signed-in user's picture as an objectURL, or null when none exists
 * (callers render the initials avatar) / the lookup failed.
 *
 * A **204** ("no picture yet") is remembered as `null`, so that answer costs
 * one request per session instead of one per mount. Anything else — a
 * transport failure, the API restarting, an expired token — is NOT cached, so
 * a blip cannot pin the initials avatar until the next upload.
 */
export function fetchOwnAvatar(token: string, userId: string): Promise<string | null> {
  if (urlCache.has(userId)) return Promise.resolve(urlCache.get(userId) ?? null);
  const pending = inflight.get(userId);
  if (pending) return pending;

  const request = fetch(`${API_URL}/auth/profile/avatar`, {
    headers: { Authorization: `Bearer ${token}` },
    // never reuse the browser's HTTP cache: a cached miss (204) would keep
    // the initials avatar up long after a picture exists (and a cached
    // picture would outlive a replace)
    cache: "no-store",
  })
    .then((res) => {
      // 204 = "there is no picture", a fact worth remembering. This branch
      // must run before res.blob(): a 204 has no body, and caching that empty
      // blob as an objectURL would render a broken image instead of the
      // initials avatar.
      if (res.status === 204) return null;
      if (!res.ok) throw new Error(`avatar lookup failed: ${res.status}`);
      return res.blob();
    })
    .then((blob) => {
      // invalidated while in flight → a newer lookup owns the cache now
      if (inflight.get(userId) !== request) return null;
      inflight.delete(userId);
      if (!blob) {
        urlCache.set(userId, null);
        return null;
      }
      const url = URL.createObjectURL(blob);
      urlCache.set(userId, url);
      return url;
    })
    .catch(() => {
      if (inflight.get(userId) === request) inflight.delete(userId);
      return null;
    });

  inflight.set(userId, request);
  return request;
}

/** `null` until the fetch settles — callers show the initials avatar meanwhile. */
export function useOwnAvatar(): string | null {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [url, setUrl] = useState<string | null>(() =>
    user ? (urlCache.get(user.id) ?? null) : null,
  );
  // bumped by invalidateAvatar's listener → the effect below refetches
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!token || !user) {
      setUrl(null);
      return;
    }
    let alive = true;
    fetchOwnAvatar(token, user.id).then((next) => {
      if (alive) setUrl(next);
    });
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, [token, user, tick]);

  return url;
}

/**
 * Downscales a picked picture to a 256px square JPEG before upload, so the
 * 2MB server limit and the stored row stay comfortable. Draws on a white
 * background first — transparent PNGs would otherwise come out black.
 */
export function resizeAvatar(file: File, size = 256, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, size, size);
      // cover-crop: fill the square from the centre
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("Could not encode image")),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}
