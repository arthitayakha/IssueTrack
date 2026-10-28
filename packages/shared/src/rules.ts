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

/** A variable that can be dropped into a free-text message (auto-comment). */
export interface RulePlaceholder {
  token: string;
  label: { th: string; en: string };
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
  triggerKey: string;
  templateKey: string | null;
  category: string;
  actionKey: string;
  actionConfig: Record<string, unknown>;
  conditions: RuleCondition[];
  isActive: boolean;
  stopOnError: boolean;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Who changed a rule and how (audit log behind GET /rules/activity). */
export interface RuleActivityDto {
  id: number;
  /** "rule.created" | "rule.updated" | "rule.deleted" */
  action: string;
  ruleId: number | null;
  ruleName: string | null;
  actorName: string | null;
  actorRole: string | null;
  createdAt: string;
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
      // leaving a status — powers "stop the timer when the card leaves a status"
      { key: "from_status", type: "status", contextKey: "fromStatusId" },
      { key: "actor_role", type: "role", contextKey: "actorRole" },
    ],
    templates: [
      { key: "moved_to", text: { th: "เมื่อการ์ดถูกลากไปยัง {status}", en: "When a card is moved to {status}" }, slots: [{ name: "status", field: "to_status", type: "status" }] },
      { key: "moved_from", text: { th: "เมื่อการ์ดถูกลากออกจาก {status}", en: "When a card is moved away from {status}" }, slots: [{ name: "status", field: "from_status", type: "status" }] },
      // slot-less so the "one step at a time" guard can be phrased as a plain
      // "whenever a card is moved" rule instead of naming a status
      { key: "moved_any", text: { th: "เมื่อมีการย้ายการ์ด", en: "When a card is moved" }, slots: [] },
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
  { key: "content", label: { th: "เนื้อหา", en: "Content" } },
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
    // acts as an on/off switch, not a per-event action: while any rule with
    // this key is active the server refuses a drag that skips a column, and
    // pausing it brings free dragging back. Its conditions are ignored on
    // purpose — the board's preview and the server's check share one flag.
    key: "issue.move_step_only",
    category: "card",
    status: "supported",
    label: { th: "บังคับลากทีละคอลัมน์", en: "Only allow moving one column at a time" },
    description: {
      th: "เปิดกฎนี้แล้วลากการ์ดได้เฉพาะคอลัมน์ที่อยู่ติดกัน (ไปข้างหน้า/ถอยหลัง 1 ขั้น ลากข้ามไม่ได้) — ปิดกฎนี้เมื่ออยากให้ลากไปสถานะไหนก็ได้",
      en: "While this rule is on, cards can only be dragged to the adjacent column (one step forward or back, no skipping) — pause it to drag a card to any status again",
    },
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
  {
    key: "issue.open_analysis",
    category: "card",
    status: "supported",
    label: { th: "เปิดให้กรอก วิเคราะห์/สาเหตุ", en: "Open analysis / cause field" },
    description: {
      th: "ปลดล็อกให้กรอกฟิลด์วิเคราะห์/สาเหตุ ตอนที่เหตุการณ์นี้เกิดขึ้น (เช่น ตอนการ์ดถูกกลากไปยังสถานะที่เลือกไว้ในขั้นที่ 1)",
      en: "Unlock the analysis/cause field when this event happens (e.g. when the card is moved to the status picked in step 1)",
    },
  },
  {
    key: "issue.open_resolution",
    category: "card",
    status: "supported",
    label: { th: "เปิดให้กรอก การแก้ไข", en: "Open resolution field" },
    description: {
      th: "ปลดล็อกให้กรอกฟิลด์การแก้ไข ตอนที่เหตุการณ์นี้เกิดขึ้น (เช่น ตอนการ์ดถูกกลากไปยังสถานะที่เลือกไว้ในขั้นที่ 1)",
      en: "Unlock the resolution field when this event happens (e.g. when the card is moved to the status picked in step 1)",
    },
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
  // Time tracking is rule-driven: these actions are what turns a drag into a
  // start/stop/reset of the card's timer (the card itself has no buttons).
  {
    key: "work_session.start",
    category: "time",
    status: "supported",
    label: { th: "เริ่มจับเวลา", en: "Start timer" },
    description: {
      th: "เริ่มจับเวลาให้การ์ด (ข้ามไปถ้ามีช่วงเวลาที่กำลังวิ่งอยู่แล้ว) — มักใช้คู่กับเงื่อนไข “ลากเข้าสถานะ …”",
      en: "Start timing the card (skipped when a session is already running) — usually paired with a “moved into status …” condition",
    },
  },
  {
    key: "work_session.stop",
    category: "time",
    status: "supported",
    label: { th: "หยุดจับเวลา", en: "Stop timer" },
    description: {
      th: "หยุดจับเวลาของการ์ดและบวกรวมเข้ายอดสะสม (ข้ามถ้ายังไม่ได้เริ่ม) — มักใช้คู่กับเงื่อนไข “ลากออกจากสถานะ …”",
      en: "Stop the card's timer and add it to the accumulated total (skipped when nothing is running) — usually paired with a “moved away from status …” condition",
    },
  },
  {
    key: "work_session.reset",
    category: "time",
    status: "supported",
    label: { th: "รีเซ็ตเวลา", en: "Reset time" },
    description: {
      th: "ล้างเวลาทั้งหมดของการ์ด — ลบช่วงเวลาที่เคยจับทั้งยอดสะสมเป็น 0 (เช่น เมื่อออกจากสถานะ “เสร็จสิ้น” แล้วงานถูกตีกลับ)",
      en: "Wipe the card's time — deletes every recorded session and resets the total to 0 (e.g. when leaving the “done” status after a rejected fix)",
    },
  },
  {
    key: "issue.allow_time_entry",
    category: "time",
    status: "supported",
    label: { th: "อนุญาตกรอกเวลาจริง", en: "Allow actual time entry" },
    description: {
      th: "เปิดช่องกรอก “เวลาแก้ไขจริง” ให้การ์ดตามเงื่อนไขที่กำหนด (การย้าย/สร้างการ์ดจะล็อกกลับอัตโนมัติ)",
      en: "Unlock the “actual fix time” field for the card where the conditions match (moving/creating the card re-locks it automatically)",
    },
  },
  {
    key: "issue.set_time",
    category: "time",
    status: "unsupported",
    label: { th: "ตั้งเวลาแก้ไขจริง", en: "Set actual fix time" },
    description: {
      th: "บันทึกเวลาที่ใช้แก้ไขจริงจากนาฬิกาจับเวลา — ยังไม่เปิดใช้",
      en: "Record the actual fix time from the timer — parked until the time model is settled",
    },
  },

  // ── content ─────────────────────────────────────────────────────
  {
    key: "issue.comment",
    category: "content",
    status: "supported",
    label: { th: "เพิ่มคอมเมนต์อัตโนมัติ", en: "Add a comment" },
    description: { th: "โพสต์คอมเมนต์ในการ์ดให้อัตโนมัติ", en: "Post a comment on the card automatically" },
    configSchema: { text: { type: "text", required: true, maxLength: 1000 } },
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
  // echoes: the action only redoes what the trigger just did
  { trigger: "issue.assigned", action: "issue.assign" },
  { trigger: "issue.priority_changed", action: "issue.set_priority" },
  { trigger: "issue.category_changed", action: "issue.set_category" },
  // a brand-new card has nobody to unassign
  { trigger: "issue.created", action: "issue.unassign" },
  // a brand-new card has no timer to stop/reset yet
  { trigger: "issue.created", action: "work_session.stop" },
  { trigger: "issue.created", action: "work_session.reset" },
  // the move guard is only consulted on the way into a move — for every other
  // trigger it would silently act as a global switch nobody meant to create
  { trigger: "issue.assigned", action: "issue.move_step_only" },
  { trigger: "issue.created", action: "issue.move_step_only" },
  { trigger: "comment.created", action: "issue.move_step_only" },
  { trigger: "attachment.created", action: "issue.move_step_only" },
  { trigger: "issue.title_changed", action: "issue.move_step_only" },
  { trigger: "issue.description_changed", action: "issue.move_step_only" },
  { trigger: "issue.priority_changed", action: "issue.move_step_only" },
  { trigger: "issue.category_changed", action: "issue.move_step_only" },
  { trigger: "issue.deleted", action: "issue.move_step_only" },
  { trigger: "issue.restored", action: "issue.move_step_only" },
  { trigger: "work_session.started", action: "issue.move_step_only" },
  { trigger: "work_session.stopped", action: "issue.move_step_only" },
];

export function isActionCompatible(triggerKey: string | null, actionKey: string): boolean {
  if (!triggerKey) return true;
  return !INVALID_ACTION_COMBOS.some((c) => c.trigger === triggerKey && c.action === actionKey);
}

/** Actions that make sense for a trigger — listed first in the picker. */
export const RULE_ACTION_RECOMMENDATIONS: Record<string, string[]> = {
  "issue.moved": [
    "issue.move_step_only",
    "work_session.start",
    "work_session.stop",
    "work_session.reset",
    "issue.allow_time_entry",
    "issue.lock",
    "issue.set_priority",
    "issue.open_analysis",
    "issue.open_resolution",
  ],
  "issue.created": [
    "issue.move_status",
    "issue.assign",
    "issue.add_label",
    "issue.set_priority",
    // a card created straight into a timed / time-entry status can start there
    "work_session.start",
    "issue.allow_time_entry",
  ],
  "issue.assigned": ["issue.comment"],
  // a fresh comment / attachment is a good moment to tag the card
  // (e.g. a "รอคำตอบ" / "มีเอกสารแนบ" label)
  "comment.created": ["issue.add_label"],
  "attachment.created": ["issue.add_label"],
  "issue.title_changed": ["issue.add_label"],
  "issue.description_changed": ["issue.add_label"],
  // e.g. priority jumps to urgent → tag the card "เร่งด่วน"
  "issue.priority_changed": ["issue.add_label"],
  // no set_category here: category_changed → set_category is an echo combo
  // and is hidden from the picker (see INVALID_ACTION_COMBOS)
  "issue.category_changed": [],
  "issue.deleted": [],
  "issue.restored": ["issue.move_status"],
  "work_session.started": ["issue.set_time", "issue.add_label"],
  "work_session.stopped": ["issue.set_time"],
};

export function getRecommendedActions(triggerKey: string | null): string[] {
  if (!triggerKey) return [];
  const recommended = RULE_ACTION_RECOMMENDATIONS[triggerKey] ?? [];
  // never push an action the picker refuses to select (parked / unsupported)
  const supported = new Set(
    RULE_ACTIONS.filter((a) => a.status === "supported").map((a) => a.key),
  );
  return recommended.filter((key) => supported.has(key));
}

/**
 * What the step-② action picker offers for a trigger: only the actions the
 * engine can actually run (`supported`) and that make sense with the trigger
 * (compatible), with the sensible ones listed first. Parked / unsupported
 * actions are hidden entirely — the picker never offers what cannot work.
 */
export function getPickerActions(triggerKey: string | null, category: string): RuleActionDef[] {
  const recommended = new Set(getRecommendedActions(triggerKey));
  return getActionsByCategory(category)
    .filter((action) => action.status === "supported" && isActionCompatible(triggerKey, action.key))
    .sort((a, b) => Number(recommended.has(b.key)) - Number(recommended.has(a.key)));
}

/** Tokens every message can use — the card it happened on and who did it. */
const COMMON_MESSAGE_TOKENS: RulePlaceholder[] = [
  { token: "{ชื่อการ์ด}", label: { th: "ชื่อของการ์ดที่เกิดเหตุ", en: "Title of the card involved" } },
  { token: "{ผู้กระทำ}", label: { th: "คนที่ทำสิ่งนี้ (สร้าง / แก้ไข / ย้าย)", en: "Who performed the action" } },
];

/** Extra tokens that only exist for a specific trigger. */
const TRIGGER_MESSAGE_TOKENS: Record<string, RulePlaceholder[]> = {
  "issue.moved": [
    { token: "{สถานะเดิม}", label: { th: "สถานะก่อนย้าย", en: "Status before the move" } },
    { token: "{สถานะใหม่}", label: { th: "สถานะหลังย้าย", en: "Status after the move" } },
  ],
  "issue.assigned": [{ token: "{ตำแหน่ง}", label: { th: "ตำแหน่งที่มอบหมาย", en: "Assigned position" } }],
  "comment.created": [
    { token: "{ข้อความคอมเมนต์}", label: { th: "ข้อความคอมเมนต์ที่ถูกส่ง", en: "The comment that was posted" } },
  ],
  "attachment.created": [
    { token: "{ชื่อไฟล์}", label: { th: "ชื่อไฟล์ที่ถูกแนบ", en: "Name of the attached file" } },
  ],
  "issue.title_changed": [{ token: "{ชื่อใหม่}", label: { th: "ชื่อการ์ดใหม่", en: "New card title" } }],
  "issue.description_changed": [
    { token: "{รายละเอียดใหม่}", label: { th: "รายละเอียดใหม่", en: "New description" } },
  ],
  "issue.priority_changed": [
    { token: "{ความสำคัญใหม่}", label: { th: "ความสำคัญใหม่", en: "New priority" } },
  ],
  "issue.category_changed": [{ token: "{หมวดหมู่ใหม่}", label: { th: "หมวดหมู่ใหม่", en: "New category" } }],
  "work_session.stopped": [
    { token: "{ระยะเวลา}", label: { th: "เวลาที่ใช้ทำ (นาที)", en: "Time spent (minutes)" } },
  ],
};

/**
 * Tokens offered under a free-text message field for the chosen trigger —
 * the engine substitutes them when the rule actually runs.
 */
export function getMessageTokens(triggerKey: string | null): RulePlaceholder[] {
  if (!triggerKey) return COMMON_MESSAGE_TOKENS;
  return [...COMMON_MESSAGE_TOKENS, ...(TRIGGER_MESSAGE_TOKENS[triggerKey] ?? [])];
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
 * Conditions within one rule are always AND-ed together.
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
