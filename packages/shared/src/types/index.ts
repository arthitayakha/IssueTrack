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
export type ActivityLogType = "card" | "comment" | "rule";

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
