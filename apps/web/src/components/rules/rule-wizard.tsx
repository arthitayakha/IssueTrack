"use client";

import { useEffect, useState } from "react";
import { Box, Button, Step, StepLabel, Stepper } from "@mui/material";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import {
  buildRuleSentence,
  getActionByKey,
  getTriggerByKey,
  getFieldLabel,
  isActionCompatible,
  isDropdownFieldType,
  type RuleOperator,
} from "@kanban/shared";
import { fetchCategories, fetchPositions, fetchPriorities, fetchStatuses, fetchUsers } from "@/lib/board-api";
import { fetchLabels } from "@/lib/labels-api";
import TriggerPicker, { slotKey, type SlotValues } from "./trigger-picker";
import ActionPicker from "./action-picker";
import RuleReview from "./rule-review";
import { EMPTY_REFERENCES, type ReferenceData } from "./reference-data";

/** A single condition derived from the values typed into the sentence. */
interface RuleConditionRow {
  field: string;
  operator: RuleOperator;
  value: string;
  position?: number;
}

async function fetchRoleNames(token: string | null): Promise<string[]> {
  try {
    const res = await apiFetch<{ data?: Array<{ name: string }> } | Array<{ name: string }>>(
      "/roles?page=1&limit=100",
      {},
      token,
    );
    const list = Array.isArray(res) ? res : (res.data ?? []);
    return list.length > 0 ? list.map((r) => r.name) : EMPTY_REFERENCES.roles;
  } catch {
    return EMPTY_REFERENCES.roles;
  }
}

export default function RuleWizard() {
  const t = useTranslations("Automation.wizard");
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const [refs, setRefs] = useState<ReferenceData>(EMPTY_REFERENCES);
  const [step, setStep] = useState(0);

  const [triggerKey, setTriggerKey] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [slotValues, setSlotValues] = useState<SlotValues>({});

  const [actionKey, setActionKey] = useState<string | null>(null);
  const [actionConfig, setActionConfig] = useState<Record<string, string>>({});

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(5);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      fetchStatuses(),
      fetchUsers(),
      fetchPositions(),
      fetchPriorities(),
      fetchCategories(),
      fetchLabels(),
      fetchRoleNames(token),
    ]).then((results) => {
      if (cancelled) return;
      const [statuses, users, positions, priorities, categories, labels, roles] = results;
      setRefs({
        statuses: statuses.status === "fulfilled" ? statuses.value.data : [],
        users: users.status === "fulfilled" ? users.value.data : [],
        positions: positions.status === "fulfilled" ? positions.value.data : [],
        priorities: priorities.status === "fulfilled" ? priorities.value.data : [],
        categories: categories.status === "fulfilled" ? categories.value.data : [],
        labels: labels.status === "fulfilled" ? labels.value.data : [],
        roles: roles.status === "fulfilled" ? roles.value : EMPTY_REFERENCES.roles,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const trigger = triggerKey ? getTriggerByKey(triggerKey) : undefined;
  const template = trigger?.templates.find((tp) => tp.key === templateKey);
  const action = actionKey ? getActionByKey(actionKey) : undefined;

  function handleTriggerChange(key: string, tplKey?: string) {
    const nextTemplate = tplKey ?? getTriggerByKey(key)?.templates[0]?.key ?? null;
    // re-picking the row that is already active (e.g. a dropdown click) must keep values
    if (key === triggerKey && nextTemplate === templateKey) return;
    setTriggerKey(key);
    setTemplateKey(nextTemplate);
    // slot values are keyed per trigger+template (slotKey) — no wipe here, otherwise
    // a reset landing in the same batch as a dropdown pick erases the picked value
    // drop an action that no longer makes sense for the new trigger
    if (actionKey && !isActionCompatible(key, actionKey)) {
      setActionKey(null);
      setActionConfig({});
    }
  }

  function handleActionChange(key: string) {
    if (key === actionKey) return;
    setActionKey(key);
    setActionConfig({});
  }

  // conditions always come from the values typed into the sentence (no advanced mode)
  function buildConditions(): RuleConditionRow[] {
    if (!template) return [];
    return template.slots
      .map((slot, index) => ({
        field: slot.field,
        operator: "=" as RuleOperator,
        value: slotValues[slotKey(triggerKey, templateKey, slot.name)] ?? "",
        position: index,
      }))
      .filter((c) => c.value !== "");
  }

  function buildActionConfig(): Record<string, string> {
    if (!action?.configSchema) return {};
    const out: Record<string, string> = {};
    for (const key of Object.keys(action.configSchema)) {
      out[key] = actionConfig[key] ?? "";
    }
    return out;
  }

  function resolveValue(field: string, value: unknown): string {
    if (value == null) return "";
    const raw = String(value);
    if (field === "to_status" || field === "from_status" || field === "status") {
      return refs.statuses.find((s) => s.id === Number(value))?.name ?? raw;
    }
    if (field === "to_assignee") {
      return refs.positions.find((p) => p.id === Number(value))?.name ?? raw;
    }
    if (
      field === "from_assignee" ||
      field === "reporter" ||
      field === "comment_author" ||
      field === "attachment_author" ||
      field === "assignee"
    ) {
      return refs.users.find((u) => u.id === String(value))?.name ?? raw;
    }
    if (field === "priority" || field === "old_priority") {
      return refs.priorities.find((p) => p.id === Number(value))?.name ?? raw;
    }
    if (field === "category" || field === "old_category") {
      return refs.categories.find((c) => c.id === Number(value))?.name ?? raw;
    }
    if (field === "label") {
      return refs.labels.find((l) => String(l.id) === raw)?.name ?? raw;
    }
    return raw;
  }

  function stepError(current: number): string | null {
    if (current === 0) {
      if (!trigger) return t("errTrigger");
      if (!templateKey) return t("errTemplate");
      // every dropdown in the sentence must be picked (free text / number slots stay optional)
      const missingDropdown = template?.slots.some(
        (slot) =>
          isDropdownFieldType(slot.type) &&
          !(slotValues[slotKey(triggerKey, templateKey, slot.name)] ?? "").trim(),
      );
      if (missingDropdown) return t("errRequired");
      return null;
    }
    if (current === 1) {
      if (!action) return t("errAction");
      if (action.status === "unsupported") return t("errUnsupported");
      if (action.configSchema) {
        for (const [key, schema] of Object.entries(action.configSchema)) {
          if (schema.required && !(actionConfig[key] ?? "").trim()) {
            if (key === "reason") return t("errReason");
            if (key === "target") return t("errTarget");
            return t("errRequired");
          }
        }
      }
      return null;
    }
    if (!name.trim()) return t("errName");
    return null;
  }

  const builtConditions = buildConditions();
  const conditionRows = builtConditions.map((c) => ({
    label: getFieldLabel(c.field),
    operator: String(c.operator),
    value: resolveValue(c.field, c.value) || "—",
  }));
  const sentence = trigger && templateKey ? buildRuleSentence(trigger.key, templateKey, builtConditions, resolveValue) : null;
  const summaryWhen = sentence?.th || trigger?.label.th || t("noTrigger");
  const summaryThen = action
    ? `${action.label.th}${actionConfig.reason ? ` (${actionConfig.reason})` : ""}`
    : t("noAction");

  const payload = JSON.stringify(
    {
      name: name || null,
      description: description || null,
      triggerKey,
      templateKey,
      category: trigger?.category ?? null,
      actionKey,
      actionConfig: buildActionConfig(),
      conditions: builtConditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
        position: c.position ?? 0,
      })),
      priority,
      isActive,
      stopOnError: false,
    },
    null,
    2,
  );

  const error = stepError(step);
  const steps = [t("step1"), t("step2"), t("step3")];

  return (
    <Box>
      <Stepper activeStep={step} sx={{ mb: 3, maxWidth: 800, mx: "auto" }}>
        {steps.map((label, index) => (
          <Step
            key={label}
            // only steps already passed can be clicked to jump back
            onClick={index < step ? () => setStep(index) : undefined}
            sx={{ cursor: index < step ? "pointer" : "default" }}
          >
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, p: { xs: 2, sm: 2.5 } }}>
        {step === 0 && (
          <TriggerPicker
            triggerKey={triggerKey}
            templateKey={templateKey}
            slotValues={slotValues}
            refs={refs}
            onTriggerChange={handleTriggerChange}
            onSlotChange={(slot, value) => setSlotValues((prev) => ({ ...prev, [slot]: value }))}
          />
        )}

        {step === 1 && (
          <ActionPicker
            triggerKey={triggerKey}
            templateKey={templateKey}
            actionKey={actionKey}
            actionConfig={actionConfig}
            refs={refs}
            onActionChange={handleActionChange}
            onConfigChange={(key, value) => setActionConfig((prev) => ({ ...prev, [key]: value }))}
          />
        )}

        {step === 2 && (
          <RuleReview
            summaryWhen={summaryWhen}
            summaryThen={summaryThen}
            conditionRows={conditionRows}
            name={name}
            description={description}
            priority={priority}
            isActive={isActive}
            payload={payload}
            onNameChange={setName}
            onDescriptionChange={setDescription}
            onPriorityChange={setPriority}
            onIsActiveChange={setIsActive}
          />
        )}
      </Box>

      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          mt: 2.5,
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Button variant="text" onClick={() => router.push("/automation")}>
          {t("cancel")}
        </Button>
        <Button
          variant="contained"
          disabled={error != null}
          onClick={() => setStep(Math.min(step + 1, steps.length - 1))}
        >
          {t("next")}
        </Button>
      </Box>
    </Box>
  );
}
