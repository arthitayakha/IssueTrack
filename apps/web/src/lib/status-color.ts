import type { Theme } from "@mui/material/styles";

/**
 * Resolve a board/status color.
 *
 * Colors come from the `issue_statuses.color` column — either a raw "#rrggbb"
 * value or a palette name ("yellow", "orange", …). Deriving the color from
 * that column instead of the status *name* is what keeps a status that was
 * renamed to Thai (Backlog → รอรับเรื่อง) looking the same as before; the old
 * lookup keyed off the English name and silently fell back to gray.
 *
 * `name` stays as the fallback for rows saved before `color` existed.
 */
export function resolveStatusColor(
  theme: Theme,
  color?: string | null,
  name?: string | null,
): string {
  const raw = color?.trim();
  if (raw) {
    if (raw.startsWith("#")) return raw;
    const palette = theme.custom.labelColors as Record<string, string | undefined>;
    const named = palette[raw.toLowerCase()];
    if (named) return named;
  }

  const key = name?.trim().toLowerCase();
  if (key) {
    const byName = theme.custom.columnColors as Record<string, string | undefined>;
    if (byName[key]) return byName[key] as string;
    if (key.includes("backlog")) return theme.custom.columnColors.backlog;
    if (key.includes("todo")) return theme.custom.columnColors.todo;
    if (key.includes("doing")) return theme.custom.columnColors.doing;
    if (key.includes("done")) return theme.custom.columnColors.done;
    if (key.includes("review")) return theme.custom.columnColors.review;
  }

  return theme.custom.columnColors.default;
}
