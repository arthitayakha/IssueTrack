/**
 * E2E: engine phase 2 — labels, auto-comment with Thai tokens, action chains,
 * lock and attachments.
 *
 * Prerequisites: a running API (`npm run dev --workspace=@kanban/api`, port
 * 3002) and the local Postgres (used to assert what the API does not expose).
 * Run via: npm run test:e2e --workspace=@kanban/api
 */
const BASE = process.env.API_URL ?? "http://localhost:3002";
const fs = require("fs");
const path = require("path");
const { suspendExistingRules } = require("./helpers");
let token = null;
let failures = 0;
const ruleIds = [];
const issueIds = [];
/** Put back the active flags of rules that existed before this suite ran. */
let restoreRules = async () => {};

async function call(path, { method = "GET", body, auth = true, formData } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: formData ? formData : body ? JSON.stringify(body) : undefined,
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
  // hand-made rules in this DB must not move the cards this suite creates
  restoreRules = await suspendExistingRules(call);

  const me = await call("/auth/me");
  const myName = me.body?.name ?? "";
  console.log(`actor name = "${myName}"`);

  const priorities = list((await call("/issue-priorities?limit=100")).body);
  const categories = list((await call("/categories?limit=100")).body);
  const statuses = list((await call("/issue-statuses?limit=100")).body);
  const labels = list((await call("/labels")).body);
  check("reference data", priorities.length >= 1 && categories.length >= 1 && statuses.length >= 2 && labels.length >= 1,
    `p=${priorities.length} c=${categories.length} st=${statuses.length} l=${labels.length}`);
  const [p1, p2] = priorities;
  const [c1] = categories;
  const [st1, st2] = statuses;
  const [label] = labels;

  const existing = list((await call("/rules")).body);
  console.log(`pre-existing rules (suspended for this run): ${existing.length}`);

  async function makeRule(payload) {
    const res = await call("/rules", { method: "POST", body: payload });
    if (res.body?.id) ruleIds.push(res.body.id);
    return res.body;
  }

  async function makeIssue(title, statusId) {
    const res = await call("/issues", {
      method: "POST",
      body: { title, description: "e2e-b2", statusId: statusId ?? st1.id, priorityId: p2.id },
    });
    if (res.body?.id) issueIds.push(res.body.id);
    return res.body;
  }
  const makeIssueAt = (title, statusId) => makeIssue(title, statusId);

  // ── R1: comment.created → set priority ────────────────────────────
  await makeRule({
    name: "E2E R1: comment -> priority",
    triggerKey: "comment.created",
    templateKey: "comment_any",
    category: "content",
    actionKey: "issue.set_priority",
    actionConfig: { priority: String(p1.id) },
    conditions: [],
    isActive: true,
    stopOnError: false,
  });
  const r1issue = await makeIssue("E2E R1 card");
  await call(`/issues/${r1issue.id}/comments`, { method: "POST", body: { content: "ping" } });
  const r1check = await db.query("SELECT priority_id FROM issues WHERE id = $1", [r1issue.id]);
  check("R1 comment.created -> set_priority",
    String(r1check.rows[0].priority_id) === String(p1.id),
    `priority=${r1check.rows[0].priority_id} expected=${p1.id}`);

  // ── R2: issue.created → add label ─────────────────────────────────
  await makeRule({
    name: "E2E R2: created -> add label",
    triggerKey: "issue.created",
    templateKey: "created_any",
    category: "card_change",
    actionKey: "issue.add_label",
    actionConfig: { label: String(label.id) },
    conditions: [],
    isActive: true,
    stopOnError: false,
  });
  const r2issue = await makeIssue("E2E R2 card");
  const r2check = await db.query(
    "SELECT label_id FROM issue_labels WHERE issue_id = $1",
    [r2issue.id],
  );
  check("R2 issue.created -> add_label",
    r2check.rows.some((r) => String(r.label_id) === String(label.id)),
    `label=${label.id} rows=${r2check.rows.length}`);

  // ── R3: issue.created → auto comment with Thai tokens ─────────────
  await makeRule({
    name: "E2E R3: created -> comment with tokens",
    triggerKey: "issue.created",
    templateKey: "created_any",
    category: "card_change",
    actionKey: "issue.comment",
    actionConfig: { text: "การ์ด {ชื่อการ์ด} โดย {ผู้กระทำ}" },
    conditions: [],
    isActive: true,
    stopOnError: false,
  });
  const title3 = "E2E R3 การ์ดทดสอบ";
  const r3issue = await makeIssue(title3);
  const r3comments = await db.query(
    "SELECT comment FROM comments WHERE issue_id = $1 ORDER BY id DESC LIMIT 3",
    [r3issue.id],
  );
  const r3text = r3comments.rows.map((r) => r.comment).join(" | ");
  check("R3 auto-comment rendered (title + actor, no leftover tokens)",
    r3text.includes(title3) && r3text.includes(myName) && !r3text.includes("{"),
    `text="${r3text}"`);

  // ── R4: issue.moved (to st1) → move to st2 — chain must not loop ──
  await makeRule({
    name: "E2E R4: moved to st1 -> move to st2",
    triggerKey: "issue.moved",
    templateKey: "moved_to",
    category: "card_move",
    actionKey: "issue.move_status",
    actionConfig: { targetStatus: String(st2.id) },
    conditions: [{ field: "to_status", operator: "=", value: String(st1.id), position: 0 }],
    isActive: true,
    stopOnError: false,
  });
  const r4issue = await makeIssueAt("E2E R4 card", st2.id);
  const moved = await call(`/issues/${r4issue.id}/move`, { method: "PUT", body: { statusId: st1.id } });
  const r4check = await db.query("SELECT status_id FROM issues WHERE id = $1", [r4issue.id]);
  check("R4 move chain applies once (no loop)",
    moved.status < 300 && String(r4check.rows[0].status_id) === String(st2.id),
    `status=${r4check.rows[0].status_id} expected=${st2.id}`);

  // ── R5: issue.created → lock ──────────────────────────────────────
  await makeRule({
    name: "E2E R5: created -> lock",
    triggerKey: "issue.created",
    templateKey: "created_any",
    category: "card_change",
    actionKey: "issue.lock",
    actionConfig: {},
    conditions: [],
    isActive: true,
    stopOnError: false,
  });
  const r5issue = await makeIssue("E2E R5 card");
  const r5check = await db.query("SELECT is_locked FROM issues WHERE id = $1", [r5issue.id]);
  check("R5 issue.created -> lock", r5check.rows[0].is_locked === true, `locked=${r5check.rows[0].is_locked}`);

  // ── R6: attachment.created → set category ─────────────────────────
  await makeRule({
    name: "E2E R6: attachment -> category",
    triggerKey: "attachment.created",
    templateKey: "attachment_any",
    category: "content",
    actionKey: "issue.set_category",
    actionConfig: { category: String(c1.id) },
    conditions: [],
    isActive: true,
    stopOnError: false,
  });
  const r6issue = await makeIssue("E2E R6 card");
  const form = new FormData();
  // multer only accepts images/PDFs — send a tiny application/pdf blob
  form.append("file", new Blob(["%PDF-1.4 e2e"], { type: "application/pdf" }), "e2e.pdf");
  const upload = await call(`/issues/${r6issue.id}/attachments`, { method: "POST", formData: form });
  const r6check = await db.query("SELECT category_id FROM issues WHERE id = $1", [r6issue.id]);
  check("R6 attachment.created -> set_category",
    upload.status < 300 && String(r6check.rows[0].category_id) === String(c1.id),
    `upload=${upload.status} category=${r6check.rows[0].category_id} expected=${c1.id}`);

  // ── cleanup: rules first (so deleting issues does not re-fire them) ─
  for (const id of ruleIds) await call(`/rules/${id}`, { method: "DELETE" });
  for (const id of issueIds) await call(`/issues/${id}`, { method: "DELETE" });

  // the uploaded PDF must not linger: drop its row and the file on disk
  const uploaded = await db.query(
    "SELECT file_path FROM attachments WHERE issue_id = ANY($1::int[])",
    [issueIds],
  );
  for (const row of uploaded.rows) {
    // file_path keeps a legacy prefix, but the file lands in apps/api/uploads
    const file = path.resolve(__dirname, "../../uploads", path.basename(row.file_path));
    fs.rmSync(file, { force: true });
  }
  await db.query("DELETE FROM attachments WHERE issue_id = ANY($1::int[])", [issueIds]);

  const after = list((await call("/rules")).body);
  check("cleanup: only pre-existing rules remain", after.length === existing.length,
    `now=${after.length} before=${existing.length}`);

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
