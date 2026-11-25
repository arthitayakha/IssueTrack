import type { AppNotification } from "./notifications-api";

/** The three sentence shapes the inbox row and the live toast share. */
export type NotificationVariant = "stale" | "system" | "actor";

/** `useTranslations("Notifications")` is structurally this function. */
export type Translate = (key: string) => string;

/** Every action with a `Notifications.actions.*` key in both message files. */
const LABELLED_ACTIONS = [
  "created",
  "assigned",
  "unassigned",
  "commented",
  "moved",
  "needs_assignment",
  "status_pending",
  "in_progress",
  "completed",
  "edited",
  "deleted",
  "restored",
  "rule_created",
  "rule_updated",
  "rule_deleted",
  "stale",
  "app_expiring",
  "app_expired",
  "ma_depleted",
  "contract_ma_remaining",
  "app_renewed",
  "app_hours_purchased",
  "contact_message",
] as const;

/** Rows with no human actor — the subject is the app/company, not "System". */
const SYSTEM_ACTIONS = new Set<string>([
  "app_expiring",
  "app_expired",
  "ma_depleted",
  "contract_ma_remaining",
  "app_renewed",
  "app_hours_purchased",
  "stale",
]);

/**
 * One label map for both surfaces. Derived once per render as plain strings so
 * a memoised inbox row can compare it without chasing a new object identity.
 */
export function getActionLabels(t: Translate): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const action of LABELLED_ACTIONS) labels[action] = t(`actions.${action}`);
  return labels;
}

/** Same variant split the popover used to own inline — now the toast agrees. */
export function getNotificationVariant(item: AppNotification): NotificationVariant {
  if (item.action === "stale") return "stale";
  if (SYSTEM_ACTIONS.has(item.action)) return "system";
  return "actor";
}

/** The lead-in (bold subject) of a sentence, shared by row and toast. */
export function notificationSubject(item: AppNotification, variant: NotificationVariant): string {
  return variant === "actor" ? item.actorName ?? "System" : item.target;
}
