export type RuleFieldType =
  | "status"
  | "priority"
  | "user"
  | "position"
  | "role"
  | "label"
  | "category"
  | "text"
  | "number"
  | "boolean";

export type RuleOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "in"
  | "not_in"
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty";

export interface RuleFieldTypeDef {
  operators: RuleOperator[];
  many: boolean;
  numeric?: boolean;
}

export const RULE_FIELD_TYPES: Record<RuleFieldType, RuleFieldTypeDef> = {
  status: { operators: ["=", "!=", "in", "not_in"], many: false },
  priority: { operators: ["=", "!=", "in", "not_in"], many: false },
  user: { operators: ["=", "!=", "in", "not_in"], many: false },
  position: { operators: ["=", "!=", "in", "not_in"], many: false },
  role: { operators: ["=", "!=", "in", "not_in"], many: false },
  category: { operators: ["=", "!=", "in", "not_in"], many: false },
  label: { operators: ["contains", "not_contains", "is_empty", "is_not_empty"], many: true },
  text: { operators: ["=", "!=", "contains", "not_contains", "is_empty", "is_not_empty"], many: false },
  number: { operators: ["=", "!=", ">", ">=", "<", "<="], many: false, numeric: true },
  boolean: { operators: ["=", "!="], many: false },
};

/** Field types the wizard renders as a dropdown — the rest are free text / number inputs. */
const DROPDOWN_FIELD_TYPES: RuleFieldType[] = [
  "status",
  "priority",
  "category",
  "user",
  "position",
  "role",
  "label",
];

export function isDropdownFieldType(type: RuleFieldType): boolean {
  return DROPDOWN_FIELD_TYPES.includes(type);
}

export interface RuleFieldDef {
  key: string;
  type: RuleFieldType;
  contextKey: string;
}

export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value: unknown;
  position?: number;
}

export interface RuleTemplateSlotDef {
  name: string;
  field: string;
  type: RuleFieldType;
}

export interface RuleTemplateDef {
  key: string;
  text: { th: string; en: string };
  slots: RuleTemplateSlotDef[];
}

export interface RuleTriggerDef {
  key: string;
  category: string;
  phase: "mvp" | "planned";
  label: { th: string; en: string };
  fields: RuleFieldDef[];
  templates: RuleTemplateDef[];
}

export type RuleActionStatus = "supported" | "unsupported";

export interface RuleActionDef {
  key: string;
  category: string;
  status: RuleActionStatus;
  label: { th: string; en: string };
  description: { th: string; en: string };
  configSchema?: Record<string, { type: string; required?: boolean; maxLength?: number }>;
}

export interface RuleDto {
  id: number;
  name: string;
  description: string | null;
  triggerKey: string;
  templateKey: string | null;
  category: string;
  actionKey: string;
  actionConfig: Record<string, unknown>;
  conditions: RuleCondition[];
  priority: number;
  isActive: boolean;
  stopOnError: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RuleContext {
  [key: string]: unknown;
}

export interface RuleTriggerCategoryDef {
  key: string;
  label: { th: string; en: string };
}

export const RULE_TRIGGER_CATEGORIES: RuleTriggerCategoryDef[] = [
  { key: "card_move", label: { th: "ย้าย & มอบหมายการ์ด", en: "Move & Assign" } },
  { key: "card_change", label: { th: "สร้าง · แก้ไข · ลบการ์ด", en: "Create · Edit · Delete" } },
  { key: "content", label: { th: "คอมเมนต์ & ไฟล์แนบ", en: "Comments & Files" } },
  { key: "timing", label: { th: "จับเวลา", en: "Time Tracking" } },
];

export const RULE_TRIGGERS: RuleTriggerDef[] = [
  {
    key: "issue.moved",
    category: "card_move",
    phase: "mvp",
    label: { th: "การ์ดถูกลาก", en: "Card moved" },
    fields: [
      { key: "to_status", type: "status", contextKey: "toStatusId" },
      { key: "actor_role", type: "role", contextKey: "actorRole" },
    ],
    templates: [
      { key: "moved_to", text: { th: "เมื่อการ์ดถูกลากไปยัง {status}", en: "When a card is moved to {status}" }, slots: [{ name: "status", field: "to_status", type: "status" }] },
    ],
  },
  {
    key: "issue.assigned",
    category: "card_move",
    phase: "mvp",
    label: { th: "การ์ดถูกมอบหมาย", en: "Card assigned" },
    fields: [
      { key: "to_assignee", type: "position", contextKey: "assigneePositionId" },
      { key: "actor_role", type: "role", contextKey: "actorRole" },
    ],
    templates: [
      { key: "assigned_to", text: { th: "เมื่อการ์ดถูกมอบหมายให้ {position}", en: "When a card is assigned to {position}" }, slots: [{ name: "position", field: "to_assignee", type: "position" }] },
    ],
  },
  {
    key: "issue.created",
    category: "card_change",
    phase: "mvp",
    label: { th: "สร้างการ์ดใหม่", en: "Card created" },
    fields: [
      { key: "status", type: "status", contextKey: "toStatusId" },
      { key: "priority", type: "priority", contextKey: "priorityId" },
      { key: "category", type: "category", contextKey: "categoryId" },
      { key: "reporter", type: "user", contextKey: "reporterId" },
      { key: "actor_role", type: "role", contextKey: "actorRole" },
    ],
    templates: [
      // status-less so the landing status can be configured as a rule
      // (e.g. "new card → move to X") instead of being hard-coded.
      { key: "created_any", text: { th: "เมื่อมีการ์ดใหม่ถูกสร้าง", en: "When a new card is created" }, slots: [] },
    ],
  },
  {
    key: "comment.created",
    category: "content",
    phase: "mvp",
    label: { th: "มีคอมเมนต์ใหม่", en: "New comment" },
    fields: [
      { key: "comment_author", type: "user", contextKey: "actorId" },
      { key: "actor_role", type: "role", contextKey: "actorRole" },
      { key: "status", type: "status", contextKey: "toStatusId" },
    ],
    templates: [
      { key: "comment_any", text: { th: "เมื่อมีคอมเมนต์ใหม่", en: "When a new comment is added" }, slots: [] },
    ],
  },
  {
    key: "attachment.created",
    category: "content",
    phase: "mvp",
    label: { th: "มีไฟล์ถูกแนบ", en: "File attached" },
    fields: [
      { key: "attachment_author", type: "user", contextKey: "actorId" },
      { key: "actor_role", type: "role", contextKey: "actorRole" },
    ],
    templates: [
      { key: "attachment_any", text: { th: "เมื่อมีไฟล์ถูกแนบ", en: "When a file is attached" }, slots: [] },
    ],
  },
  {
    key: "issue.title_changed",
    category: "card_change",
    phase: "planned",
    label: { th: "เปลี่ยนชื่อการ์ด", en: "Title changed" },
    fields: [
      { key: "title", type: "text", contextKey: "newValue" },
      { key: "old_title", type: "text", contextKey: "oldValue" },
    ],
    templates: [
      { key: "title_changed_to", text: { th: "เมื่อชื่อการ์ดเป็น {title}", en: "When the card title is {title}" }, slots: [{ name: "title", field: "title", type: "text" }] },
    ],
  },
  {
    key: "issue.description_changed",
    category: "card_change",
    phase: "planned",
    label: { th: "เปลี่ยนรายละเอียด", en: "Description changed" },
    fields: [
      { key: "description", type: "text", contextKey: "newValue" },
      { key: "old_description", type: "text", contextKey: "oldValue" },
    ],
    templates: [
      { key: "description_changed", text: { th: "เมื่อเปลี่ยนรายละเอียดการ์ด", en: "When the card description changes" }, slots: [] },
    ],
  },
  {
    key: "issue.priority_changed",
    category: "card_change",
    phase: "planned",
    label: { th: "เปลี่ยนความสำคัญ", en: "Priority changed" },
    fields: [
      { key: "priority", type: "priority", contextKey: "newValue" },
      { key: "old_priority", type: "priority", contextKey: "oldValue" },
    ],
    templates: [
      { key: "priority_changed_to", text: { th: "เมื่อความสำคัญเป็น {priority}", en: "When the priority is {priority}" }, slots: [{ name: "priority", field: "priority", type: "priority" }] },
    ],
  },
  {
    key: "issue.category_changed",
    category: "card_change",
    phase: "planned",
    label: { th: "เปลี่ยนหมวดหมู่", en: "Category changed" },
    fields: [
      { key: "category", type: "category", contextKey: "newValue" },
      { key: "old_category", type: "category", contextKey: "oldValue" },
    ],
    templates: [
      { key: "category_changed_to", text: { th: "เมื่อหมวดหมู่เป็น {category}", en: "When the category is {category}" }, slots: [{ name: "category", field: "category", type: "category" }] },
    ],
  },
  {
    key: "issue.deleted",
    category: "card_change",
    phase: "planned",
    label: { th: "ลบการ์ด", en: "Card deleted" },
    fields: [{ key: "status", type: "status", contextKey: "fromStatusId" }],
    templates: [
      { key: "deleted_any", text: { th: "เมื่อการ์ดถูกลบ", en: "When a card is deleted" }, slots: [] },
    ],
  },
  {
    key: "issue.restored",
    category: "card_change",
    phase: "planned",
    label: { th: "กู้คืนการ์ด", en: "Card restored" },
    fields: [{ key: "status", type: "status", contextKey: "toStatusId" }],
    templates: [
      { key: "restored_any", text: { th: "เมื่อการ์ดถูกกู้คืน", en: "When a card is restored" }, slots: [] },
    ],
  },
  {
    key: "work_session.started",
    category: "timing",
    phase: "planned",
    label: { th: "เริ่มจับเวลา", en: "Timer started" },
    fields: [
      { key: "status", type: "status", contextKey: "toStatusId" },
      { key: "assignee", type: "user", contextKey: "actorId" },
    ],
    templates: [
      { key: "timer_started", text: { th: "เมื่อเริ่มจับเวลา", en: "When the timer starts" }, slots: [] },
    ],
  },
  {
    key: "work_session.stopped",
    category: "timing",
    phase: "planned",
    label: { th: "หยุดจับเวลา", en: "Timer stopped" },
    fields: [
      { key: "status", type: "status", contextKey: "fromStatusId" },
      { key: "duration", type: "number", contextKey: "durationMinutes" },
    ],
    templates: [
      { key: "timer_stopped", text: { th: "เมื่อหยุดจับเวลา", en: "When the timer stops" }, slots: [] },
      { key: "timer_over", text: { th: "เมื่อหยุดจับเวลาแล้วใช้เวลาเกิน {minutes} นาที", en: "When the timer stops after more than {minutes} minutes" }, slots: [{ name: "minutes", field: "duration", type: "number" }] },
    ],
  },
];

export const RULE_ACTION_CATEGORIES: Array<{ key: string; label: { th: string; en: string } }> = [
  { key: "card", label: { th: "การ์ด & สถานะ", en: "Cards & Status" } },
  { key: "labels", label: { th: "ป้าย & หมวด & ลำดับ", en: "Labels, Categories & Priority" } },
  { key: "time", label: { th: "เวลา", en: "Time" } },
  { key: "content", label: { th: "เนื้อหา & แจ้งเตือน", en: "Content & Notifications" } },
];

export const RULE_ACTIONS: RuleActionDef[] = [
  // ── card & status ───────────────────────────────────────────────
  {
    key: "issue.lock",
    category: "card",
    status: "supported",
    label: { th: "ล็อกการ์ด", en: "Lock card" },
    description: { th: "ล็อกการ์ดนี้เพื่อไม่ให้แก้ไขหรือลากย้าย", en: "Lock the card so it cannot be edited or moved" },
    configSchema: { reason: { type: "string", required: false, maxLength: 500 } },
  },
  {
    key: "issue.unlock",
    category: "card",
    status: "supported",
    label: { th: "ปลดล็อกการ์ด", en: "Unlock card" },
    description: { th: "ปลดล็อกการ์ดที่ถูกล็อกอยู่", en: "Unlock a locked card" },
  },
  {
    key: "issue.move_status",
    category: "card",
    status: "supported",
    label: { th: "ย้ายการ์ดไปสถานะอื่น", en: "Move card to a status" },
    description: { th: "ย้ายการ์ดไปยังสถานะที่กำหนดโดยอัตโนมัติ", en: "Automatically move the card to a chosen status" },
    configSchema: { targetStatus: { type: "status", required: true } },
  },
  {
    key: "issue.assign",
    category: "card",
    status: "supported",
    label: { th: "มอบหมายการ์ด", en: "Assign card" },
    description: { th: "มอบหมายการ์ดให้ผู้ที่ถือตำแหน่งที่เลือก", en: "Assign the card to whoever holds the chosen position" },
    configSchema: { position: { type: "position", required: true } },
  },
  {
    key: "issue.unassign",
    category: "card",
    status: "supported",
    label: { th: "ถอดมอบหมาย", en: "Unassign card" },
    description: { th: "ลบผู้รับผิดชอบออกจากการ์ด", en: "Remove the assignee from the card" },
  },

  // ── labels, categories & priority ───────────────────────────────
  {
    key: "issue.add_label",
    category: "labels",
    status: "supported",
    label: { th: "เพิ่มป้ายกำกับ", en: "Add label" },
    description: { th: "เพิ่มป้ายกำกับให้การ์ด", en: "Add a label to the card" },
    configSchema: { label: { type: "label", required: true } },
  },
  {
    key: "issue.remove_label",
    category: "labels",
    status: "supported",
    label: { th: "ลบป้ายกำกับ", en: "Remove label" },
    description: { th: "เอาป้ายกำกับออกจากการ์ด", en: "Remove a label from the card" },
    configSchema: { label: { type: "label", required: true } },
  },
  {
    key: "issue.set_category",
    category: "labels",
    status: "supported",
    label: { th: "เปลี่ยนหมวดหมู่", en: "Set category" },
    description: { th: "เปลี่ยนหมวดหมู่ของการ์ด", en: "Change the card category" },
    configSchema: { category: { type: "category", required: true } },
  },
  {
    key: "issue.set_priority",
    category: "labels",
    status: "supported",
    label: { th: "เปลี่ยนความสำคัญ", en: "Set priority" },
    description: { th: "เปลี่ยนระดับความสำคัญของการ์ด", en: "Change the card priority" },
    configSchema: { priority: { type: "priority", required: true } },
  },

  // ── time ────────────────────────────────────────────────────────
  {
    key: "work_session.start",
    category: "time",
    status: "supported",
    label: { th: "เริ่มจับเวลา", en: "Start timer" },
    description: { th: "เริ่มจับเวลาให้ผู้รับผิดชอบ", en: "Start the timer for the assignee" },
  },
  {
    key: "work_session.stop",
    category: "time",
    status: "supported",
    label: { th: "หยุดจับเวลา", en: "Stop timer" },
    description: { th: "หยุดจับเวลาของการ์ด", en: "Stop the timer of the card" },
  },
  {
    key: "issue.set_time",
    category: "time",
    status: "supported",
    label: { th: "ตั้งเวลาแก้ไขจริง", en: "Set actual fix time" },
    description: { th: "บันทึกเวลาที่ใช้แก้ไขจริง (นาที)", en: "Record the actual fix duration in minutes" },
    configSchema: { minutes: { type: "number", required: true } },
  },
  {
    key: "issue.set_due_date",
    category: "time",
    status: "unsupported",
    label: { th: "ตั้งวันครบกำหนด", en: "Set due date" },
    description: { th: "กำหนดวันที่ครบกำหนด — ระบบยังไม่มีฟิลด์วันครบกำหนด", en: "Set a deadline — the system has no due date field yet" },
  },

  // ── content & notifications ─────────────────────────────────────
  {
    key: "issue.comment",
    category: "content",
    status: "supported",
    label: { th: "เพิ่มคอมเมนต์อัตโนมัติ", en: "Add a comment" },
    description: { th: "โพสต์คอมเมนต์ในการ์ดให้อัตโนมัติ", en: "Post a comment on the card automatically" },
    configSchema: { text: { type: "text", required: true, maxLength: 1000 } },
  },
  {
    key: "notify",
    category: "content",
    status: "supported",
    label: { th: "แจ้งเตือน", en: "Notify" },
    description: { th: "ส่งข้อความแจ้งเตือนให้ผู้ที่เกี่ยวข้อง", en: "Send a notification to the relevant people" },
    configSchema: {
      target: { type: "notify_target", required: true },
      message: { type: "text", required: false, maxLength: 1000 },
    },
  },
  {
    key: "issue.delete",
    category: "content",
    status: "supported",
    label: { th: "ลบการ์ด", en: "Delete card" },
    description: { th: "ย้ายการ์ดไปถังขยะ (กู้คืนได้)", en: "Move the card to the trash (recoverable)" },
  },
  {
    key: "issue.restore",
    category: "content",
    status: "supported",
    label: { th: "กู้คืนการ์ด", en: "Restore card" },
    description: { th: "กู้คืนการ์ดจากถังขยะ", en: "Restore the card from the trash" },
  },
];

export const RULE_FIELD_LABELS: Record<string, { th: string; en: string }> = {
  to_status: { th: "สถานะปลายทาง", en: "Destination status" },
  from_status: { th: "สถานะต้นทาง", en: "Source status" },
  status: { th: "สถานะ", en: "Status" },
  actor_role: { th: "บทบาทผู้ทำ", en: "Actor role" },
  to_assignee: { th: "ตำแหน่งผู้รับมอบหมาย", en: "Assigned position" },
  from_assignee: { th: "ผู้ถูกถอดมอบหมาย", en: "Previous assignee" },
  assignee: { th: "ผู้รับผิดชอบ", en: "Assignee" },
  reporter: { th: "ผู้แจ้งปัญหา", en: "Reporter" },
  comment_author: { th: "ผู้เขียนคอมเมนต์", en: "Comment author" },
  attachment_author: { th: "ผู้แนบไฟล์", en: "Attachment uploader" },
  priority: { th: "ความสำคัญ", en: "Priority" },
  old_priority: { th: "ความสำคัญเดิม", en: "Previous priority" },
  category: { th: "หมวดหมู่", en: "Category" },
  old_category: { th: "หมวดหมู่เดิม", en: "Previous category" },
  title: { th: "ชื่อการ์ด", en: "Card title" },
  old_title: { th: "ชื่อการ์ดเดิม", en: "Previous title" },
  description: { th: "รายละเอียด", en: "Description" },
  old_description: { th: "รายละเอียดเดิม", en: "Previous description" },
  duration: { th: "เวลา (นาที)", en: "Duration (minutes)" },
};

export function getFieldLabel(key: string, locale: "th" | "en" = "th"): string {
  const label = RULE_FIELD_LABELS[key];
  if (!label) return key;
  return locale === "en" ? label.en : label.th;
}

export function getTriggersByCategory(category: string): RuleTriggerDef[] {
  return RULE_TRIGGERS.filter((t) => t.category === category);
}

export function getActionsByCategory(category: string): RuleActionDef[] {
  return RULE_ACTIONS.filter((a) => a.category === category);
}

/**
 * Combinations where the action just repeats (or undoes) the trigger itself.
 * They are hidden from the action picker instead of being blocked.
 */
export const INVALID_ACTION_COMBOS: Array<{ trigger: string; action: string }> = [
  { trigger: "work_session.started", action: "work_session.start" },
  { trigger: "work_session.stopped", action: "work_session.stop" },
  { trigger: "issue.deleted", action: "issue.delete" },
  { trigger: "issue.restored", action: "issue.restore" },
  { trigger: "issue.moved", action: "issue.move_status" },
  { trigger: "comment.created", action: "issue.comment" },
];

export function isActionCompatible(triggerKey: string | null, actionKey: string): boolean {
  if (!triggerKey) return true;
  return !INVALID_ACTION_COMBOS.some((c) => c.trigger === triggerKey && c.action === actionKey);
}

/** Actions that make sense with every trigger, so they always stay listed. */
export const UNIVERSAL_RULE_ACTIONS = ["notify", "issue.comment"];

/**
 * The actions shown for a trigger: its recommendations, plus the universal
 * ones, minus the invalid combos. Actions that do not fit the trigger are
 * hidden instead of being offered and then rejected.
 */
export function getActionsForTrigger(triggerKey: string | null): RuleActionDef[] {
  if (!triggerKey) return RULE_ACTIONS; // no trigger picked yet — show everything
  const allowed = new Set([...getRecommendedActions(triggerKey), ...UNIVERSAL_RULE_ACTIONS]);
  return RULE_ACTIONS.filter((a) => allowed.has(a.key) && isActionCompatible(triggerKey, a.key));
}

/** Actions that make sense for a trigger — surfaced first with a "recommended" badge. */
export const RULE_ACTION_RECOMMENDATIONS: Record<string, string[]> = {
  "issue.moved": ["work_session.start", "work_session.stop", "issue.lock", "notify", "issue.set_priority"],
  "issue.created": ["issue.move_status", "notify", "issue.assign", "issue.add_label", "issue.set_priority"],
  "issue.assigned": ["notify", "issue.comment"],
  "comment.created": ["notify"],
  "attachment.created": ["notify"],
  "issue.title_changed": ["notify", "issue.add_label"],
  "issue.description_changed": ["notify", "issue.add_label"],
  "issue.priority_changed": ["notify"],
  "issue.category_changed": ["notify", "issue.set_category"],
  "issue.deleted": ["notify"],
  "issue.restored": ["notify", "issue.move_status"],
  "work_session.started": ["notify", "issue.set_time"],
  "work_session.stopped": ["notify", "issue.set_time"],
};

export function getRecommendedActions(triggerKey: string | null): string[] {
  if (!triggerKey) return [];
  return RULE_ACTION_RECOMMENDATIONS[triggerKey] ?? [];
}

export function isRecommendedAction(triggerKey: string | null, actionKey: string): boolean {
  return getRecommendedActions(triggerKey).includes(actionKey);
}

export function getTriggerByKey(key: string): RuleTriggerDef | undefined {
  return RULE_TRIGGERS.find((t) => t.key === key);
}

export function getActionByKey(key: string): RuleActionDef | undefined {
  return RULE_ACTIONS.find((a) => a.key === key);
}

export function getCategoryLabel(key: string, locale: "th" | "en" = "th"): string {
  const cat = RULE_TRIGGER_CATEGORIES.find((c) => c.key === key);
  if (!cat) return key;
  return locale === "en" ? cat.label.en : cat.label.th;
}

function getTemplate(triggerKey: string, templateKey: string): RuleTemplateDef | undefined {
  const trigger = getTriggerByKey(triggerKey);
  return trigger?.templates.find((t) => t.key === templateKey);
}

/**
 * Translate a trigger's template + conditions into a human sentence.
 * Placeholders like {status} / {user} are replaced by resolveValue(field, value).
 */
export function buildRuleSentence(
  triggerKey: string,
  templateKey: string | null,
  conditions: RuleCondition[],
  resolveValue: (field: string, value: unknown) => string,
): { th: string; en: string } {
  if (!templateKey) return { th: "", en: "" };
  const template = getTemplate(triggerKey, templateKey);
  if (!template) return { th: "", en: "" };

  const replacements = new Map<string, string>();
  for (const slot of template.slots) {
    const cond = conditions.find((c) => c.field === slot.field);
    replacements.set(slot.name, resolveValue(slot.field, cond?.value));
  }

  const render = (text: string): string =>
    text.replace(/\{(\w+)\}/g, (_m, name: string) => replacements.get(name) ?? `{${name}}`);

  return { th: render(template.text.th), en: render(template.text.en) };
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function valuesEqual(actual: unknown, expected: unknown, numeric: boolean): boolean {
  if (numeric) {
    const a = Number(actual);
    const b = Number(expected);
    if (Number.isNaN(a) || Number.isNaN(b)) return false;
    return a === b;
  }
  const sa = actual == null ? "" : String(actual);
  const sb = expected == null ? "" : String(expected);
  return sa === sb;
}

/**
 * Pure condition matcher — lives in shared so API & web use the same semantics.
 * Conditions within one rule are AND-ed (conditionGroup defaults to "AND").
 */
export function evaluateCondition(
  cond: RuleCondition,
  ctx: RuleContext,
  trigger: RuleTriggerDef,
): boolean {
  const field = trigger.fields.find((f) => f.key === cond.field);
  if (!field) return false;

  const typeDef = RULE_FIELD_TYPES[field.type];
  if (!typeDef.operators.includes(cond.operator)) return false;

  const actual = ctx[field.contextKey];
  const expected = cond.value;

  switch (cond.operator) {
    case "=": {
      const actualArr = asArray(actual);
      const expectedArr = asArray(expected);
      const found = typeDef.many
        ? actualArr.some((v) => valuesEqual(v, expectedArr[0], Boolean(typeDef.numeric)))
        : valuesEqual(actual, expected, Boolean(typeDef.numeric));
      return typeDef.many ? found : found;
    }
    case "!=": {
      const actualArr = asArray(actual);
      const expectedArr = asArray(expected);
      const found = typeDef.many
        ? actualArr.some((v) => valuesEqual(v, expectedArr[0], Boolean(typeDef.numeric)))
        : valuesEqual(actual, expected, Boolean(typeDef.numeric));
      return typeDef.many ? !found : !found;
    }
    case "in": {
      const actualArr = asArray(actual);
      const expectedArr = asArray(expected);
      return expectedArr.some((e) => actualArr.some((a) => valuesEqual(a, e, Boolean(typeDef.numeric))));
    }
    case "not_in": {
      const actualArr = asArray(actual);
      const expectedArr = asArray(expected);
      const ok = expectedArr.some((e) => actualArr.some((a) => valuesEqual(a, e, Boolean(typeDef.numeric))));
      return !ok;
    }
    case "contains":
    case "not_contains": {
      const arr = asArray(actual);
      const expectedArr = asArray(expected);
      const hit = arr.includes(expectedArr[0]);
      return cond.operator === "contains" ? hit : !hit;
    }
    case "is_empty":
      return asArray(actual).length === 0;
    case "is_not_empty":
      return asArray(actual).length > 0;
    case ">":
    case ">=":
    case "<":
    case "<=": {
      const a = Number(actual);
      const b = Number(expected);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      switch (cond.operator) {
        case ">":
          return a > b;
        case ">=":
          return a >= b;
        case "<":
          return a < b;
        default:
          return a <= b;
      }
    }
    default:
      return false;
  }
}
