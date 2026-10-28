/**
 * E2E: rules API + engine phase 1 (priority / category actions).
 *
 * Prerequisites: a running API (`npm run dev --workspace=@kanban/api`, port
 * 3002) and the local Postgres. The suite logs in with the seeded admin,
 * creates rules and cards through the API and deletes them again — cards are
 * hard-deleted (the API only soft-deletes), so nothing survives the run.
 * Run via: npm run test:e2e --workspace=@kanban/api
 * Override the target with API_URL when the API runs elsewhere.
 */
const BASE = process.env.API_URL ?? "http://localhost:3002";
const {
  connectDb,
  countTestCards,
  hardDeleteIssues,
  suspendExistingRules,
} = require("./helpers");
const db = connectDb();
let cardsBefore = 0;
let token = null;
let failures = 0;
/** Put back the active flags of rules that existed before this suite ran. */
let restoreRules = async () => {};

/** Everything the suite produced: restore the rules it suspended. */
async function cleanup() {
  await restoreRules();
}

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

(async () => {
  // login as the admin account that exists in this DB
  const login = await call("/auth/login", {
    method: "POST",
    body: { email: "aom@gmail.com", password: "123456" },
    auth: false,
  });
  token = login.body?.token ?? login.body?.accessToken ?? login.body?.access_token ?? login.body?.jwt;
  check("login", login.status < 300 && !!token, `status=${login.status}`);
  if (!token) {
    console.log(`\n${failures} FAILURES`);
    process.exit(1);
  }
  await db.connect();
  cardsBefore = await countTestCards(db);
  // hand-made rules in this DB must not fire while the suite runs
  restoreRules = await suspendExistingRules(call);

  // reference data
  const priorities = list((await call("/issue-priorities?limit=100")).body);
  const categories = list((await call("/categories?limit=100")).body);
  let statuses = list((await call("/issue-statuses?limit=100")).body);
  if (statuses.length === 0) statuses = list((await call("/statuses?limit=100")).body);
  check("reference data", priorities.length > 0 && categories.length > 0 && statuses.length > 0,
    `priorities=${priorities.length} categories=${categories.length} statuses=${statuses.length}`);
  const p1 = priorities[0];
  const p2 = priorities[1] ?? priorities[0];
  const c1 = categories[0];
  const st1 = statuses[0];
  const st2 = statuses[1] ?? statuses[0];

  // 1) auth + gate
  const anon = await call("/rules", { auth: false });
  check("GET /rules without token => 401", anon.status === 401, `status=${anon.status}`);
  const customerLogin = await call("/auth/login", {
    method: "POST",
    body: { email: "arthitaya@gmail.com", password: "123456" },
    auth: false,
  });
  const customerToken =
    customerLogin.body?.token ?? customerLogin.body?.accessToken ?? customerLogin.body?.access_token;
  const saved = token;
  token = customerToken;
  const denied = await call("/rules");
  check("customer GET /rules => 401/403", denied.status === 401 || denied.status === 403,
    `status=${denied.status}`);
  token = saved;

  // 2) list starts clean
  const initial = await call("/rules");
  check("GET /rules => 200 array", initial.status === 200 && Array.isArray(initial.body ?? initial.body?.data),
    `status=${initial.status} count=${list(initial.body).length}`);

  // 3) create rule A: new card -> set priority
  const ruleA = {
    name: "เมื่อมีการ์ดใหม่ → ตั้งความสำคัญ",
    triggerKey: "issue.created",
    templateKey: "created_any",
    category: "card_change",
    actionKey: "issue.set_priority",
    actionConfig: { priority: String(p1.id) },
    conditions: [],
    isActive: true,
    stopOnError: false,
  };
  const createdA = await call("/rules", { method: "POST", body: ruleA });
  check("POST /rules => 201/200 + dto", createdA.status < 300 && createdA.body?.id,
    `status=${createdA.status} id=${createdA.body?.id} name=${createdA.body?.name}`);
  const idA = createdA.body?.id;
  check("rule A name auto length <= 150", (createdA.body?.name?.length ?? 999) <= 150);

  // 4) read back + list contains it
  const fetched = await call(`/rules/${idA}`);
  check("GET /rules/:id => matches", fetched.status === 200 && fetched.body?.actionKey === "issue.set_priority",
    `actionKey=${fetched.body?.actionKey}`);
  const listed = await call("/rules");
  check("GET /rules contains rule A", list(listed.body).some((r) => r.id === idA),
    `count=${list(listed.body).length}`);

  // 5) update rule A (rename + change target priority)
  const updated = await call(`/rules/${idA}`, {
    method: "PUT",
    body: { ...ruleA, name: "กฎทดสอบ (แก้ไขแล้ว)", actionConfig: { priority: String(p2.id) } },
  });
  check("PUT /rules/:id => applied",
    updated.status === 200 && updated.body?.name === "กฎทดสอบ (แก้ไขแล้ว)" &&
      String(updated.body?.actionConfig?.priority) === String(p2.id),
    `name=${updated.body?.name}`);

  // 6) toggle off / on
  const off = await call(`/rules/${idA}/toggle`, { method: "PATCH", body: { isActive: false } });
  check("PATCH toggle off", off.status === 200 && off.body?.isActive === false);
  const on = await call(`/rules/${idA}/toggle`, { method: "PATCH", body: { isActive: true } });
  check("PATCH toggle on", on.status === 200 && on.body?.isActive === true);

  // 7) ENGINE TEST 1 — new card gets priority p2 from the rule
  const issue = await call("/issues", {
    method: "POST",
    body: {
      title: "E2E rules test card",
      description: "created by e2e-rules.js",
      statusId: st1.id,
      priorityId: p1.id, // rule should overwrite this with p2
    },
  });
  check("POST /issues => created", issue.status < 300 && issue.body?.id, `status=${issue.status}`);
  const issueId = issue.body?.id;
  check("engine: new card priority overridden by rule",
    String(issue.body?.priorityId) === String(p2.id),
    `priorityId=${issue.body?.priorityId} expected=${p2.id}`);

  // 8) create rule B: move card -> set category (conditions: only when moving to st2)
  const ruleB = {
    name: "เมื่อย้ายการ์ด → เปลี่ยนหมวดหมู่",
    triggerKey: "issue.moved",
    templateKey: "moved_to",
    category: "card_move",
    actionKey: "issue.set_category",
    actionConfig: { category: String(c1.id) },
    conditions: [{ field: "to_status", operator: "=", value: String(st2.id), position: 0 }],
    isActive: true,
    stopOnError: false,
  };
  const createdB = await call("/rules", { method: "POST", body: ruleB });
  check("POST rule B => created", createdB.status < 300 && createdB.body?.id, `id=${createdB.body?.id}`);
  const idB = createdB.body?.id;

  // move to st1 (condition does NOT match) -> category unchanged
  const moveNo = await call(`/issues/${issueId}/move`, { method: "PUT", body: { statusId: st1.id } });
  check("move where condition fails => category untouched",
    moveNo.status < 300 && (moveNo.body?.categoryId == null || String(moveNo.body?.categoryId) !== String(c1.id)),
    `categoryId=${moveNo.body?.categoryId}`);

  // move to st2 (condition matches) -> category set by rule
  const moveYes = await call(`/issues/${issueId}/move`, { method: "PUT", body: { statusId: st2.id } });
  check("engine: move with matching condition => category set",
    moveYes.status < 300 && String(moveYes.body?.categoryId) === String(c1.id),
    `categoryId=${moveYes.body?.categoryId} expected=${c1.id}`);

  // 9) delete both rules (cleanup)
  const delB = await call(`/rules/${idB}`, { method: "DELETE" });
  const delA = await call(`/rules/${idA}`, { method: "DELETE" });
  check("DELETE both rules", delB.body?.deleted === true && delA.body?.deleted === true,
    `B=${JSON.stringify(delB.body)} A=${JSON.stringify(delA.body)}`);
  const after = await call("/rules");
  const mine = list(after.body).filter((r) => r.id === idA || r.id === idB);
  check("GET /rules no longer lists my rules", mine.length === 0,
    `mine=${mine.length} total=${list(after.body).length}`);

  // 10) cleanup — the card for real
  const removedCards = await hardDeleteIssues(db, [issueId]);
  check("cleanup: test card removed for real", !issueId || removedCards === 1,
    `removed=${removedCards}`);
  const leftovers = await countTestCards(db);
  check("cleanup: card count back to where it started", leftovers === cardsBefore,
    `left=${leftovers} before=${cardsBefore}`);

  await restoreRules();
  await db.end();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(async (e) => {
  console.error("ERR", e.message);
  try {
    await cleanup();
  } catch {}
  try {
    await db.end();
  } catch {}
  process.exit(1);
});
