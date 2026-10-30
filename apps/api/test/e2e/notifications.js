/**
 * E2E: the notification system — who gets notified, ownership of a row,
 * reading (which deletes the row), clear-all and the 401 gate.
 *
 * Prerequisites: a running API (`npm run dev --workspace=@kanban/api`, port
 * 3002) and the local Postgres. Cleanup is done with SQL: the API only
 * soft-deletes issues, so the card is removed for real at the end together
 * with the notifications it produced.
 * Run via: npm run test:e2e --workspace=@kanban/api
 */
const BASE = process.env.API_URL ?? "http://localhost:3002";
const {
  connectDb,
  countTestCards,
  hardDeleteIssues,
} = require("./helpers");
let failures = 0;

async function call(path, { method = "GET", body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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

async function login(email) {
  const res = await call("/auth/login", {
    method: "POST",
    body: { email, password: "123456" },
  });
  return res.body?.token ?? res.body?.accessToken ?? res.body?.access_token ?? null;
}

(async () => {
  const adminToken = await login("aom@gmail.com"); // id 1
  const assigneeToken = await login("programmer@gmail.com"); // id 13
  const reporterToken = await login("arthitaya@gmail.com"); // id 2
  check("logins", !!adminToken && !!assigneeToken && !!reporterToken);
  if (!adminToken || !assigneeToken || !reporterToken) {
    console.log(`\n${failures} FAILURES`);
    process.exit(1);
  }

  const db = connectDb();
  await db.connect();
  // purge leftovers from earlier runs so assertions only see this run's data
  const TITLES = ["E2E notif card", "E2E unassigned card"];
  await db.query("DELETE FROM issues WHERE title = ANY($1::text[]) AND deleted_at IS NOT NULL", [
    TITLES,
  ]);
  await db.query("DELETE FROM notifications WHERE title = ANY($1::text[])", [TITLES]);
  const cardsBefore = await countTestCards(db);

  const statuses = (await call("/issue-statuses?limit=100", { token: adminToken })).body;
  const st = Array.isArray(statuses) ? statuses : statuses?.data;
  const st1 = st[0];
  const categories = (await call("/categories?limit=100", { token: adminToken })).body;
  const cat = (Array.isArray(categories) ? categories : categories?.data)?.[0];

  const before = await call("/notifications?limit=200", { token: assigneeToken });
  check("GET /notifications shape",
    Array.isArray(before.body?.data) && typeof before.body?.unreadCount === "number",
    `rows=${before.body?.data?.length} unread=${before.body?.unreadCount}`);
  const baseUnread = before.body.unreadCount;

  // ── the badge endpoint: a bare number, matching the list's own total ──
  const badge = await call("/notifications/count", { token: assigneeToken });
  check("GET /notifications/count shape",
    badge.status < 300 && typeof badge.body?.count === "number",
    `count=${badge.body?.count}`);
  check("count matches the list total",
    badge.body?.count === before.body?.unreadCount,
    `count=${badge.body?.count} unread=${before.body?.unreadCount}`);
  const anonBadge = await call("/notifications/count");
  check("GET /notifications/count without token => 401",
    anonBadge.status === 401, `status=${anonBadge.status}`);

  // ── create an issue with a category: assignee (13) + reporter (2), actor = aom ──
  const issueRes = await call("/issues", {
    method: "POST",
    token: adminToken,
    body: {
      title: "E2E notif card",
      description: "notif test",
      statusId: st1.id,
      categoryId: cat.id,
      programmerId: 13,
      customerId: 2,
    },
  });
  const issueId = issueRes.body?.id;
  check("issue created (with category)", issueRes.status < 300 && !!issueId, `id=${issueId}`);

  const listFor = async (token) => (await call("/notifications?limit=200", { token })).body;
  const find = (list, action) =>
    (list?.data ?? []).find((n) => n.action === action && n.target === "E2E notif card");

  const assigneeList0 = await listFor(assigneeToken);
  const createdItem = find(assigneeList0, "created");
  check("create notifies the assignee", !!createdItem, `actor=${createdItem?.actorName}`);
  check("create notification carries category context", !!createdItem?.context,
    `context=${createdItem?.context}`);

  // ── comment by aom → assignee + reporter, never the commenter ──
  await call(`/issues/${issueId}/comments`, {
    method: "POST",
    token: adminToken,
    body: { content: "e2e notif ping" },
  });
  const assigneeList = await listFor(assigneeToken);
  const reporterList = await listFor(reporterToken);
  const adminList = await listFor(adminToken);

  const forAssignee = find(assigneeList, "commented");
  check("comment notifies the assignee", !!forAssignee, `actor=${forAssignee?.actorName}`);
  check("comment notifies the reporter", !!find(reporterList, "commented"));
  check("comment does NOT notify the commenter", !find(adminList, "commented"));
  check("comment notification carries category context", !!forAssignee?.context,
    `context=${forAssignee?.context}`);

  check("unreadCount grew", (assigneeList?.unreadCount ?? 0) >= baseUnread + 2,
    `before=${baseUnread} after=${assigneeList?.unreadCount}`);

  // ── assignment: new assignee + reporter get it, actor does not ──
  await call(`/issues/${issueId}/assign`, {
    method: "PUT",
    token: adminToken,
    body: { programmerId: 13 },
  });
  const assigneeAfter = await listFor(assigneeToken);
  const reporterAfter = await listFor(reporterToken);
  const assignedItem = find(assigneeAfter, "assigned");
  check("assign notifies the new assignee", !!assignedItem, `actor=${assignedItem?.actorName}`);
  check("assign notifies the reporter too", !!find(reporterAfter, "assigned"));
  check("assign notification carries category context (fix #2)", !!assignedItem?.context,
    `context=${assignedItem?.context}`);
  check("assign does not notify the actor", !find(await listFor(adminToken), "assigned"));

  // ── ownership: another user cannot delete my notification ──
  const targetId = forAssignee?.id;
  const foreign = await call(`/notifications/${targetId}`, {
    method: "DELETE",
    token: adminToken,
  });
  const stillThere = !!(await listFor(assigneeToken)).data.find((n) => n.id === targetId);
  // Nest returns an empty body when the service answers null (nothing matched)
  check("foreign user cannot delete mine",
    foreign.status < 300 && (foreign.body === null || foreign.body === "") && stillThere,
    `status=${foreign.status} stillThere=${stillThere}`);

  // ── reading one deletes it; clearing all empties the inbox ──
  const markRead = await call(`/notifications/${targetId}`, {
    method: "DELETE",
    token: assigneeToken,
  });
  check("owner read = deleted", markRead.status < 300 && markRead.body?.deleted === true,
    `deleted=${markRead.body?.deleted}`);

  const afterRead = await listFor(assigneeToken);
  const goneAfterRead = !afterRead.data.find((n) => n.id === targetId);
  check("read row is gone and the badge dropped",
    goneAfterRead && (afterRead.unreadCount ?? 99) < (assigneeAfter.unreadCount ?? 0),
    `gone=${goneAfterRead} now=${afterRead.unreadCount} was=${assigneeAfter.unreadCount}`);

  const readAll = await call("/notifications", {
    method: "DELETE",
    token: assigneeToken,
  });
  const finalList = await listFor(assigneeToken);
  check("clear-all empties the inbox and the badge",
    readAll.status < 300 && finalList.unreadCount === 0 && finalList.data.length === 0,
    `status=${readAll.status} deleted=${readAll.body?.deleted} unread=${finalList.unreadCount}`);
  const finalBadge = await call("/notifications/count", { token: assigneeToken });
  check("count follows clear-all to 0", finalBadge.body?.count === 0,
    `count=${finalBadge.body?.count}`);

  // ── auth gate ──
  const anon = await call("/notifications");
  check("GET /notifications without token => 401", anon.status === 401, `status=${anon.status}`);

  // ── soft delete: the issue goes to trash and its notifications stay (by design) ──
  const del = await call(`/issues/${issueId}`, { method: "DELETE", token: adminToken });
  check("issue soft-delete succeeds with notifications present", del.status < 300,
    `status=${del.status} body=${JSON.stringify(del.body)}`);
  const afterDelete = await listFor(assigneeToken);
  check("deleted event notified assignee", !!find(afterDelete, "deleted"));

  // ── admin fan-out (alsoAdmins): every active admin sees new cards and moves.
  // The actor is never notified, so these use a NON-admin actor (the reporter)
  // to prove the admin (aom, id 1) actually receives the row. ──

  // a customer's brand-new UNASSIGNED card still reaches the admins
  const unassignedRes = await call("/issues", {
    method: "POST",
    token: reporterToken,
    body: { title: "E2E unassigned card", description: "fanout test", statusId: st1.id },
  });
  const unassignedId = unassignedRes.body?.id;
  check("unassigned card created", unassignedRes.status < 300 && !!unassignedId,
    `id=${unassignedId}`);
  const adminAfterCreate = await listFor(adminToken);
  const fanoutCreated = (adminAfterCreate?.data ?? []).find(
    (n) => n.action === "created" && n.target === "E2E unassigned card",
  );
  check("create notifies the admin (fan-out, even unassigned)", !!fanoutCreated,
    `actor=${fanoutCreated?.actorName}`);

  // a non-admin move (the assignee drags the card) notifies the admins too —
  // the actor (assignee) is skipped for themselves but the admins still get it
  const secondStatus = st[1] ?? st[0];
  const moveRes = await call(`/issues/${unassignedId}/move`, {
    method: "PUT",
    token: assigneeToken,
    body: { statusId: secondStatus.id },
  });
  check("non-admin move succeeds", moveRes.status < 300, `status=${moveRes.status}`);
  const adminAfterMove = await listFor(adminToken);
  const fanoutMoved = (adminAfterMove?.data ?? []).find(
    (n) => n.action === "moved" && n.target === "E2E unassigned card",
  );
  check("move notifies the admin (fan-out)", !!fanoutMoved, `actor=${fanoutMoved?.actorName}`);

  // cleanup: the notifications, then the cards themselves — DELETE /issues/:id
  // only marks them deleted
  await db.query("DELETE FROM notifications WHERE title = ANY($1::text[])", [TITLES]);
  const left = await db.query(
    "SELECT count(*)::int AS n FROM notifications WHERE title = ANY($1::text[])",
    [TITLES],
  );
  check("cleanup: test notifications removed", left.rows[0].n === 0, `left=${left.rows[0].n}`);

  const removedCards = await hardDeleteIssues(db, [issueId, unassignedId]);
  const leftovers = await countTestCards(db);
  check("cleanup: test cards removed for real", removedCards === 2, `removed=${removedCards}`);
  check("cleanup: card count back to where it started", leftovers === cardsBefore,
    `left=${leftovers} before=${cardsBefore}`);

  await db.end();

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
