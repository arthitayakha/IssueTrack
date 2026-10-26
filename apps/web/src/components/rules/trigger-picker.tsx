"use client";

import { useState } from "react";
import { useTheme } from "@mui/material";
import { Box, MenuItem, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useTranslations } from "next-intl";
import {
  RULE_TRIGGER_CATEGORIES,
  getTriggerByKey,
  getTriggersByCategory,
  type RuleFieldType,
  type RuleTemplateDef,
  type RuleTriggerDef,
} from "@kanban/shared";
import type { ReferenceData } from "./reference-data";

export interface SlotValues {
  [slotName: string]: string;
}

/**
 * Slot values are namespaced per trigger + template. Without this, activating
 * a row clears every value — which can land *after* a value picked from the
 * dropdown in the same tick and wipe it out ("select → box stays empty").
 */
export function slotKey(triggerKey: string | null, templateKey: string | null, slot: string): string {
  return `${triggerKey ?? ""}:${templateKey ?? ""}:${slot}`;
}

interface TriggerPickerProps {
  triggerKey: string | null;
  templateKey: string | null;
  slotValues: SlotValues;
  refs: ReferenceData;
  onTriggerChange: (triggerKey: string, templateKey?: string) => void;
  onSlotChange: (slot: string, value: string) => void;
}

export default function TriggerPicker({
  triggerKey,
  templateKey,
  slotValues,
  refs,
  onTriggerChange,
  onSlotChange,
}: TriggerPickerProps) {
  const t = useTranslations("Automation.wizard");
  const theme = useTheme();
  // reopening step ① must land on the tab holding the picked trigger, not tab 1
  const [category, setCategory] = useState<string>(() => {
    const selected = triggerKey ? getTriggerByKey(triggerKey) : undefined;
    return selected?.category ?? RULE_TRIGGER_CATEGORIES[0].key;
  });

  const triggers = getTriggersByCategory(category);

  function optionsFor(type: RuleFieldType): Array<{ value: string; label: string }> | null {
    switch (type) {
      case "status":
        return refs.statuses.map((s) => ({ value: String(s.id), label: s.name }));
      case "priority":
        return refs.priorities.map((p) => ({ value: String(p.id), label: p.name }));
      case "category":
        return refs.categories.map((c) => ({ value: String(c.id), label: c.name }));
      case "user":
        return refs.users.map((u) => ({ value: String(u.id), label: u.name }));
      case "position":
        return refs.positions.map((p) => ({ value: String(p.id), label: p.name }));
      case "role":
        return refs.roles.map((r) => ({ value: r, label: r }));
      case "label":
        return refs.labels.map((l) => ({ value: String(l.id), label: l.name }));
      default:
        return null;
    }
  }

  function renderValueInput(
    type: RuleFieldType,
    value: string,
    onChange: (next: string) => void,
    includeAll: boolean,
    label?: string,
    compact?: boolean,
  ) {
    const options = optionsFor(type);
    const width = compact ? 150 : 180;
    const controlRadius = compact ? { borderRadius: 1 } : {};
    if (options) {
      return (
        <TextField
          select
          size="small"
          label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          sx={{ minWidth: width, "& .MuiOutlinedInput-root": controlRadius }}
        >
          {includeAll && <MenuItem value="">{t("allOption")}</MenuItem>}
          {options.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      );
    }
    return (
      <TextField
        size="small"
        type={type === "number" ? "number" : "text"}
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{
          minWidth: width,
          maxWidth: compact ? 240 : undefined,
          "& .MuiOutlinedInput-root": controlRadius,
        }}
      />
    );
  }

  /**
   * Render a sentence with its slot inputs embedded inline, e.g.
   * "เมื่อการ์ดถูกลากไปยัง [ ▼ เลือกสถานะ ]" (Trello-style).
   * `tk` is needed so a dropdown click can select the row without bubbling
   * into the row/template click handlers (which reset slot values).
   */
  function sentenceNodes(tk: RuleTriggerDef, tp: RuleTemplateDef) {
    const parts = tp.text.th.split(/\{(\w+)\}/);
    const used = new Set<string>();

    const inlineInput = (slotName: string, type: RuleFieldType) => {
      const id = slotKey(tk.key, tp.key, slotName);
      return (
        <Box
          key={`${tp.key}-${slotName}`}
          onMouseDown={() => {
            // MUI Select opens on mousedown — activate the row right then, so the
            // pick that follows never runs against a row that is still inactive
            onTriggerChange(tk.key, tp.key);
          }}
          onClick={(e) => {
            // picking a value must never reach the row handler with a stale selection
            e.stopPropagation();
            // no-op when this row is already active, so values are kept
            onTriggerChange(tk.key, tp.key);
          }}
          sx={{ display: "inline-flex", verticalAlign: "middle", mx: 0.75 }}
        >
          {renderValueInput(type, slotValues[id] ?? "", (next) => onSlotChange(id, next), true, undefined, true)}
        </Box>
      );
    };

    const nodes = parts.map((part, index) => {
      if (index % 2 === 1) {
        const slot = tp.slots.find((s) => s.name === part);
        if (slot) {
          used.add(slot.name);
          return inlineInput(slot.name, slot.type);
        }
      }
      if (!part) return null;
      return (
        <Typography
          key={`${tp.key}-t${index}`}
          component="span"
          variant="body2"
          sx={{ color: theme.palette.navy.main }}
        >
          {part}
        </Typography>
      );
    });

    // a slot that never appears in the sentence still needs an input
    for (const slot of tp.slots) {
      if (used.has(slot.name)) continue;
      nodes.push(inlineInput(slot.name, slot.type));
    }

    return nodes;
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("step1Intro")}
      </Typography>

      {/* category tabs */}
      <Tabs value={category} onChange={(_e, v) => setCategory(v as string)}>
        {RULE_TRIGGER_CATEGORIES.map((cat) => (
          <Tab key={cat.key} value={cat.key} label={cat.label.th} />
        ))}
      </Tabs>

      {/* trigger list — one sentence per row; each row picks trigger + template */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mt: 2 }}>
        {triggers.flatMap((tk) =>
          tk.templates.map((tp) => {
            const active = tk.key === triggerKey && tp.key === templateKey;
            return (
              <Box
                key={`${tk.key}-${tp.key}`}
                onClick={() => onTriggerChange(tk.key, tp.key)}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: active ? "primary.main" : "divider",
                  bgcolor: "background.paper",
                  "&:hover": { bgcolor: active ? "background.paper" : "action.hover" },
                }}
              >
                {sentenceNodes(tk, tp)}
              </Box>
            );
          }),
        )}
      </Box>

    </Box>
  );
}
