import { DailyReminderService } from "../modules/notifications/daily-reminder.service";

/**
 * เสียงเตือนรายวัน 09:00 — หน้าต่าง 7/3/1 วัน นับจากอายุแถวเดิม (ไม่มีตาราง state):
 *
 * - สูง → digest ทุกวันจนครบ 7 วัน + **อีเมลครั้งเดียวตอนวันแรก** (แถว < 24 ชม.)
 * - กลาง → 3 วัน (ไม่มีอีเมล) · ต่ำ → เด้งเช้าวันรุ่งขึ้นครั้งเดียว (ไม่มีอีเมล)
 * - แถว digest ไม่นับตัวเอง · มี digest ใน 20 ชม. = รันซ้ำ → ข้าม
 * - คนที่ปิดสวิตซ์ (`daily_reminder_enabled = false`) ถูกกันออกตั้งแต่ query
 * - fail-open ทุกชั้น — sweep ห้ามทำให้ API พัง
 *
 * Stubbed repositories only — safe to run while `npm run dev` is up.
 */

interface Stub {
  find: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
}

function repo(overrides: Partial<Stub> = {}): Stub {
  return {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(async (value: Record<string, unknown>) => value),
    create: jest.fn((value: unknown) => value),
    ...overrides,
  };
}

function mailStub() {
  return {
    sendDailyReminder: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendIssueStatusUpdate: jest.fn().mockResolvedValue(undefined),
  };
}

type ServiceArgs = ConstructorParameters<typeof DailyReminderService>;

const USER = {
  id: 1,
  name: "Arthit",
  email: "arthitayakha@gmail.com",
  isActive: true,
  dailyReminderEnabled: true,
};

function makeService(usersRows: unknown[] = [USER]) {
  const notifications = repo();
  const users = repo({ find: jest.fn().mockResolvedValue(usersRows) });
  const mail = mailStub();
  const service = new DailyReminderService(
    ...([notifications, users, mail] as unknown as ServiceArgs),
  );
  return { service, notifications, users, mail };
}

const HOUR = 3_600_000;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * HOUR);

/** แถวแจ้งเตือนเดิม (ยังไม่อ่าน) — แก้อายุด้วย createdAt */
function unreadRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 10,
    userId: 1,
    issueId: 5,
    actorId: 3,
    type: "moved",
    priority: "high",
    title: "POS error",
    context: "Backend",
    link: "/boards?issue=5",
    createdAt: hoursAgo(2),
    ...overrides,
  };
}

/** every (type, priority, title, context, link) the service wrote */
function written(notifications: Stub) {
  return notifications.save.mock.calls.map(([row]) => row as Record<string, unknown>);
}

describe("DailyReminderService.remind — the 09:00 digest", () => {
  it("nothing unread → no digest row, no e-mail", async () => {
    const { service, notifications, mail } = makeService();

    await service.remind();

    expect(notifications.save).not.toHaveBeenCalled();
    expect(mail.sendDailyReminder).not.toHaveBeenCalled();
  });

  it("only active users with the switch ON are loaded (opt-out happens in the query)", async () => {
    const { service, users } = makeService();

    await service.remind();

    expect(users.find).toHaveBeenCalledWith({
      where: { isActive: true, dailyReminderEnabled: true },
    });
  });

  it("high on day 1 → one digest row + one e-mail (count, titles, inbox link)", async () => {
    const { service, notifications, mail } = makeService();
    notifications.find.mockResolvedValue([unreadRow({ createdAt: hoursAgo(3) })]);

    await service.remind();

    expect(written(notifications)).toEqual([
      {
        userId: 1,
        issueId: null,
        // system sender — no actor row behind it
        actorId: null,
        type: "daily_digest",
        priority: "high",
        title: "1 รายการยังไม่อ่าน",
        context: "สูง 1",
        link: "/notifications",
      },
    ]);
    expect(mail.sendDailyReminder).toHaveBeenCalledTimes(1);
    expect(mail.sendDailyReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "arthitayakha@gmail.com",
        name: "Arthit",
        count: 1,
        titles: ["POS error"],
        url: expect.stringContaining("/notifications"),
      }),
    );
  });

  it("high past day 1 → row only, the e-mail stays silent (once per episode)", async () => {
    const { service, notifications, mail } = makeService();
    notifications.find.mockResolvedValue([unreadRow({ createdAt: hoursAgo(30) })]);

    await service.remind();

    expect(written(notifications)).toHaveLength(1);
    expect(mail.sendDailyReminder).not.toHaveBeenCalled();
  });

  it("high past 7 days → completely silent (the window closes by itself)", async () => {
    const { service, notifications, mail } = makeService();
    notifications.find.mockResolvedValue([unreadRow({ createdAt: hoursAgo(8 * 24) })]);

    await service.remind();

    expect(notifications.save).not.toHaveBeenCalled();
    expect(mail.sendDailyReminder).not.toHaveBeenCalled();
  });

  it("medium keeps reminding for 3 days, never mails", async () => {
    const { service, notifications, mail } = makeService();
    notifications.find.mockResolvedValue([
      unreadRow({ priority: "medium", createdAt: hoursAgo(2 * 24) }),
    ]);

    await service.remind();

    const rows = written(notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0].priority).toBe("medium");
    expect(rows[0].context).toBe("กลาง 1");
    expect(mail.sendDailyReminder).not.toHaveBeenCalled();
  });

  it("medium past 3 days → silent", async () => {
    const { service, notifications } = makeService();
    notifications.find.mockResolvedValue([
      unreadRow({ priority: "medium", createdAt: hoursAgo(4 * 24) }),
    ]);

    await service.remind();

    expect(notifications.save).not.toHaveBeenCalled();
  });

  it("low rings the next morning once (within 24h), never mails", async () => {
    const { service, notifications, mail } = makeService();
    notifications.find.mockResolvedValue([unreadRow({ priority: "low", createdAt: hoursAgo(20) })]);

    await service.remind();

    const rows = written(notifications);
    expect(rows).toHaveLength(1);
    expect(rows[0].priority).toBe("low");
    expect(rows[0].context).toBe("ต่ำ 1");
    expect(mail.sendDailyReminder).not.toHaveBeenCalled();
  });

  it("low past 24h → silent", async () => {
    const { service, notifications } = makeService();
    notifications.find.mockResolvedValue([unreadRow({ priority: "low", createdAt: hoursAgo(30) })]);

    await service.remind();

    expect(notifications.save).not.toHaveBeenCalled();
  });

  it("digest rows never count toward their own window (no compounding)", async () => {
    const { service, notifications, mail } = makeService();
    notifications.find.mockResolvedValue([
      unreadRow({ type: "daily_digest", priority: "high", createdAt: hoursAgo(1) }),
    ]);

    await service.remind();

    expect(notifications.save).not.toHaveBeenCalled();
    expect(mail.sendDailyReminder).not.toHaveBeenCalled();
  });

  it("a digest posted within 20h blocks a second one (restart / double run)", async () => {
    const { service, notifications } = makeService();
    notifications.find.mockResolvedValue([
      unreadRow({ createdAt: hoursAgo(30) }), // still inside the 7-day window
      unreadRow({ id: 99, type: "daily_digest", createdAt: hoursAgo(10) }),
    ]);

    await service.remind();

    expect(notifications.save).not.toHaveBeenCalled();
  });

  it("mixed levels → ONE row, highest priority wins, context splits the counts", async () => {
    const { service, notifications } = makeService();
    notifications.find.mockResolvedValue([
      unreadRow({ priority: "high", createdAt: hoursAgo(5) }),
      unreadRow({ id: 2, priority: "medium", createdAt: hoursAgo(30) }),
      unreadRow({ id: 3, priority: "low", createdAt: hoursAgo(10) }),
    ]);

    await service.remind();

    const rows = written(notifications);
    expect(rows).toHaveLength(1); // one row per user per run, never one per level
    expect(rows[0].priority).toBe("high");
    expect(rows[0].title).toBe("3 รายการยังไม่อ่าน");
    expect(rows[0].context).toBe("สูง 1 · กลาง 1 · ต่ำ 1");
  });

  it("a user without an e-mail still gets the row, just not the mail", async () => {
    const { service, notifications, mail } = makeService([
      { ...USER, id: 2, email: "" },
    ]);
    notifications.find.mockResolvedValue([unreadRow({ createdAt: hoursAgo(3) })]);

    await service.remind();

    expect(written(notifications)).toHaveLength(1);
    expect(mail.sendDailyReminder).not.toHaveBeenCalled();
  });

  it("an unread query that fails never breaks the sweep (fail-open)", async () => {
    const { service, notifications } = makeService();
    notifications.find.mockRejectedValue(new Error("connection lost"));

    await expect(service.remind()).resolves.toBeUndefined();

    expect(notifications.save).not.toHaveBeenCalled();
  });

  it("a rejected e-mail never bubbles up — the row is already written", async () => {
    const { service, notifications, mail } = makeService();
    notifications.find.mockResolvedValue([unreadRow({ createdAt: hoursAgo(3) })]);
    mail.sendDailyReminder.mockRejectedValue(new Error("smtp down"));

    await expect(service.remind()).resolves.toBeUndefined();

    expect(written(notifications)).toHaveLength(1);
  });

  it("the user list failing is caught too — the cron never throws", async () => {
    const { service, users } = makeService();
    users.find.mockRejectedValue(new Error("connection lost"));

    await expect(service.remind()).resolves.toBeUndefined();
  });
});
