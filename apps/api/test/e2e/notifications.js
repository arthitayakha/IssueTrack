/**
 * E2E: the notification system — who gets notified, ownership of a row,
 * read / read-all / archive and the 401 gate.
 *
 * Prerequisites: a running API (`npm run dev --workspace=@kanban/api`, port
 * 3002) and the local Postgres. Cleanup is done with SQL: the API only
 * soft-deletes issues, so the card is removed for real at the end together
 * with the notifications it produced and the `rule_runs` rows it caused.
 * Run via: npm run test:e2e --workspace=@kanban/api
 */
const BASE = process.env.API_URL ?? "http://localhost:3002";
const {
  captureRunWatermark,
  cleanupRunRows,
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
  const watermark = await captureRunWatermark(db);
  // purge leftovers from earlier runs so assertions only see this run's data
  await db.query("DELETE FROM issues WHERE title = $1 AND deleted_at IS NOT NULL", [
    "E2E notif card",
  ]);
  await db.query("DELETE FROM notifications WHERE title = $1", ["E2E notif card"]);
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

  // ── ownership: another user cannot mutate my notification ──
  const targetId = forAssignee?.id;
  const foreign = await call(`/notifications/${targetId}/read`, {
    method: "PATCH",
    token: adminToken,
  });
  const stillUnread = !(await listFor(assigneeToken)).data.find((n) => n.id === targetId)?.isRead;
  // Nest returns an empty body when the service answers null (nothing updated)
  check("foreign user cannot mark mine as read",
    foreign.status < 300 && (foreign.body === null || foreign.body === "") && stillUnread,
    `status=${foreign.status} stillUnread=${stillUnread}`);

  // ── mark read / archive / read-all ──
  const markRead = await call(`/notifications/${targetId}/read`, {
    method: "PATCH",
    token: assigneeToken,
  });
  check("owner markRead works", markRead.status < 300 && markRead.body?.isRead === true,
    `isRead=${markRead.body?.isRead}`);

  const afterRead = await listFor(assigneeToken);
  check("unreadCount drops after read",
    (afterRead.unreadCount ?? 99) < (assigneeAfter.unreadCount ?? 0),
    `now=${afterRead.unreadCount} was=${assigneeAfter.unreadCount}`);

  const archive = await call(`/notifications/${targetId}/archive`, {
    method: "PATCH",
    token: assigneeToken,
  });
  check("archive works", archive.status < 300 && archive.body?.isArchived === true,
    `isArchived=${archive.body?.isArchived}`);

  const readAll = await call("/notifications/read-all", {
    method: "POST",
    token: assigneeToken,
  });
  const finalList = await listFor(assigneeToken);
  check("read-all works and clears the badge",
    readAll.status < 300 && finalList.unreadCount === 0,
    `status=${readAll.status} updated=${readAll.body?.updated} unread=${finalList.unreadCount}`);

  // ── auth gate ──
  const anon = await call("/notifications");
  check("GET /notifications without token => 401", anon.status === 401, `status=${anon.status}`);

  // ── soft delete: the issue goes to trash and its notifications stay (by design) ──
  const del = await call(`/issues/${issueId}`, { method: "DELETE", token: adminToken });
  check("issue soft-delete succeeds with notifications present", del.status < 300,
    `status=${del.status} body=${JSON.stringify(del.body)}`);
  const afterDelete = await listFor(assigneeToken);
  check("deleted event notified assignee", !!find(afterDelete, "deleted"));

  // cleanup: the notifications, then the card itself — DELETE /issues/:id only
  // marks it deleted, and its run rows must not outlive the test either
  await db.query("DELETE FROM notifications WHERE title = $1", ["E2E notif card"]);
  const left = await db.query(
    "SELECT count(*)::int AS n FROM notifications WHERE title = $1",
    ["E2E notif card"],
  );
  check("cleanup: test notifications removed", left.rows[0].n === 0, `left=${left.rows[0].n}`);

  const removedCards = await hardDeleteIssues(db, [issueId]);
  const removedRuns = await cleanupRunRows(db, watermark);
  const leftovers = await countTestCards(db);
  check("cleanup: test card removed for real", removedCards === 1, `removed=${removedCards}`);
  check("cleanup: card count back to where it started", leftovers === cardsBefore,
    `left=${leftovers} before=${cardsBefore}`);
  console.log(`       run rows removed: ${removedRuns}`);

  await db.end();

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
