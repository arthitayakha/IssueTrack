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
    sendMaDepleted: jest.fn().mockResolvedValue(undefined),
    sendAppExpiry: jest.fn().mockResolvedValue(undefined),
    sendContactMessage: jest.fn().mockResolvedValue(undefined),
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
  const permissions = { hasPermission: jest.fn().mockResolvedValue(true) };
  const stream = { subscribe: jest.fn(), unsubscribe: jest.fn(), emit: jest.fn() };
  const service = new NotificationsService(
    ...([notifications, users, mail, priorities, permissions, stream] as unknown as ServiceArgs),
  );
  return { service, notifications, users, mail, priorities, permissions, stream };
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
 * Contract events — วันหมดอายุ / MA หมด / ต่ออายุ / ซื้อชม. ต้องมี " audience
 * เดียวกัน" (ลูกค้าของบริษัท + แอดมิน) และแยกว่าอันไหนได้อีเมลบ้าง
 */
describe("NotificationsService — contract audience, contact hint and mail policy", () => {
  const ADMIN = { id: 1, name: "aom", email: "admin@x.com", roleId: 1, positionId: null };
  const CUSTOMER = { id: 2, name: "ลูกค้า", email: "customer@x.com", roleId: 3, positionId: null, companyId: 5 };

  function withAudience(service: ReturnType<typeof makeService>) {
    service.users.find.mockImplementation((opts?: { where?: { role?: { name?: string } } }) => {
      const role = opts?.where?.role?.name;
      if (role === "admin") return Promise.resolve([ADMIN]);
      if (role === "customer") return Promise.resolve([CUSTOMER]);
      return Promise.resolve([]);
    });
  }

  function rows(notifications: Stub) {
    return notifications.save.mock.calls.map(([row]) => row as Record<string, unknown>);
  }

  it("expiry reaches the customer AND the admin; only the customer row/mail carries the contact hint", async () => {
    const ctx = makeService();
    withAudience(ctx);

    await ctx.service.notifyAppExpiry({
      companyId: 5,
      appId: 7,
      appName: "CRM",
      companyName: "บริษัท ครัวบ้านสวน จำกัด",
      action: "app_expired",
      title: "CRM บริษัท ครัวบ้านสวน จำกัด",
      context: "เลยกำหนด 1 วัน",
      daysLeft: -1,
    });

    const writtenRows = rows(ctx.notifications);
    expect(writtenRows).toHaveLength(2);
    expect(writtenRows.map((r) => r.userId)).toEqual([2, 1]);
    expect(writtenRows[0]).toMatchObject({
      type: "app_expired",
      context: "เลยกำหนด 1 วัน • ติดต่อ: admin@x.com",
      link: "/systems?app=7&company=5",
      appId: 7,
      companyId: 5,
      priority: "high",
    });
    expect(writtenRows[1].context).toBe("เลยกำหนด 1 วัน");
    expect(ctx.mail.sendAppExpiry).toHaveBeenCalledTimes(2);
    expect(ctx.mail.sendAppExpiry).toHaveBeenCalledWith(
      expect.objectContaining({ to: "customer@x.com", contact: "ติดต่อผู้ดูแลระบบ: admin@x.com" }),
    );
    expect(ctx.mail.sendAppExpiry).toHaveBeenCalledWith(
      expect.objectContaining({ to: "admin@x.com", contact: null }),
    );
  });

  it("MA depletion keeps the audience but switches every link to /systems", async () => {
    const ctx = makeService();
    withAudience(ctx);

    await ctx.service.notifyMaDepleted({
      companyId: 5,
      appId: 7,
      appName: "POS",
      companyName: "บริษัท ครัวบ้านสวน จำกัด",
      maHours: 80,
      usedHours: 80,
    });

    const writtenRows = rows(ctx.notifications);
    expect(writtenRows.map((r) => r.userId)).toEqual([2, 1]);
    expect(writtenRows.every((r) => r.link === "/systems?app=7&company=5")).toBe(true);
    expect(writtenRows[0].context).toBe("ใช้ไป 80 / 80 ชม. • ติดต่อ: admin@x.com");
    expect(ctx.mail.sendMaDepleted).toHaveBeenCalledTimes(2);
  });

  it("customer without system.view falls back to /boards", async () => {
    const ctx = makeService();
    withAudience(ctx);
    ctx.permissions.hasPermission.mockResolvedValue(false);

    await ctx.service.notifyMaDepleted({
      companyId: 5,
      appId: 7,
      appName: "POS",
      companyName: "ACME",
      maHours: 10,
      usedHours: 10,
    });

    expect(rows(ctx.notifications).map((r) => r.link)).toEqual([
      "/boards",
      "/systems?app=7&company=5",
    ]);
  });

  it("renew / buy-hours notify both sides IN APP only — no mail, no contact hint, low priority", async () => {
    const ctx = makeService();
    withAudience(ctx);

    await ctx.service.notifyContractChange({
      companyId: 5,
      appId: 7,
      appName: "POS",
      companyName: "ACME",
      action: "app_renewed",
      context: "MA 80 ชม.",
    });
    await ctx.service.notifyContractChange({
      companyId: 5,
      appId: 7,
      appName: "POS",
      companyName: "ACME",
      action: "app_hours_purchased",
      context: "+40 ชม. (รวม 80 ชม.)",
    });

    expect(rows(ctx.notifications).map((r) => r.type)).toEqual([
      "app_renewed",
      "app_renewed",
      "app_hours_purchased",
      "app_hours_purchased",
    ]);
    expect(new Set(rows(ctx.notifications).map((r) => r.priority))).toEqual(new Set(["low"]));
    expect(rows(ctx.notifications).every((r) => !String(r.context).includes("ติดต่อ"))).toBe(true);
    expect(ctx.mail.sendMaDepleted).not.toHaveBeenCalled();
    expect(ctx.mail.sendAppExpiry).not.toHaveBeenCalled();
  });

  it("a broken customer lookup still leaves the admins hearing about it", async () => {
    const ctx = makeService();
    ctx.users.find.mockImplementation((opts?: { where?: { role?: { name?: string } } }) => {
      if (opts?.where?.role?.name === "customer") return Promise.reject(new Error("db down"));
      return Promise.resolve([ADMIN]);
    });

    await expect(
      ctx.service.notifyAppExpiry({
        companyId: 5,
        appId: 7,
        appName: "POS",
        companyName: "ACME",
        action: "app_expiring",
        title: "POS ACME",
        context: "เหลือ 5 วัน",
        daysLeft: 5,
      }),
    ).resolves.toBeUndefined();

    expect(rows(ctx.notifications).map((r) => r.userId)).toEqual([1]);
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

/**
 * ช่องทางติดต่อของฝ่ายตรงข้าม — แอดมินได้ลูกค้า (ผู้ดูมี `user.view`),
 * ลูกค้าได้แอดมิน (Every notification row) · `/systems` เรียก `contactsForCompany`
 * หรือ `adminContacts` เองตามสิทธิ์ของผู้ดู
 */
describe("NotificationsService — contacts", () => {
  const CUSTOMER = {
    id: 2,
    name: "ลูกค้า",
    email: "customer@x.com",
    phone: "081-234-5678",
    companyId: 5,
    roleId: 3,
  };

  it("contactsForCompany returns active customers with phone and fails open", async () => {
    const ctx = makeService();
    ctx.users.find.mockResolvedValue([CUSTOMER]);
    await expect(ctx.service.contactsForCompany(5)).resolves.toEqual([
      {
        userId: 2,
        name: "ลูกค้า",
        email: "customer@x.com",
        phone: "081-234-5678",
      },
    ]);
    expect(ctx.users.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 5 }) }),
    );
    ctx.users.find.mockRejectedValueOnce(new Error("db down"));
    await expect(ctx.service.contactsForCompany(5)).resolves.toEqual([]);
  });

  it("maySeeContacts is gated by user.view (admins only)", async () => {
    const ctx = makeService();
    ctx.users.findOne.mockResolvedValue({ id: 1, roleId: 1, positionId: null });
    ctx.permissions.hasPermission.mockResolvedValueOnce(true);
    await expect(ctx.service.maySeeContacts(1)).resolves.toBe(true);
    expect(ctx.permissions.hasPermission).toHaveBeenCalledWith(1, "user.view", null);
    ctx.permissions.hasPermission.mockResolvedValueOnce(false);
    await expect(ctx.service.maySeeContacts(1)).resolves.toBe(false);
    ctx.users.findOne.mockResolvedValue(null);
    await expect(ctx.service.maySeeContacts(999)).resolves.toBe(false);
  });

  it("adminContacts returns active admins and fails open", async () => {
    const ctx = makeService();
    ctx.users.find.mockResolvedValue([
      { id: 1, name: "แอดมิน", email: "admin@x.com", phone: "081-999-9999", roleId: 1 },
    ]);
    await expect(ctx.service.adminContacts()).resolves.toEqual([
      { userId: 1, name: "แอดมิน", email: "admin@x.com", phone: "081-999-9999" },
    ]);
    expect(ctx.users.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ role: { name: "admin" } }) }),
    );
    ctx.users.find.mockRejectedValueOnce(new Error("db down"));
    await expect(ctx.service.adminContacts()).resolves.toEqual([]);
  });

  it("list() attaches customer contacts to admins and admin contacts to customers", async () => {
    const ctx = makeService();
    const contract = {
      id: 11,
      type: "ma_depleted",
      title: "POS ครัวบ้านสวน",
      context: "ใช้ไป 10 / 10 ชม.",
      link: "/systems?app=7&company=5",
      appId: 7,
      companyId: 5,
      issueId: null,
      priority: "high",
      createdAt: new Date(),
      actor: null,
    };
    ctx.notifications.createQueryBuilder.mockReturnValue(
      queryBuilder([contract], 1),
    );
    const ADMIN_CONTACT = {
      id: 9,
      name: "แอดมิน",
      email: "admin@x.com",
      phone: "081-999-9999",
      roleId: 1,
    };
    ctx.users.findOne.mockResolvedValue({ id: 1, roleId: 1, positionId: null });
    ctx.users.find.mockImplementation(
      (opts?: { where?: { role?: { name?: string } } }) =>
        Promise.resolve(opts?.where?.role?.name === "admin" ? [ADMIN_CONTACT] : [CUSTOMER]),
    );
    ctx.permissions.hasPermission.mockResolvedValue(true);

    const admin = await ctx.service.list(1);
    expect(admin.data[0]).toMatchObject({
      appId: 7,
      companyId: 5,
      contacts: [
        {
          userId: 2,
          name: "ลูกค้า",
          email: "customer@x.com",
          phone: "081-234-5678",
        },
      ],
    });

    // ลูกค้า/โปรแกรมเมอร์ได้แถวเหมือนกัน แต่ได้รายชื่อแอดมิน (ไม่ใช่ข้อมูลลูกค้าคนอื่น)
    ctx.permissions.hasPermission.mockResolvedValue(false);
    const staff = await ctx.service.list(2);
    expect(staff.data[0].contacts).toEqual([
      { userId: 9, name: "แอดมิน", email: "admin@x.com", phone: "081-999-9999" },
    ]);
  });
});

/** กด "แจ้งเตือน..." จากสัญญา — in-app row + mail, ผู้รับถูกกำหนดฝั่งเซิร์ฟเวอร์ */
describe("NotificationsService.notifyContactMessage", () => {
  const INPUT = {
    fromUserId: 1,
    message: "  ขอต่ออายุสัญญาหน่อยครับ  ",
    appId: 7,
    companyId: 5,
    appName: "POS",
    companyName: "ครัวบ้านสวน",
  };

  it("admin → active customers of the company (in-app + email), never the actor", async () => {
    const ctx = makeService();
    ctx.users.findOne.mockResolvedValue({
      id: 1,
      name: "แอดมิน",
      roleId: 1,
      positionId: null,
      companyId: null,
    });
    ctx.users.find.mockResolvedValue([
      { id: 2, name: "ลูกค้า", email: "customer@x.com" },
      { id: 1, name: "แอดมิน", email: "admin@x.com" },
    ]);
    ctx.permissions.hasPermission.mockResolvedValue(true);

    await expect(ctx.service.notifyContactMessage(INPUT)).resolves.toEqual({ sent: 1 });
    expect(writtenRows(ctx.notifications)).toEqual([
      { userId: 2, type: "contact_message" },
    ]);
    const row = ctx.notifications.save.mock.calls[0][0] as Record<string, unknown>;
    expect(row.context).toBe("ขอต่ออายุสัญญาหน่อยครับ");
    expect(row.link).toBe("/systems?app=7&company=5");
    expect(row.appId).toBe(7);
    expect(row.companyId).toBe(5);
    expect(row.actorId).toBe(1);
    expect(ctx.mail.sendContactMessage).toHaveBeenCalledTimes(1);
    expect(ctx.mail.sendContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({ to: "customer@x.com", fromName: "แอดมิน", message: "ขอต่ออายุสัญญาหน่อยครับ" }),
    );
  });

  it("customer → primary admin only, and a cross-company contract is refused", async () => {
    const ctx = makeService();
    ctx.users.findOne.mockImplementation((opts?: { where?: { id?: number; role?: { name?: string } } }) => {
      if (opts?.where?.role?.name === "admin") {
        return Promise.resolve({ id: 1, name: "แอดมิน", email: "admin@x.com", roleId: 1 });
      }
      return Promise.resolve({ id: 2, name: "ลูกค้า", roleId: 3, companyId: 5 });
    });
    ctx.permissions.hasPermission.mockResolvedValue(false);

    const asCustomer = { ...INPUT, fromUserId: 2 };
    await expect(ctx.service.notifyContactMessage(asCustomer)).resolves.toEqual({ sent: 1 });
    expect(writtenRows(ctx.notifications)).toEqual([{ userId: 1, type: "contact_message" }]);
    expect(ctx.mail.sendContactMessage).toHaveBeenCalledTimes(1);

    await expect(ctx.service.notifyContactMessage({ ...asCustomer, companyId: 99 })).rejects.toThrow();
  });

  it("rejects an empty or too-long message before writing anything", async () => {
    const ctx = makeService();
    await expect(ctx.service.notifyContactMessage({ ...INPUT, message: "   " })).rejects.toThrow();
    await expect(ctx.service.notifyContactMessage({ ...INPUT, message: "x".repeat(201) })).rejects.toThrow();
    expect(ctx.notifications.save).not.toHaveBeenCalled();
  });
});

describe("NotificationsService.notify — real-time stream fan-out", () => {
  const ROW = {
    id: 77,
    userId: 42,
    actorId: 9,
    actor: { id: 9, name: "สมชาย" },
    type: "assigned",
    title: "ทดสอบระบบ",
    context: null,
    link: "/boards?issue=5",
    issueId: 5,
    appId: null,
    companyId: null,
    priority: "medium",
    createdAt: new Date("2026-11-23T10:00:00Z"),
  };

  it("emits the same toResponse shape the inbox uses, to the row's owner", async () => {
    const ctx = makeService();
    ctx.notifications.save.mockResolvedValueOnce({ ...ROW, id: 77 });
    ctx.notifications.findOne.mockResolvedValueOnce(ROW);

    await ctx.service.notify({
      userId: 42,
      action: "assigned",
      title: "ทดสอบระบบ",
      actor: { actorId: 9 },
    });
    // fire-and-forget: let the requery microtask settle
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.notifications.findOne).toHaveBeenCalledWith({
      where: { id: 77 },
      relations: ["actor"],
    });
    expect(ctx.stream.emit).toHaveBeenCalledTimes(1);
    const [userId, payload] = ctx.stream.emit.mock.calls[0] as [number, Record<string, unknown>];
    expect(userId).toBe(42);
    expect(payload).toMatchObject({
      id: 77,
      action: "assigned",
      actorName: "สมชาย",
      target: "ทดสอบระบบ",
      issueId: 5,
      priority: "medium",
    });
  });

  it("skips a recipient that matches the actor (no self-toast)", async () => {
    const ctx = makeService();
    await ctx.service.notify({
      userId: 9,
      action: "assigned",
      title: "ทดสอบระบบ",
      actor: { actorId: 9 },
    });
    expect(ctx.notifications.save).not.toHaveBeenCalled();
    expect(ctx.stream.emit).not.toHaveBeenCalled();
  });
});
