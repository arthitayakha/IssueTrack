"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "./auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

/**
 * objectURLs cached per user id, so the navbar, the avatar menu and the
 * profile tab share one request instead of fetching the picture three times.
 * A module-level map (not state) survives remounts; `invalidateAvatar`
 * drops the entry after an upload/removal so the next read refetches.
 */
const urlCache = new Map<string, string>();

/**
 * Listeners fire whenever a picture is uploaded/removed — every
 * `useOwnAvatar` consumer refetches, so the navbar, the menu and the
 * profile tab all show the new picture without a reload.
 */
const listeners = new Set<() => void>();

function revoke(userId: string) {
  const cached = urlCache.get(userId);
  if (cached) {
    URL.revokeObjectURL(cached);
    urlCache.delete(userId);
  }
}

/** Call after uploading/deleting the picture so every consumer refetches. */
export function invalidateAvatar(userId?: string) {
  if (userId) revoke(userId);
  else for (const id of urlCache.keys()) revoke(id);
  for (const listener of listeners) listener();
}

/**
 * The signed-in user's picture as an objectURL, or null when none exists
 * (callers render the initials avatar) / the lookup failed.
 */
export function fetchOwnAvatar(token: string, userId: string): Promise<string | null> {
  const cached = urlCache.get(userId);
  if (cached) return Promise.resolve(cached);
  return fetch(`${API_URL}/auth/profile/avatar`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => (res.ok ? res.blob() : null))
    .then((blob) => {
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urlCache.set(userId, url);
      return url;
    })
    .catch(() => null);
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
 * `uploads/` folder and the 2MB server limit stay comfortable. Draws on a
 * white background first — transparent PNGs would otherwise come out black.
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
