/**
 * Shared helpers for the E2E suites.
 *
 * A local database is never empty: it holds rules someone made by hand in the
 * wizard. Those rules fire while a suite runs and move the test cards around,
 * which makes assertions depend on data nobody intended to test. Each suite
 * therefore suspends the rules that already exist, works only with the rules
 * it creates itself, and hands the original active flags back afterwards.
 *
 * The suites also leave no trace behind: they hard-delete the cards they made
 * (the API only soft-deletes) and drop the `rule_runs` rows they produced, so
 * the run-history page keeps describing real rules instead of test runs.
 */

/** Shape of `GET /rules` — plain array today, `{ data }` if it ever paginates. */
function listOfRules(body) {
  return Array.isArray(body) ? body : (body?.data ?? []);
}

/** Connection settings matching the API's DB_* defaults. */
function connectDb() {
  const pg = require("pg");
  return new pg.Client({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "1234",
    database: process.env.DB_NAME ?? "trackdb",
  });
}

/**
 * Highest `rule_runs` id right now. Everything above it was produced by the
 * suite that asked, which is what makes the end-of-run cleanup exact.
 */
async function captureRunWatermark(db) {
  const res = await db.query("SELECT COALESCE(MAX(id), 0) AS n FROM rule_runs");
  return res.rows[0].n;
}

/**
 * Deletes the run rows the suite created. History is meant to describe real
 * rules on real cards, so test runs must not outlive the test that made them.
 * Returns how many rows went away.
 */
async function cleanupRunRows(db, watermark) {
  const res = await db.query("DELETE FROM rule_runs WHERE id > $1 RETURNING id", [watermark]);
  return res.rows.length;
}

/** Child tables that point at `issues` and must go first (missing ones are skipped). */
const ISSUE_CHILD_TABLES = [
  ["attachments", "issue_id"],
  ["comments", "issue_id"],
  ["notifications", "issue_id"],
  ["work_sessions", "issue_id"],
  ["issue_labels", "issue_id"],
  ["activity_logs", "entity_id"],
  ["rule_runs", "issue_id"],
];

/**
 * Removes test cards for real. `DELETE /issues/:id` only soft-deletes, and
 * hundreds of invisible test rows pile up in `issues` over time. Returns the
 * number of rows removed; throws if an unknown foreign key blocks it so the
 * missing table shows up in the run instead of being silently ignored.
 */
async function hardDeleteIssues(db, ids) {
  const wanted = (ids ?? []).filter(Boolean).map(Number);
  if (wanted.length === 0) return 0;

  for (const [table, column] of ISSUE_CHILD_TABLES) {
    await db
      .query(`DELETE FROM ${table} WHERE ${column} = ANY($1::int[])`, [wanted])
      .catch(() => {
        // table may not exist in this schema — nothing to clear there
      });
  }

  try {
    const res = await db.query("DELETE FROM issues WHERE id = ANY($1::int[]) RETURNING id", [wanted]);
    return res.rows.length;
  } catch (error) {
    throw new Error(
      `could not hard-delete test cards (${error.message}) — a child table is probably missing from ISSUE_CHILD_TABLES`,
    );
  }
}

/**
 * Disables every rule that already exists and returns a function that puts the
 * original `isActive` flags back. Call it after logging in, and always call
 * the returned function before exiting.
 */
async function suspendExistingRules(call) {
  const existing = await call("/rules");
  const snapshot = listOfRules(existing.body).map((rule) => ({
    id: rule.id,
    isActive: rule.isActive,
  }));

  for (const rule of snapshot) {
    if (rule.isActive) {
      await call(`/rules/${rule.id}/toggle`, {
        method: "PATCH",
        body: { isActive: false },
      });
    }
  }

  return async function restoreRules() {
    for (const rule of snapshot) {
      if (rule.isActive) {
        await call(`/rules/${rule.id}/toggle`, {
          method: "PATCH",
          body: { isActive: true },
        });
      }
    }
  };
}

/** How many cards titled `E2E…` are still sitting in `issues` (test litter). */
async function countTestCards(db) {
  const res = await db.query("SELECT count(id) AS n FROM issues WHERE title LIKE 'E2E%'");
  return Number(res.rows[0].n);
}

module.exports = {
  captureRunWatermark,
  cleanupRunRows,
  connectDb,
  countTestCards,
  hardDeleteIssues,
  listOfRules,
  suspendExistingRules,
};
