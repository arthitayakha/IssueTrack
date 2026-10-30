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
 *
 * Stubbed repositories only — safe to run while `npm run dev` is up.
 */

interface Stub {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  count: jest.Mock;
}

function repo(overrides: Partial<Stub> = {}): Stub {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (value: Record<string, unknown>) => value),
    create: jest.fn((value: unknown) => value),
    count: jest.fn().mockResolvedValue(0),
    ...overrides,
  };
}

type ServiceArgs = ConstructorParameters<typeof NotificationsService>;

function makeService() {
  const notifications = repo();
  // two active admins by default — the fan-out target
  const users = repo({ find: jest.fn().mockResolvedValue([{ id: 80 }, { id: 81 }]) });
  const service = new NotificationsService(
    ...([notifications, users] as unknown as ServiceArgs),
  );
  return { service, notifications, users };
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
