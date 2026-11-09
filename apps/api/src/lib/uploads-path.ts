import { resolve } from "path";

/**
 * The one and only uploads folder (issue attachments live here — profile
 * pictures no longer touch disk at all, they sit in `users.avatar_data`).
 *
 * Anchored to THIS package instead of `process.cwd()`: the API gets started
 * from the repo root, from `apps/api`, from a worktree… and every different
 * working directory used to mean a *different* `uploads/` folder — files
 * written by one run were invisible (404) to the next one.
 *
 *   src/lib  → apps/api/uploads   (dev, `node --watch` + ts-node)
 *   dist/lib → apps/api/uploads   (build) — the same place, always.
 *
 * `UPLOADS_DIR` overrides it for deployments that keep uploads on a volume.
 */
const override = process.env.UPLOADS_DIR?.trim();

export const UPLOADS_DIR = override
  ? resolve(override)
  : resolve(__dirname, "..", "..", "uploads");
