/**
 * "Entered เสร็จสิ้น" — the single definition of a completion event, shared by
 * the dashboard's second bar and the report's completed-date filter
 * (`?series=completed` on a bar click → `completedFrom`/`completedTo`).
 *
 * The source is an `activity_logs` row with action `card.moved`: the only
 * writer is `IssuesService.move()`, which stamps `toStatusId` into `detail`.
 * The name fallback covers rows logged before that stamp existed, across
 * every name the done column has carried ("Done" → "เสร็จสิ้น", plus one
 * stray lowercase row). Ids do not move when names change, so a rename keeps
 * old rows matching while new rows match on the id. A row whose `detail`
 * records no target (309 legacy rows) cannot be attributed and is not counted
 * — no name could guess it.
 */

export const DONE_STATUS_ID = 4;

export const DONE_STATUS_NAMES = ["เสร็จสิ้น", "Done", "done"];

/** The `detail` match, parameterised — never splice names into SQL. */
export const DONE_MOVE_MATCH =
  "(al.detail::json->>'toStatusId' = :doneStatusId OR al.detail::json->>'to' IN (:...doneStatusNames))";

/** The bound values for `DONE_MOVE_MATCH`. */
export function doneMoveParams(): { doneStatusId: string; doneStatusNames: string[] } {
  return { doneStatusId: String(DONE_STATUS_ID), doneStatusNames: [...DONE_STATUS_NAMES] };
}

/**
 * `EXISTS` clause that keeps only cards moved into เสร็จสิ้น inside an
 * optional window. Used by `GET /issues` (the report's issue list) and by
 * `GET /reports/summary` (the grouped views), so both agree with the
 * dashboard's completed bar. `from`/`to` are already-parsed `Date` bounds;
 * passing neither means "any completion ever" (only used when one bound is
 * invalid, in which case the caller skips the clause entirely).
 */
export function completedInRange(
  from: Date | null,
  to: Date | null,
): { sql: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = doneMoveParams();
  let bounds = "";
  if (from) {
    params.completedFrom = from;
    bounds += " AND al.created_at >= :completedFrom";
  }
  if (to) {
    params.completedTo = to;
    bounds += " AND al.created_at <= :completedTo";
  }
  return {
    sql:
      `EXISTS (SELECT 1 FROM activity_logs al ` +
      `WHERE al.entity_id = issue.id AND al.action = 'card.moved' ` +
      `AND ${DONE_MOVE_MATCH}${bounds})`,
    params,
  };
}
