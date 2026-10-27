/**
 * Shared helpers for the E2E suites.
 *
 * A local database is never empty: it holds rules someone made by hand in the
 * wizard. Those rules fire while a suite runs and move the test cards around,
 * which makes assertions depend on data nobody intended to test. Each suite
 * therefore suspends the rules that already exist, works only with the rules
 * it creates itself, and hands the original active flags back afterwards.
 */

/** Shape of `GET /rules` — plain array today, `{ data }` if it ever paginates. */
function listOfRules(body) {
  return Array.isArray(body) ? body : (body?.data ?? []);
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

module.exports = { listOfRules, suspendExistingRules };
