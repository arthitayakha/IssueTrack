"use client";

import { useState } from "react";
import { useTheme } from "@mui/material";
import { Box, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import BoltIcon from "@mui/icons-material/Bolt";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { useTranslations } from "next-intl";
import {
  RULE_ACTION_CATEGORIES,
  getActionByKey,
  getActionsForTrigger,
  isRecommendedAction,
} from "@kanban/shared";
import type { ReferenceData } from "./reference-data";

interface ActionPickerProps {
  triggerKey: string | null;
  templateKey: string | null;
  actionKey: string | null;
  actionConfig: Record<string, string>;
  refs: ReferenceData;
  onActionChange: (key: string) => void;
  onConfigChange: (key: string, value: string) => void;
}

const NOTIFY_TARGETS = ["assignee", "reporter", "admins", "custom"] as const;

type ParamSchema = { type: string; required?: boolean; maxLength?: number };

export default function ActionPicker({
  triggerKey,
  templateKey,
  actionKey,
  actionConfig,
  refs,
  onActionChange,
  onConfigChange,
}: ActionPickerProps) {
  const t = useTranslations("Automation.wizard");
  const theme = useTheme();
  // reopening step ② must land on the tab holding the picked action, not tab 1
  const [category, setCategory] = useState<string>(() => {
    const selected = actionKey ? getActionByKey(actionKey) : undefined;
    return selected?.category ?? RULE_ACTION_CATEGORIES[0].key;
  });

  // only actions that fit the chosen trigger are offered at all
  const actionsForTrigger = getActionsForTrigger(triggerKey);
  const visibleCategories = RULE_ACTION_CATEGORIES.filter((cat) =>
    actionsForTrigger.some((a) => a.category === cat.key),
  );
  // a trigger change can leave the picked tab without actions → fall back to the first one
  const activeCategory = visibleCategories.some((c) => c.key === category)
    ? category
    : (visibleCategories[0]?.key ?? category);

  const actions = actionsForTrigger
    .filter((a) => a.category === activeCategory)
    .sort((a, b) => Number(isRecommendedAction(triggerKey, b.key)) - Number(isRecommendedAction(triggerKey, a.key)));

  function iconFor(key: string) {
    const color = theme.palette.primary.main;
    switch (key) {
      case "issue.lock":
        return <LockIcon fontSize="small" sx={{ color }} />;
      case "issue.unlock":
        return <LockOpenIcon fontSize="small" sx={{ color }} />;
      case "notify":
        return <NotificationsIcon fontSize="small" sx={{ color: theme.palette.warning.main }} />;
      default:
        return <BoltIcon fontSize="small" sx={{ color }} />;
    }
  }

  function targetLabel(key: string): string {
    switch (key) {
      case "assignee":
        return t("targetAssignee");
      case "reporter":
        return t("targetReporter");
      case "admins":
        return t("targetAdmins");
      default:
        return t("targetCustom");
    }
  }

  function paramLabel(key: string): string {
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

  /**
   * Action card description — the new-card → move-to-status pair reads as the
   * default-status hint; every other action keeps its standard wording.
   */
  function actionDescription(action: { key: string; description: { th: string } }): string {
    const isDefaultStatusPair =
      triggerKey === "issue.created" && templateKey === "created_any" && action.key === "issue.move_status";
    return isDefaultStatusPair ? t("defaultStatusHint") : action.description.th;
  }

  /**
   * Action card title — reads as "default status" only for the
   * new-card → move-to-status pair; other triggers keep the generic name.
   */
  function actionTitle(key: string, fallback: string): string {
    const isDefaultStatusPair =
      triggerKey === "issue.created" && templateKey === "created_any" && key === "issue.move_status";
    return isDefaultStatusPair ? t("defaultStatusActionLabel") : fallback;
  }

  function renderParamControl(key: string, schema: ParamSchema) {
    const required = schema.required ?? false;
    const label = `${paramLabel(key)}${required ? " *" : ""}`;
    const value = actionConfig[key] ?? "";
    const onChange = (next: string) => onConfigChange(key, next);

    // label and dropdown share one line, like the sentence rows in step ①
    const selectRow = (options: Array<{ value: string; label: string }>) => (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
        <Typography
          component="span"
          variant="body2"
          sx={{ color: theme.palette.navy.main, whiteSpace: "nowrap" }}
        >
          {label}
        </Typography>
        <TextField
          select
          size="small"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">{t("selectOption")}</MenuItem>
          {options.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>
    );

    switch (schema.type) {
      case "status":
        return selectRow(refs.statuses.map((s) => ({ value: String(s.id), label: s.name })));
      case "user":
        return selectRow(refs.users.map((u) => ({ value: String(u.id), label: u.name })));
      case "position":
        return selectRow(refs.positions.map((p) => ({ value: String(p.id), label: p.name })));
      case "priority":
        return selectRow(refs.priorities.map((p) => ({ value: String(p.id), label: p.name })));
      case "category":
        return selectRow(refs.categories.map((c) => ({ value: String(c.id), label: c.name })));
      case "label":
        return selectRow(refs.labels.map((l) => ({ value: String(l.id), label: l.name })));
      case "notify_target":
        return selectRow(NOTIFY_TARGETS.map((opt) => ({ value: opt, label: targetLabel(opt) })));
      case "number":
        return (
          <TextField
            size="small"
            type="number"
            label={label}
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            sx={{ maxWidth: 200 }}
            inputProps={{ min: 1 }}
          />
        );
      case "text":
        return (
          <TextField
            size="small"
            label={label}
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            multiline
            minRows={2}
            placeholder={key === "message" ? t("messagePlaceholder") : undefined}
            inputProps={{ maxLength: schema.maxLength }}
            sx={{ maxWidth: 480 }}
          />
        );
      default:
        return (
          <TextField
            size="small"
            label={label}
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={key === "reason" ? t("reasonPlaceholder") : undefined}
            inputProps={{ maxLength: schema.maxLength }}
            sx={{ maxWidth: 480 }}
          />
        );
    }
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {t("step2Intro")}
      </Typography>

      <Tabs value={activeCategory} onChange={(_e, v) => setCategory(v as string)}>
        {visibleCategories.map((cat) => (
          <Tab key={cat.key} value={cat.key} label={cat.label.th} />
        ))}
      </Tabs>

      {/* full-width rows — title line + description line */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 1.5 }}>
        {actions.map((action) => {
          const isSelected = action.key === actionKey;
          return (
            <Box
              key={action.key}
              onClick={() => onActionChange(action.key)}
              sx={{
                p: 1.5,
                borderRadius: 1.5,
                cursor: "pointer",
                border: "1px solid",
                borderColor: isSelected ? "primary.main" : "divider",
                // selected = white card + blue border (no tint), like the trigger rows
                bgcolor: "background.paper",
                "&:hover": { bgcolor: isSelected ? "background.paper" : "action.hover" },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                {iconFor(action.key)}
                <Typography variant="body2" fontWeight={600} sx={{ color: theme.palette.navy.main }}>
                  {actionTitle(action.key, action.label.th)}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {actionDescription(action)}
              </Typography>

              {isSelected && (
                <Box sx={{ mt: 1.5 }}>
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                    {action.configSchema ? (
                      Object.entries(action.configSchema).map(([key, schema]) => renderParamControl(key, schema))
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        {t("noParams")}
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
