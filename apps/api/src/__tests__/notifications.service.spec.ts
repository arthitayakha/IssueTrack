import { NotificationsService } from "../modules/notifications/notifications.service";

/**
 * The recipient policy — the heart of "who hears about what". A manual drag
 * and a rules-engine action both call these two helpers, so these tests pin
 * the whole matrix:
 *
 * - รอรับเรื่อง + nobody on it → admins + reporter (`needs_assignment`)
 * - รอดำเนินการ / กำลังดำเนินการ → reporter + assignee, admins stay out
 * - เสร็จสิ้น → reporter + assignee + admins (`completed`)
 * - any other column → the two people on the card (`moved`)
 * - assign → new assignee + reporter; unassign → the person who lost it + admins
 * - รอดำเนินการ (รับเรื่อง) / เสร็จสิ้น → the reporter also gets an e-mail
 *
 * Stubbed repositories only — safe to run while `npm run dev` is up.
 */

interface Stub {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  count: jest.Mock;
  createQueryBuilder: jest.Mock;
}

/** The chainable `createQueryBuilder` stub `list()` runs — order assertions live here. */
interface StubQueryBuilder {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  offset: jest.Mock;
  limit: jest.Mock;
  getManyAndCount: jest.Mock;
}

function queryBuilder(rows: unknown[] = [], total = 0): StubQueryBuilder {
  const qb = {} as StubQueryBuilder;
  qb.leftJoinAndSelect = jest.fn(() => qb);
  qb.where = jest.fn(() => qb);
  qb.orderBy = jest.fn(() => qb);
  qb.addOrderBy = jest.fn(() => qb);
  qb.offset = jest.fn(() => qb);
  qb.limit = jest.fn(() => qb);
  qb.getManyAndCount = jest.fn(() => Promise.resolve([rows, total]));
  return qb;
}

function repo(overrides: Partial<Stub> = {}): Stub {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (value: Record<string, unknown>) => value),
    create: jest.fn((value: unknown) => value),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(() => queryBuilder()),
    ...overrides,
  };
}

/** The MailService seam — both methods are awaited nowhere, only called. */
function mailStub() {
  return {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendIssueStatusUpdate: jest.fn().mockResolvedValue(undefined),
  };
}

type ServiceArgs = ConstructorParameters<typeof NotificationsService>;

function makeService() {
  const notifications = repo();
  // two active admins by default — the fan-out target
  const users = repo({ find: jest.fn().mockResolvedValue([{ id: 80 }, { id: 81 }]) });
  const mail = mailStub();
  // issue_priorities lookup — null by default = "card has no priority" (medium)
  const priorities = repo();
  const service = new NotificationsService(
    ...([notifications, users, mail, priorities] as unknown as ServiceArgs),
  );
  return { service, notifications, users, mail, priorities };
}

const ISSUE = {
  id: 5,
  title: "POS error",
  programmerId: 7,
  customerId: 9,
  category: { name: "Backend" },
};

/** Every (userId, type) pair the service actually wrote. */
function writtenRows(notifications: Stub) {
  return notifications.save.mock.calls.map(([row]) => ({
    userId: row.userId,
    type: row.type,
  }));
}

describe("NotificationsService.notifyStatusChange — milestone columns", () => {
  it("รอรับเรื่อง with nobody on the card → needs_assignment to admins + reporter", async () => {
    const { service, notifications } = makeService();

    await service.notifyStatusChange({
      issue: { ...ISSUE, programmerId: null },
      statusId: 1,
      actor: { actorId: 3 },
    });

    const rows = writtenRows(notifications);
    expect(rows.map((r) => r.type)).toEqual(["needs_assignment", "needs_assignment", "needs_assignment"]);
    // admins 80/81 + the reporter 9 — never the actor 3 who did the drag
    expect(rows.map((r) => r.userId).sort((a, b) => a - b)).toEqual([9, 80, 81]);
  });

  it("รอดำเนินการ → status_pending to reporter + assignee, admins out", async () => {
    const { service, notifications } = makeService();

    await service.notifyStatusChange({ issue: ISSUE, statusId: 2, actor: { actorId: 3 } });

    const rows = writtenRows(notifications);
    expect(rows.map((r) => r.type)).toEqual(["status_pending", "status_pending"]);
    expect(rows.map((r) => r.userId).sort((a, b) => a - b)).toEqual([7, 9]);
  });

  it("กำลังดำเนินการ → in_progress to reporter + assignee, admins out", async () => {
    const { service, notifications } = makeService();

    await service.notifyStatusChange({ issue: ISSUE, statusId: 3, actor: { actorId: 3 } });

    const rows = writtenRows(notifications);
    expect(rows.map((r) => r.type)).toEqual(["in_progress", "in_progress"]);
    expect(rows.map((r) => r.userId).sort((a, b) => a - b)).toEqual([7, 9]);
  });

  it("เสร็จสิ้น → completed to reporter + assignee + every admin", async () => {
    const { service, notifications } = makeService();

    await service.notifyStatusChange({ issue: ISSUE, statusId: 4, actor: { actorId: 3 } });

    const rows = writtenRows(notifications);
    expect(rows.map((r) => r.type)).toEqual(["completed", "completed", "completed", "completed"]);
    expect(rows.map((r) => r.userId).sort((a, b) => a - b)).toEqual([7, 9, 80, 81]);
  });

  it("any other column (Review, custom) → plain moved to the two people, admins out", async () => {
    const { service, notifications } = makeService();

    await service.notifyStatusChange({ issue: ISSUE, statusId: 7, actor: { actorId: 3 } });

    const rows = writtenRows(notifications);
    expect(rows.map((r) => r.type)).toEqual(["moved", "moved"]);
    expect(rows.map((r) => r.userId).sort((a, b) => a - b)).toEqual([7, 9]);
  });

  it("an assigned card dragged back to รอรับเรื่อง is a routine move, not a cry for help", async () => {
    const { service, notifications } = makeService();

    await service.notifyStatusChange({ issue: ISSUE, statusId: 1, actor: { actorId: 3 } });

    const rows = writtenRows(notifications);
    expect(rows.map((r) => r.type)).toEqual(["moved", "moved"]);
    expect(rows.map((r) => r.userId).sort((a, b) => a - b)).toEqual([7, 9]);
  });

  it("never notifies the actor themselves", async () => {
    const { service, notifications } = makeService();

    await service.notifyStatusChange({
      issue: { ...ISSUE, customerId: 3 },
      statusId: 4,
      actor: { actorId: 3 },
    });

    expect(writtenRows(notifications).map((r) => r.userId)).not.toContain(3);
  });
});

/**
 * The e-mail twin of the two milestone columns (รับเรื่อง = id 2,
 * เสร็จสิ้น = id 4) — always to the reporter, never to anyone else, and
 * never breaking the in-app rows around it.
 */
describe("NotificationsService.notifyStatusChange — milestone e-mail", () => {
  const REPORTER = { id: 9, name: "Arthitaya", email: "arthitaya@gmail.com" };

  it("รอดำเนินการ (รับเรื่อง) → e-mails the reporter with the live column name", async () => {
    const { service, mail, users } = makeService();
    users.findOne.mockResolvedValue(REPORTER);

    await service.notifyStatusChange({
      issue: ISSUE,
      statusId: 2,
      statusName: "รอดำเนินการ",
      actor: { actorId: 3 },
    });

    expect(mail.sendIssueStatusUpdate).toHaveBeenCalledTimes(1);
    expect(mail.sendIssueStatusUpdate).toHaveBeenCalledWith({
      to: "arthitaya@gmail.com",
      name: "Arthitaya",
      title: "POS error",
      statusName: "รอดำเนินการ",
      url: expect.stringContaining("/boards?issue=5"),
    });
    // the reporter row is looked up by id — nothing else reads the users table
    expect(users.findOne).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  it("เสร็จสิ้น → e-mails the reporter too (every entry, not just the first)", async () => {
    const { service, mail, users } = makeService();
    users.findOne.mockResolvedValue(REPORTER);

    await service.notifyStatusChange({
      issue: ISSUE,
      statusId: 4,
      statusName: "เสร็จสิ้น",
      actor: { actorId: 3 },
    });

    expect(mail.sendIssueStatusUpdate).toHaveBeenCalledTimes(1);
    expect(mail.sendIssueStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "arthitaya@gmail.com",
        statusName: "เสร็จสิ้น",
      }),
    );
  });

  it("falls back to the default column name when the caller passes none", async () => {
    const { service, mail, users } = makeService();
    users.findOne.mockResolvedValue(REPORTER);

    await service.notifyStatusChange({ issue: ISSUE, statusId: 4, actor: { actorId: 3 } });

    expect(mail.sendIssueStatusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ statusName: "เสร็จสิ้น" }),
    );
  });

  it.each([1, 3, 7])("status %i → no e-mail (only the two milestones mail)", async (statusId) => {
    const { service, mail, users } = makeService();
    users.findOne.mockResolvedValue(REPORTER);

    await service.notifyStatusChange({ issue: ISSUE, statusId, actor: { actorId: 3 } });

    expect(mail.sendIssueStatusUpdate).not.toHaveBeenCalled();
    // the in-app policy still ran as always
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it("a card with no reporter → no lookup, no mail", async () => {
    const { service, mail, users } = makeService();

    await service.notifyStatusChange({
      issue: { ...ISSUE, customerId: null },
      statusId: 4,
      actor: { actorId: 3 },
    });

    expect(users.findOne).not.toHaveBeenCalled();
    expect(mail.sendIssueStatusUpdate).not.toHaveBeenCalled();
  });

  it("the reporter moving their own card → no mail (never notify yourself)", async () => {
    const { service, mail, users } = makeService();
    users.findOne.mockResolvedValue(REPORTER);

    await service.notifyStatusChange({
      issue: ISSUE,
      statusId: 4,
      actor: { actorId: 9 },
    });

    expect(users.findOne).not.toHaveBeenCalled();
    expect(mail.sendIssueStatusUpdate).not.toHaveBeenCalled();
  });

  it("a reporter row that is gone → no mail, and the in-app rows still land", async () => {
    const { service, notifications, mail, users } = makeService();
    users.findOne.mockResolvedValue(null);

    await service.notifyStatusChange({
      issue: ISSUE,
      statusId: 4,
      actor: { actorId: 3 },
    });

    expect(mail.sendIssueStatusUpdate).not.toHaveBeenCalled();
    expect(writtenRows(notifications).map((r) => r.type)).toEqual([
      "completed",
      "completed",
      "completed",
      "completed",
    ]);
  });

  it("a rejected user lookup never breaks the move (fail-open)", async () => {
    const { service, notifications, mail, users } = makeService();
    users.findOne.mockRejectedValue(new Error("connection lost"));

    await expect(
      service.notifyStatusChange({ issue: ISSUE, statusId: 4, actor: { actorId: 3 } }),
    ).resolves.toBeUndefined();

    expect(mail.sendIssueStatusUpdate).not.toHaveBeenCalled();
    expect(writtenRows(notifications).length).toBeGreaterThan(0);
  });

  it("a mail that rejects never bubbles up (fire-and-forget)", async () => {
    const { service, notifications, mail, users } = makeService();
    users.findOne.mockResolvedValue(REPORTER);
    mail.sendIssueStatusUpdate.mockRejectedValue(new Error("smtp down"));

    await expect(
      service.notifyStatusChange({ issue: ISSUE, statusId: 2, actor: { actorId: 3 } }),
    ).resolves.toBeUndefined();

    // the in-app rows are written before the send is kicked off
    expect(writtenRows(notifications).map((r) => r.type)).toEqual([
      "status_pending",
      "status_pending",
    ]);
  });
});

describe("NotificationsService.notifyAssignmentChange — assignment changes", () => {
  it("assigning → assigned to the new assignee + the reporter", async () => {
    const { service, notifications } = makeService();

    await service.notifyAssignmentChange({
      issue: ISSUE,
      assigneeId: 7,
      previousAssigneeId: null,
      actor: { actorId: 3 },
    });

    const rows = writtenRows(notifications);
    expect(rows.map((r) => r.type)).toEqual(["assigned", "assigned"]);
    expect(rows.map((r) => r.userId).sort((a, b) => a - b)).toEqual([7, 9]);
  });

  it("unassigning → unassigned to the person who lost it + every admin", async () => {
    const { service, notifications } = makeService();

    await service.notifyAssignmentChange({
      issue: ISSUE,
      assigneeId: null,
      previousAssigneeId: 7,
      actor: { actorId: 3 },
    });

    const rows = writtenRows(notifications);
    expect(rows.map((r) => r.type)).toEqual(["unassigned", "unassigned", "unassigned"]);
    expect(rows.map((r) => r.userId).sort((a, b) => a - b)).toEqual([7, 80, 81]);
  });

  it("unassigning a card that was already free says nothing", async () => {
    const { service, notifications } = makeService();

    await service.notifyAssignmentChange({
      issue: ISSUE,
      assigneeId: null,
      previousAssigneeId: null,
      actor: { actorId: 3 },
    });

    expect(notifications.save).not.toHaveBeenCalled();
  });
});

describe("NotificationsService.count — the badge number only", () => {
  it("answers { count } for the caller's own rows and reads no rows", async () => {
    const { service, notifications } = makeService();
    notifications.count.mockResolvedValue(43);

    await expect(service.count(1)).resolves.toEqual({ count: 43 });
    // a plain COUNT over this user's rows — no list query, no actor join
    expect(notifications.count).toHaveBeenCalledWith({ where: { userId: 1 } });
    expect(notifications.find).not.toHaveBeenCalled();
  });

  it("is scoped to the caller, so another user's inbox never leaks in", async () => {
    const { service, notifications } = makeService();
    notifications.count.mockResolvedValue(0);

    await expect(service.count(99)).resolves.toEqual({ count: 0 });
    expect(notifications.count).toHaveBeenCalledWith({ where: { userId: 99 } });
  });
});

describe("NotificationsService.notifyStaleCard — the 09:00 bell", () => {
  it("rings the assignee + every admin once, with status and days in the context", async () => {
    const { service, notifications } = makeService();

    await service.notifyStaleCard({
      issue: ISSUE,
      statusName: "เสร็จสิ้น",
      days: 3,
    });

    const rows = notifications.save.mock.calls.map(([row]) => row);
    // assignee 7 + admins 80/81 — deduped, and no actor to skip (system send)
    expect(rows.map((r) => r.userId).sort((a, b) => a - b)).toEqual([7, 80, 81]);
    expect(new Set(rows.map((r) => r.type))).toEqual(new Set(["stale"]));
    expect(rows[0].context).toBe("เสร็จสิ้น · 3 วัน");
    // straight to the card behind the bell
    expect(rows[0].link).toBe("/boards?issue=5");
    expect(rows[0].title).toBe("POS error");
  });

  it("a card with nobody on it still reaches the admins", async () => {
    const { service, notifications } = makeService();

    await service.notifyStaleCard({
      issue: { ...ISSUE, programmerId: null },
      statusName: "เสร็จสิ้น",
      days: 7,
    });

    const rows = notifications.save.mock.calls.map(([row]) => row.userId);
    expect(rows.sort((a, b) => a - b)).toEqual([80, 81]);
  });

  it("an admin who is also the assignee gets one row, not two", async () => {
    const { service, notifications } = makeService();

    await service.notifyStaleCard({
      issue: { ...ISSUE, programmerId: 80 },
      statusName: "รอดำเนินการ",
      days: 14,
    });

    const rows = notifications.save.mock.calls.map(([row]) => row.userId).sort();
    expect(rows).toEqual([80, 81]);
  });

  it("keeps the bell when the admin list cannot be read — the assignee still hears", async () => {
    const { service, notifications, users } = makeService();
    users.find.mockRejectedValue(new Error("connection lost"));

    await service.notifyStaleCard({
      issue: ISSUE,
      statusName: "เสร็จสิ้น",
      days: 3,
    });

    const rows = notifications.save.mock.calls.map(([row]) => row.userId);
    expect(rows).toEqual([7]);
  });
});

/**
 * ความสำคัญของแถวแจ้งเตือน — 2 ทางผสมกัน (ข้อตกลงกับผู้ใช้):
 *  การ์ดที่ผูก issue → ยืม `issues.priority_id` (แปลงจากชื่อ ครั้งเดียวต่อ event)
 *  ชนิดระบบ → hardcode `FIXED_PRIORITY` → ไม่มีอะไรเลย → medium (fail-open)
 *
 * ค่านี้ขับ 3 อย่าง: ลำดับเรียงในกล่องเข้า, สี chip, หน้าต่างเตือน 7/3/1 วัน
 */
describe("NotificationsService — notification priority", () => {
  function written(notifications: Stub) {
    return notifications.save.mock.calls.map(([row]) => row as Record<string, unknown>);
  }

  it("a card-linked event borrows the card's priority — Critical → high", async () => {
    const { service, notifications, priorities } = makeService();
    priorities.findOne.mockResolvedValue({ id: 4, name: "Critical" });

    await service.notifyStatusChange({
      issue: { ...ISSUE, priorityId: 4 },
      statusId: 4, // เสร็จสิ้น → 4 ผู้รับ
      actor: { actorId: 3 },
    });

    const rows = written(notifications);
    expect(rows.length).toBe(4);
    expect(new Set(rows.map((r) => r.priority))).toEqual(new Set(["high"]));
    // resolved ONCE for the whole event — not once per recipient
    expect(priorities.findOne).toHaveBeenCalledTimes(1);
    expect(priorities.findOne).toHaveBeenCalledWith({ where: { id: 4 } });
  });

  it("a Low card → low rows (no floor — the card decides)", async () => {
    const { service, notifications, priorities } = makeService();
    priorities.findOne.mockResolvedValue({ id: 1, name: "Low" });

    await service.notifyStatusChange({
      issue: { ...ISSUE, priorityId: 1 },
      statusId: 7,
      actor: { actorId: 3 },
    });

    expect(new Set(written(notifications).map((r) => r.priority))).toEqual(new Set(["low"]));
  });

  it("a renamed/unknown priority name falls back to medium (fail-open)", async () => {
    const { service, notifications, priorities } = makeService();
    priorities.findOne.mockResolvedValue({ id: 9, name: "เร่งด่วนมาก" });

    await service.notifyStatusChange({
      issue: { ...ISSUE, priorityId: 9 },
      statusId: 7,
      actor: { actorId: 3 },
    });

    expect(new Set(written(notifications).map((r) => r.priority))).toEqual(new Set(["medium"]));
  });

  it("a card with no priority set → medium, without touching the lookup", async () => {
    const { service, notifications, priorities } = makeService();

    await service.notifyStatusChange({ issue: ISSUE, statusId: 7, actor: { actorId: 3 } });

    expect(priorities.findOne).not.toHaveBeenCalled();
    expect(new Set(written(notifications).map((r) => r.priority))).toEqual(new Set(["medium"]));
  });

  it("a broken priority lookup never drops the bell — rows still land as medium", async () => {
    const { service, notifications, priorities } = makeService();
    priorities.findOne.mockRejectedValue(new Error("connection lost"));

    await expect(
      service.notifyStatusChange({
        issue: { ...ISSUE, priorityId: 3 },
        statusId: 7,
        actor: { actorId: 3 },
      }),
    ).resolves.toBeUndefined();

    const rows = written(notifications);
    expect(rows.length).toBe(2);
    expect(new Set(rows.map((r) => r.priority))).toEqual(new Set(["medium"]));
  });

  it("stale bells inherit the card's priority too — one lookup for the fan-out", async () => {
    const { service, notifications, priorities } = makeService();
    priorities.findOne.mockResolvedValue({ id: 3, name: "High" });

    await service.notifyStaleCard({
      issue: { ...ISSUE, priorityId: 3 },
      statusName: "เสร็จสิ้น",
      days: 3,
    });

    expect(new Set(written(notifications).map((r) => r.priority))).toEqual(new Set(["high"]));
    expect(priorities.findOne).toHaveBeenCalledTimes(1);
  });

  it("system rows use the hardcoded map — rule_updated low, app_expiring medium, ma_depleted high", async () => {
    const { service, notifications } = makeService();

    await service.notify({ userId: 1, action: "rule_updated", title: "แก้ไขกฎ A" });
    await service.notify({ userId: 1, action: "app_expiring", title: "POS ใกล้หมดอายุ" });
    await service.notify({ userId: 1, action: "ma_depleted", title: "POS MA หมด" });
    await service.notify({ userId: 1, action: "commented", title: "ไม่มีบัตร — กลาง" });

    expect(written(notifications).map((r) => r.priority)).toEqual([
      "low",
      "medium",
      "high",
      "medium",
    ]);
  });

  it("an explicit priority beats both maps (a system row can override its level)", async () => {
    const { service, notifications } = makeService();

    // ma_depleted sits at "high" in FIXED_PRIORITY — the explicit level wins
    await service.notify({
      userId: 1,
      action: "ma_depleted",
      title: "POS MA หมด",
      priority: "medium",
    });

    expect(written(notifications)[0].priority).toBe("medium");
  });
});

/**
 * ลำดับกล่องเข้า — สูง → กลาง → ต่ำ แล้วใหม่สุดก่อน · ทำไมไม่ใช้ `find()`:
 * `priority` เป็น varchar ซึ่ง alphabetical ให้ `high < low < medium` (ผิดทิศ!)
 * จึงต้อง CASE rank และทำที่ server เพราะหน้าจอโหลดทีละ 20 แถว
 */
describe("NotificationsService.list — order and response shape", () => {
  it("orders CASE high → medium → low, then newest first, over the caller's rows", async () => {
    const { service, notifications } = makeService();
    const createdAt = new Date("2026-11-16T03:00:00.000Z");
    const qb = queryBuilder([{ id: 11, priority: "high", type: "moved", title: "POS", createdAt }], 1);
    notifications.createQueryBuilder.mockReturnValue(qb);

    const res = await service.list(7, { limit: 20 });

    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith("n.actor", "actor");
    expect(qb.where).toHaveBeenCalledWith("n.user_id = :userId", { userId: 7 });
    // the CASE is the whole point — a plain `ORDER BY priority` sorts low before medium
    expect(qb.orderBy).toHaveBeenCalledWith(
      expect.stringContaining("CASE n.priority WHEN 'high' THEN 0"),
      "ASC",
    );
    expect(qb.addOrderBy).toHaveBeenCalledWith("n.created_at", "DESC");
    expect(qb.addOrderBy).toHaveBeenCalledWith("n.id", "DESC");
    // `.limit/.offset` on purpose — `.take/.skip` + join flips TypeORM into its
    // two-query id pagination, whose ORDER BY builder reads "CASE n.priority"
    // as an alias named "CASE n" and throws (documented in list())
    expect(qb.limit).toHaveBeenCalledWith(20);
    expect(qb.offset).toHaveBeenCalledWith(0);
    // no legacy find()/count() — the ordering only exists in the query builder
    expect(notifications.find).not.toHaveBeenCalled();
    expect(notifications.count).not.toHaveBeenCalled();
    // the row keeps every existing field and gains priority
    expect(res.data[0]).toMatchObject({
      id: 11,
      action: "moved",
      target: "POS",
      priority: "high",
      createdAt,
    });
    expect(res.total).toBe(1);
    expect(res.unreadCount).toBe(1);
    expect(res.page).toBe(1);
  });
});
