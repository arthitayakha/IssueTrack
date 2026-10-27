/**
 * E2E: `rule_runs` history API — statuses, filtering, pagination, ordering and
 * survival after the rule itself is deleted.
 *
 * Prerequisites: a running API (`npm run dev --workspace=@kanban/api`, port
 * 3002) and the local Postgres. Run via: npm run test:e2e --workspace=@kanban/api
 */
const BASE = process.env.API_URL ?? "http://localhost:3002";
const { suspendExistingRules } = require("./helpers");
let token = null;
let failures = 0;
/** Put back the active flags of rules that existed before this suite ran. */
let restoreRules = async () => {};

async function call(path, { method = "GET", body, auth = true } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text.slice(0, 200);
  }
  return { status: res.status, body: parsed };
}

function check(label, ok, extra) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? " | " + extra : ""}`);
  if (!ok) failures++;
}

const list = (b) => (Array.isArray(b) ? b : (b?.data ?? []));

const pg = require("pg");
const db = new pg.Client({
  host: process.env.DB_HOST ?? "localhost",
  port: Number(process.env.DB_PORT ?? 5432),
  user: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASSWORD ?? "1234",
  database: process.env.DB_NAME ?? "trackdb",
});

(async () => {
  await db.connect();
  await db.query("DELETE FROM rule_runs WHERE rule_name LIKE 'E2E%'"); // leftovers from failed runs
  const startCount = (await db.query("SELECT COALESCE(MAX(id), 0) AS n FROM rule_runs")).rows[0].n;

  const login = await call("/auth/login", {
    method: "POST",
    body: { email: "aom@gmail.com", password: "123456" },
    auth: false,
  });
  token = login.body?.token ?? login.body?.accessToken ?? login.body?.access_token;
  check("login", login.status < 300 && !!token, `status=${login.status}`);
  if (!token) {
    console.log(`\n${failures} FAILURES`);
    process.exit(1);
  }
  // hand-made rules in this DB must not add run rows to the history
  restoreRules = await suspendExistingRules(call);

  const priorities = list((await call("/issue-priorities?limit=100")).body);
  const statuses = list((await call("/issue-statuses?limit=100")).body);
  const p1 = priorities[0];
  const st1 = statuses[0];

  // gates
  const anon = await call("/rules/runs", { auth: false });
  check("GET /rules/runs without token => 401", anon.status === 401, `status=${anon.status}`);
  const cust = await call("/auth/login", {
    method: "POST",
    body: { email: "arthitaya@gmail.com", password: "123456" },
    auth: false,
  });
  const custToken = cust.body?.token ?? cust.body?.accessToken ?? cust.body?.access_token;
  const saved = token;
  token = custToken;
  const denied = await call("/rules/runs");
  check("customer GET /rules/runs => 403", denied.status === 403, `status=${denied.status}`);
  token = saved;

  async function makeRule(payload) {
    const res = await call("/rules", { method: "POST", body: payload });
    return res.body;
  }

  // three rules on the same trigger → three runs with three statuses
  const ruleApplied = await makeRule({
    name: "E2E B3 applied",
    triggerKey: "issue.created",
    templateKey: "created_any",
    category: "card_change",
    actionKey: "issue.set_priority",
    actionConfig: { priority: String(p1.id) },
    conditions: [],
    isActive: true,
    stopOnError: false,
  });
  const ruleSkipped = await makeRule({
    name: "E2E B3 skipped",
    triggerKey: "issue.created",
    templateKey: "created_any",
    category: "card_change",
    actionKey: "work_session.start",
    actionConfig: {},
    conditions: [],
    isActive: true,
    stopOnError: false,
  });
  const ruleFailed = await makeRule({
    name: "E2E B3 failed",
    triggerKey: "issue.created",
    templateKey: "created_any",
    category: "card_change",
    actionKey: "issue.set_priority",
    actionConfig: { priority: "99999" }, // FK violation → engine records a failure
    conditions: [],
    isActive: true,
    stopOnError: false,
  });

  const issue = await call("/issues", {
    method: "POST",
    body: { title: "E2E B3 card", description: "b3", statusId: st1.id },
  });
  check("issue created (3 rules fired)", issue.status < 300 && issue.body?.id, `id=${issue.body?.id}`);

  // full list
  const all = await call("/rules/runs?limit=100");
  const rows = all.body?.data ?? [];
  const byName = (name) => rows.find((r) => r.ruleName === name);
  const applied = byName("E2E B3 applied");
  const skipped = byName("E2E B3 skipped");
  const failed = byName("E2E B3 failed");
  check("run row recorded: applied", applied?.status === "applied" && applied?.actionKey === "issue.set_priority",
    `status=${applied?.status} duration=${applied?.durationMs}`);
  check("run row recorded: skipped (unsupported action)",
    skipped?.status === "skipped" && /not supported/.test(skipped?.detail ?? ""),
    `detail=${skipped?.detail}`);
  check("run row recorded: failed (FK error in detail)",
    failed?.status === "failed" && !!failed?.detail,
    `detail=${(failed?.detail ?? "").slice(0, 60)}`);
  check("row carries trigger + issue title",
    applied?.triggerKey === "issue.created" && applied?.issueTitle === "E2E B3 card",
    `trigger=${applied?.triggerKey} issue=${applied?.issueTitle}`);
  check("createdAt is ISO + durationMs number",
    !!applied && !Number.isNaN(Date.parse(applied.createdAt)) && typeof applied.durationMs === "number");

  // newest first
  const ids = rows.map((r) => r.id);
  check("rows sorted newest first", ids.every((v, i) => i === 0 || ids[i - 1] > v));

  // filter by rule
  const filtered = await call(`/rules/runs?ruleId=${ruleApplied.id}&limit=100`);
  const filteredRows = filtered.body?.data ?? [];
  check("filter by ruleId",
    filteredRows.length > 0 && filteredRows.every((r) => r.ruleId === ruleApplied.id),
    `count=${filteredRows.length}`);

  // pagination
  const page1 = await call("/rules/runs?limit=1&page=1");
  check("pagination limit=1",
    (page1.body?.data?.length ?? 99) === 1 && page1.body?.limit === 1 &&
      (page1.body?.totalPages ?? 0) >= 3 && page1.body?.total >= 3,
    `total=${page1.body?.total} pages=${page1.body?.totalPages}`);

  // GET /rules/runs must not be swallowed by /rules/:id
  check("route not shadowed by /rules/:id", all.status === 200 && Array.isArray(all.body?.data ?? all.body));

  // delete the "applied" rule → history survives with the name snapshot
  await call(`/rules/${ruleApplied.id}`, { method: "DELETE" });
  const afterDelete = await call("/rules/runs?limit=100");
  const orphan = (afterDelete.body?.data ?? []).find((r) => r.ruleName === "E2E B3 applied");
  check("history survives rule deletion (ruleId null, name kept)",
    !!orphan && orphan.ruleId === null && orphan.ruleName === "E2E B3 applied",
    `ruleId=${orphan?.ruleId} name=${orphan?.ruleName}`);

  // cleanup — remove only the rows this run created (history from other rules stays)
  await call(`/rules/${ruleSkipped.id}`, { method: "DELETE" });
  await call(`/rules/${ruleFailed.id}`, { method: "DELETE" });
  await call(`/issues/${issue.body.id}`, { method: "DELETE" });
  const created = await db.query("SELECT id FROM rule_runs WHERE id > $1", [startCount]);
  await db.query("DELETE FROM rule_runs WHERE id > $1", [startCount]);
  const left = await db.query("SELECT count(*)::int AS n FROM rule_runs WHERE id > $1", [startCount]);
  check("cleanup done", left.rows[0].n === 0 && created.rows.length >= 3,
    `created=${created.rows.length} left=${left.rows[0].n}`);

  await restoreRules();
  await db.end();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error("ERR", e.message);
  await restoreRules();
  try {
    await db.end();
  } catch {}
  process.exit(1);
});
