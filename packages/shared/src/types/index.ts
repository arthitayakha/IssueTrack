export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Role {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  roleId: number | null;
  roleName: string | null;
  positionId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Position {
  id: string;
  name: string;
  isActive: boolean;
}

export interface Column {
  id: string;
  title: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Issue {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: "low" | "medium" | "high" | "urgent";
  order: number;
  columnId: string;
  assigneeId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ประเภทงาน — 1 ใน 3 ค่า (เก็บใน `issues.task_type`, NULL = ยังไม่ระบุ)
 *
 * ขับกฎหักชั่วโมง MA: มีแค่ `ma` หัก (ป้าย "MA" ใน UI — เดิมชื่อ `feature`
 * ถูก rename ผ่าน migration `1827000000000`) — `bug` กับ `requirement` ไม่หัก
 * (requirement เลิกหักตามข้อสรุปผู้ใช้) และ NULL ไม่หัก
 * (งานเก่าปลอดภัยจนกว่าแอดมิน/โปรแกรมเมอร์จะมาตั้ง)
 */
export type IssueTaskType = "bug" | "ma" | "requirement";

export interface Comment {
  id: string;
  content: string;
  issueId: string;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  boardId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkSession {
  id: number;
  issueId: number;
  programmerId: number;
  startedAt: string;
  endedAt: string | null;
  duration: number;
  createdAt: string;
}

/** Group a log row belongs to — drives the type filter and the chip colour. */
export type ActivityLogType = "card" | "comment" | "rule" | "user" | "data";

/**
 * Which action prefixes belong to which group. **The single source of truth**
 * for both the API (`ActivityLogsService` maps a row → group, and expands the
 * type filter into an OR of prefix LIKEs) and the web (`/logs` filter chips).
 *
 * A group can hold several prefixes: `user` covers `user.*`, `role.*`,
 * `position.*`, `permission.*` and `auth.*` — so filtering "ผู้ใช้ & สิทธิ์"
 * must match all five, not just `user.%`.
 *
 * Keeping it here (rather than duplicated per side) is what stops the two
 * from drifting apart the next time a prefix is added.
 */
export const ACTIVITY_GROUP_PREFIXES: Record<ActivityLogType, readonly string[]> = {
  card: ["card", "attachment", "workSession"],
  comment: ["comment"],
  rule: ["rule"],
  user: ["user", "role", "position", "permission", "auth"],
  data: ["status", "priority", "category", "label", "company", "app", "contract"],
};

/** Every group, in the order the filter shows them. */
export const ACTIVITY_GROUP_ORDER: readonly ActivityLogType[] = [
  "card",
  "comment",
  "rule",
  "user",
  "data",
];

/**
 * The group a row belongs to, read off its action prefix (`card.moved` →
 * "card"). An unknown prefix lands in `data` rather than throwing: the
 * interceptor derives actions from routes, so a future endpoint must never be
 * able to break the feed that is meant to record it.
 */
export function groupOfAction(action: string): ActivityLogType {
  const prefix = action.split(".")[0] as string;
  const hit = (Object.keys(ACTIVITY_GROUP_PREFIXES) as ActivityLogType[]).find((group) =>
    ACTIVITY_GROUP_PREFIXES[group].includes(prefix),
  );
  return hit ?? "data";
}

/**
 * One row of the system-wide activity feed (GET /activity-logs). `payload` is
 * the row's `detail` column parsed as JSON (null when it is missing or not an
 * object) — e.g. `{ from, to }` for card.moved, `{ title }` for card.created.
 */
export interface ActivityLogDto {
  id: number;
  /** "card.created" | "card.moved" | ... | "comment.created" | "rule.updated" */
  action: string;
  type: ActivityLogType;
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
  /** Issue id for card/comment rows, rule id for rule.* rows. */
  entityId: number | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

/** Distinct actor for the feed's actor filter dropdown. */
export interface ActivityActorDto {
  id: number;
  name: string;
  role: string | null;
}
