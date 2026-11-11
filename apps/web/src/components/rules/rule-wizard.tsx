"use client";

import { useEffect, useState } from "react";
import { Box, Alert, Button, Step, StepLabel, Stepper } from "@mui/material";
import { useTranslations } from "next-intl";
import { apiFetch, isApiError } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import {
  buildRuleSentence,
  getActionByKey,
  getTriggerByKey,
  getFieldLabel,
  isActionCompatible,
  isDropdownFieldType,
  ruleSignature,
  type RuleDto,
  type RuleOperator,
} from "@kanban/shared";
import { fetchCategories, fetchPositions, fetchPriorities, fetchStatuses, fetchUsers } from "@/lib/board-api";
import { fetchLabels } from "@/lib/labels-api";
import { useNotification } from "@/components/notification";
import { createRule, fetchRules, updateRule, type RulePayload } from "@/lib/rules-api";
import TriggerPicker, { slotKey, type SlotValues } from "./trigger-picker";
import ActionPicker from "./action-picker";
import RuleReview from "./rule-review";
import { EMPTY_REFERENCES, type ReferenceData } from "./reference-data";
import { getParamLabel } from "./param-labels";

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

/** Prefill the sentence slots from a stored rule so edit mode opens with its values. */
function slotValuesFromRule(rule?: RuleDto): SlotValues {
  if (!rule) return {};
  const tpl = getTriggerByKey(rule.triggerKey)?.templates.find((tp) => tp.key === rule.templateKey);
  if (!tpl) return {};
  const values: SlotValues = {};
  for (const cond of rule.conditions) {
    const slot = tpl.slots.find((s) => s.field === cond.field);
    if (slot) values[slotKey(rule.triggerKey, rule.templateKey, slot.name)] = String(cond.value ?? "");
  }
  return values;
}

interface RuleWizardProps {
  /** undefined = สร้างกฎใหม่; มีค่า = แก้ไขกฎนั้น (prefill ทุกช่องจาก rule เดิม) */
  initialRule?: RuleDto;
  /** ปิด wizard — เจ้าของ (ป๊อปอัพ) เป็นคนกำหนดว่าปิดแล้วไปไหน */
  onClose: () => void;
  /** ยิงหลังบันทึกสำเร็จ — ให้ host (RulesPanel) รีเฟรชรายการกฎ */
  onSaved?: () => void;
}

/**
 * Fully wired to POST/PUT /rules — the button stays disabled with its
 * "backend not connected" tooltip until the rules API lands.
 * ทางเข้าเดียวตอนนี้คือ `RuleWizardDialog` (ปุ่ม "สร้างกฎ"/"แก้ไข" ในแท็บ
 * ระบบอัตโนมัติของ /master-data) — หน้า `/automation/new` กับ `/automation/[id]`
 * ถูกถอดเป็น redirect ไปแท็บนั้นแล้ว
 */
export default function RuleWizard({ initialRule, onClose, onSaved }: RuleWizardProps) {
  const t = useTranslations("Automation.wizard");
  const token = useAuthStore((s) => s.token);
  const { notify } = useNotification();

  const [refs, setRefs] = useState<ReferenceData>(EMPTY_REFERENCES);
  // the stored rules, used to spot a copy before Save (GET /rules — needs
  // automation.view; an empty list just means we fall back to the API's 409)
  const [existingRules, setExistingRules] = useState<RuleDto[]>([]);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [triggerKey, setTriggerKey] = useState<string | null>(initialRule?.triggerKey ?? null);
  const [templateKey, setTemplateKey] = useState<string | null>(initialRule?.templateKey ?? null);
  const [slotValues, setSlotValues] = useState<SlotValues>(() => slotValuesFromRule(initialRule));

  const [actionKey, setActionKey] = useState<string | null>(initialRule?.actionKey ?? null);
  const [actionConfig, setActionConfig] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initialRule?.actionConfig ?? {}).map(([k, v]) => [k, String(v)])),
  );

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
      fetchRules(),
    ]).then((results) => {
      if (cancelled) return;
      const [statuses, users, positions, priorities, categories, labels, roles, rules] = results;
      setRefs({
        statuses: statuses.status === "fulfilled" ? statuses.value.data : [],
        users: users.status === "fulfilled" ? users.value.data : [],
        positions: positions.status === "fulfilled" ? positions.value.data : [],
        priorities: priorities.status === "fulfilled" ? priorities.value.data : [],
        categories: categories.status === "fulfilled" ? categories.value.data : [],
        labels: labels.status === "fulfilled" ? labels.value.data : [],
        roles: roles.status === "fulfilled" ? roles.value : EMPTY_REFERENCES.roles,
      });
      // fail-open: no `automation.view` (or a flaky call) leaves the list empty
      // and the duplicate check below simply does not fire — POST /rules still
      // answers 409, so a copy can never be stored either way
      setExistingRules(rules.status === "fulfilled" ? rules.value : []);
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
      // every dropdown (and any slot marked required) must be picked —
      // plain free text / number slots stay optional
      const missingDropdown = template?.slots.some(
        (slot) =>
          (isDropdownFieldType(slot.type) || slot.required) &&
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
    // step ③ shows the summary only — nothing left to validate
    return null;
  }

  const builtConditions = buildConditions();

  /**
   * What we are about to save, stamped against the stored rules. Everything
   * that makes a rule itself goes into the signature — including the value
   * picked in the sentence's dropdown (`to_status` etc.), which is why the
   * same trigger + action with ANOTHER status is not a copy and can be added.
   * A rule never collides with the one being edited (`initialRule`).
   */
  const payloadSignature = ruleSignature({
    triggerKey: triggerKey ?? "",
    templateKey,
    actionKey: actionKey ?? "",
    actionConfig,
    conditions: builtConditions,
  });
  const duplicateRule = existingRules.find(
    (rule) => rule.id !== initialRule?.id && ruleSignature(rule) === payloadSignature,
  );
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

  /** Action config values as human text for the step ③ "action" block. */
  function resolveConfigValue(key: string, value: string): string {
    switch (key) {
      case "targetStatus":
        return refs.statuses.find((s) => s.id === Number(value))?.name ?? value;
      case "position":
        return refs.positions.find((p) => p.id === Number(value))?.name ?? value;
      case "priority":
        return refs.priorities.find((p) => p.id === Number(value))?.name ?? value;
      case "category":
        return refs.categories.find((c) => c.id === Number(value))?.name ?? value;
      case "label":
        return refs.labels.find((l) => String(l.id) === value)?.name ?? value;
      default:
        return value;
    }
  }

  const actionParams = action?.configSchema
    ? Object.entries(action.configSchema)
        .filter(([key]) => (actionConfig[key] ?? "").trim() !== "")
        .map(([key]) => ({
          label: getParamLabel(t, key),
          value: resolveConfigValue(key, actionConfig[key] ?? ""),
        }))
    : [];

  const error = stepError(step);
  const steps = [t("step1"), t("step2"), t("step3")];

  /** Rule name is generated from the two summary sentences (kept ≤150 chars). */
  function buildRuleName(): string {
    const name = `${summaryWhen} → ${summaryThen}`;
    return name.length > 150 ? `${name.slice(0, 147)}…` : name;
  }

  function buildPayload(): RulePayload {
    return {
      name: buildRuleName(),
      triggerKey: triggerKey ?? "",
      templateKey,
      category: trigger?.category ?? "",
      actionKey: actionKey ?? "",
      actionConfig,
      conditions: builtConditions.map((c) => ({
        field: c.field,
        operator: c.operator,
        value: c.value,
        position: c.position,
      })),
      // editing must keep the rule's on/off state, creating starts active
      isActive: initialRule ? initialRule.isActive : true,
      stopOnError: initialRule ? initialRule.stopOnError : false,
    };
  }

  /**
   * บันทึกแล้วปิดป๊อปอัพ — `onSaved` ให้ host รีเฟรชรายการ; ถ้าไม่มี host
   * (ยังไม่เกิดขึ้น) ก็แค่ปิด
   */
  async function handleSave() {
    if (saving || !triggerKey || !actionKey) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      if (initialRule) await updateRule(initialRule.id, payload);
      else await createRule(payload);
      notify(t("saved"), "success");
      onSaved?.();
      onClose();
    } catch (err) {
      // 409 = the API found the same rule again (the list above could not be
      // read, e.g. no automation.view) — say it in Thai instead of server text
      notify(
        isApiError(err, 409)
          ? t("duplicateError")
          : err instanceof Error
            ? err.message
            : t("saveError"),
        "error",
      );
      setSaving(false);
    }
  }

  return (
    // flex column เต็มความสูงป๊อปอัพ (Dialog Paper ฟิก 680px) — กล่องเนื้อหา take
    // ส่วนที่เหลือ ส่วน footer (ยกเลิก/ถัดไป/บันทึก) อยู่นอกกล่อง → ติดขอบล่างเสมอ
    // ไม่จมหายตอนเนื้อหายาว (เดิมทั้งป๊อปอัพเลื่อนรวมกัน)
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* mt: 4 = 32px ห่างขอบ title — DialogContent ถูก MUI บังคับ padding-top: 0
          (.title + .content) ช่องว่างใต้หัวป๊อปอัพจึงต้องใส่ที่ Stepper เอง
          width: 100% — root เป็น flex column แล้ว `mx: "auto"` จะขวางไม่ให้ stretch
          → Stepper หดเหลือ fit-content แล้วเส้นเชื่อม (StepConnector flex:1) ไม่มีที่ยืด
         จนหาย + ขั้นมารวมกันตรงกลาง ใส่ width นี้คืนความกว้าง 800px เดิมให้เส้นกลับมา */}
      <Stepper activeStep={step} sx={{ mt: 4, mb: 3, width: "100%", maxWidth: 800, mx: "auto" }}>
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

      {/* flex:1 + overflow:auto — เนื้อหาที่ยาวกว่าพื้นที่ (เช่น การ์ดที่ถูกเลือกแล้วกาง
          ฟอร์มพารามิเตอร์) เลื่อน**ในกล่องนี้** แทนที่จะเลื่อนทั้งป๊อปอัพจนปุ่มจมหาย
          — display:flex column เพื่อให้ picker (trigger/action) ยืดกินความสูงที่เหลือ
          แล้ว**รายการข้างใน**เป็นคนเลื่อนเอง (ไม่ตัดที่ 4 ใบ ไม่เว้นว่างตาย) */}
      <Box
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          p: { xs: 2, sm: 2.5 },
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
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
            actionParams={actionParams}
          />
        )}
      </Box>

      {duplicateRule && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {t("duplicate", { name: duplicateRule.name })}
        </Alert>
      )}

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
        <Button variant="text" onClick={onClose}>
          {t("cancel")}
        </Button>
        {step < steps.length - 1 ? (
          <Button
            variant="contained"
            disabled={error != null}
            onClick={() => setStep(Math.min(step + 1, steps.length - 1))}
          >
            {t("next")}
          </Button>
        ) : (
          <Button
            variant="contained"
            // a copy cannot be saved — the Alert above says which rule it is
            disabled={saving || Boolean(duplicateRule)}
            onClick={handleSave}
          >
            {initialRule ? t("saveEdit") : t("save")}
          </Button>
        )}
      </Box>
    </Box>
  );
}
