/**
 * Labels for an action's config keys, shared by the action picker (step ②)
 * and the review screen (step ③) so the wording can never drift apart.
 *
 * `t` is next-intl's translator — typed loosely so this module stays a plain
 * helper instead of importing the hook.
 */
export type TranslateFn = (key: string) => string;

export function getParamLabel(t: TranslateFn, key: string): string {
  switch (key) {
    case "reason":
      return t("reason");
    case "target":
      return t("target");
    case "message":
      return t("message");
    case "targetStatus":
      return t("paramTargetStatus");
    case "position":
      return t("paramPosition");
    case "priority":
      return t("paramPriority");
    case "category":
      return t("paramCategory");
    case "label":
      return t("paramLabel");
    case "minutes":
      return t("paramMinutes");
    case "text":
      return t("paramComment");
    default:
      return key;
  }
}
