import type { Category, IssuePriority, IssueStatus, PositionSummary, UserSummary } from "@/lib/board-api";
import type { Label } from "@/lib/labels-api";

/**
 * Reference data loaded from real endpoints to render dropdowns in the rule wizard.
 * If any source fails, the caller falls back to raw values (ids).
 */
export interface ReferenceData {
  statuses: IssueStatus[];
  users: UserSummary[];
  positions: PositionSummary[];
  priorities: IssuePriority[];
  categories: Category[];
  roles: string[];
  labels: Label[];
}

export const EMPTY_REFERENCES: ReferenceData = {
  statuses: [],
  users: [],
  positions: [],
  priorities: [],
  categories: [],
  roles: ["admin", "programmer", "customer"],
  labels: [],
};
