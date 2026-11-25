import {
  REPEATABLE_ACTIONS,
  REPEAT_CADENCE,
  bangkok9,
  NotificationRepeatsService,
} from "../modules/notifications/notification-repeats.service";
import type { NotificationRepeat } from "../modules/notifications/entities/notification-repeat.entity";
import type { Notification } from "../modules/notifications/entities/notification.entity";
import type { AppCompany } from "../modules/apps/entities/app-company.entity";
import type { Issue } from "../modules/issues/entities/issue.entity";
import { todayIso } from "../common/dates";

/**
 * การเตือนซ้ำตามระดับความสำคัญ — วันที่ 0 คือแถวต้นทางที่ notify() สร้างอยู่แล้ว
 * สายถูกปิดเมื่อ "ทำสิ่งนั้นแล้ว" (อ่านแถวไม่ถือว่าทำ) หรือครบจำนวนครั้งตามระดับ
 * ไม่แตะ DB จริง — เหมือน spec ของ expiry/stale ที่รันคู่กับ npm run dev ได้
 */

function makeService() {
  const repeats = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 1, ...value } as NotificationRepeat)),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const links = { find: jest.fn().mockResolvedValue([]) };
  const issues = { findOne: jest.fn().mockResolvedValue(null) };
  const notifications = {
    setRepeatRegistrar: jest.fn(),
    notify: jest.fn().mockResolvedValue(undefined),
  };
  const args = [repeats, links, issues, notifications] as unknown as ConstructorParameters<
    typeof NotificationRepeatsService
  >;
  return {
    service: new NotificationRepeatsService(...args),
    repeats,
    links,
    issues,
    notifications,
  };
}

function chain(overrides: Partial<NotificationRepeat> = {}): NotificationRepeat {
  return {
    id: 42,
    userId: 2,
    sourceNotificationId: 900,
    type: "ma_depleted",
    title: "POS ครัวบ้านสวน",
    context: "หมดแล้ว",
    link: "/systems?app=11&company=5",
    issueId: null,
    appId: 11,
    companyId: 5,
    actorId: null,
    priority: "high",
    sentCount: 0,
    nextNotifyAt: new Date("2026-11-24T02:00:00.000Z"), // 09:00 วันที่ 24 ที่กรุงเทพ
    resolvedAt: null,
    createdAt: new Date("2026-11-23T02:00:00.000Z"),
    ...overrides,
  };
}

function savedRow(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 900,
    userId: 2,
    appId: 11,
    companyId: 5,
    issueId: null,
    actorId: null,
    context: "หมดแล้ว",
    link: "/systems?app=11&company=5",
    title: "POS ครัวบ้านสวน",
    type: "ma_depleted",
    priority: "high",
    isRead: false,
    readAt: null,
    createdAt: new Date(),
    ...overrides,
  } as Notification;
}

function linkRow(overrides: Partial<AppCompany> = {}): AppCompany {
  return {
    id: 700,
    appId: 11,
    companyId: 5,
    maNotifiedAt: new Date("2026-11-23T02:00:00.000Z"),
    cancelledAt: null,
    expiresAt: null,
    ...overrides,
  } as unknown as AppCompany;
}

function issueRow(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 361,
    programmerId: null,
    staleNotifiedAt: new Date("2026-11-23T02:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  } as unknown as Issue;
}

function inDays(days: number): string {
  const base = Date.parse(`${todayIso()}T00:00:00Z`) + days * 86_400_000;
  return new Date(base).toISOString().slice(0, 10);
}

describe("REPEAT_CADENCE — ความถี่ตามระดับ", () => {
  it("high ไม่จำกัด / medium ซ้ำ 4 ครั้ง / low ซ้ำ 2 ครั้งแบบเว้นวัน", () => {
    expect(REPEATABLE_ACTIONS.has("ma_depleted")).toBe(true);
    expect(REPEATABLE_ACTIONS.has("rule_updated")).toBe(false);
    expect(REPEAT_CADENCE.high).toEqual({ intervalDays: 1, maxRepeats: Infinity });
    expect(REPEAT_CADENCE.medium).toEqual({ intervalDays: 1, maxRepeats: 4 });
    expect(REPEAT_CADENCE.low).toEqual({ intervalDays: 2, maxRepeats: 2 });
  });

  it("bangkok9 คืน 09:00 วันถัดไปตามเขตไทย ไม่ใช่ +24 ชม. ของ host", () => {
    expect(bangkok9(new Date("2026-11-24T12:00:00Z"), 1).toISOString()).toBe(
      "2026-11-25T02:00:00.000Z",
    );
    expect(bangkok9(new Date("2026-11-24T12:00:00Z"), 2).toISOString()).toBe(
      "2026-11-26T02:00:00.000Z",
    );
  });
});

describe("NotificationRepeatsService.register", () => {
  it("เปิดสายของเหตุการณ์ที่ต้องบริหาร ด้วย snapshot + กำหนดพรุ่งนี้ 09:00", async () => {
    const { service, repeats } = makeService();
    await service.register(savedRow());
    expect(repeats.save).toHaveBeenCalledTimes(1);
    const saved = repeats.save.mock.calls[0][0];
    expect(saved).toMatchObject({
      userId: 2,
      sourceNotificationId: 900,
      type: "ma_depleted",
      title: "POS ครัวบ้านสวน",
      appId: 11,
      companyId: 5,
      priority: "high",
      sentCount: 0,
      resolvedAt: null,
    });
    expect(saved.nextNotifyAt.toISOString()).toBe(bangkok9(new Date(), 1).toISOString());
  });

  it("ข้ามประเภทที่ไม่ต้องบริหาร (rule_* / ยืนยันการต่ออายุ)", async () => {
    const { service, repeats } = makeService();
    await service.register(savedRow({ type: "rule_updated", priority: "low" }));
    expect(repeats.save).not.toHaveBeenCalled();
  });

  it("ไม่เปิดสายซ้ำถ้ามีสายเดียวกันยังค้างอยู่", async () => {
    const { service, repeats, links } = makeService();
    repeats.findOne.mockResolvedValue(chain());
    links.find.mockResolvedValue([linkRow()]); // latch ยังตั้งอยู่ = ยังหมดอยู่
    await service.register(savedRow());
    expect(repeats.save).not.toHaveBeenCalled();
  });

  it("ปิดสายเก่าก่อนเปิดสายใหม่ถ้าสถานะของสายเก่าเปลี่ยนแล้ว", async () => {
    const { service, repeats, links } = makeService();
    repeats.findOne.mockResolvedValue(chain());
    // latch ถูกล้าง = MA กลับมาแล้ว → สายเก่าควรปิด
    links.find.mockResolvedValue([linkRow({ maNotifiedAt: null })]);
    await service.register(savedRow());
    expect(repeats.update).toHaveBeenCalledWith(42, { resolvedAt: expect.any(Date) });
    expect(repeats.save).toHaveBeenCalledTimes(1);
  });
});

describe("NotificationRepeatsService.sweep — ยิงตามความถี่", () => {
  it("high ซ้ำทุกวัน ไม่มีเพดาน", async () => {
    const { service, repeats, links, notifications } = makeService();
    const row = chain();
    repeats.find.mockResolvedValue([row]);
    links.find.mockResolvedValue([linkRow()]); // latch ยังตั้งอยู่ = ยังหมดอยู่
    await service.sweep();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 2,
        action: "ma_depleted",
        title: "POS ครัวบ้านสวน",
        appId: 11,
        companyId: 5,
        priority: "high",
      }),
    );
    expect(repeats.update).toHaveBeenCalledWith(42, {
      sentCount: 1,
      nextNotifyAt: bangkok9(row.nextNotifyAt, 1),
    });
  });

  it("medium หยุดหลังซ้ำครั้งที่ 4 (รวมแถวต้นทาง = 5)", async () => {
    const { service, repeats, issues, notifications } = makeService();
    repeats.find.mockResolvedValue([
      chain({ type: "stale", priority: "medium", sentCount: 3, appId: null, companyId: null, issueId: 361 }),
    ]);
    issues.findOne.mockResolvedValue(issueRow()); // ยังค้างในสถานะ (stamp ยังอยู่)
    await service.sweep();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(repeats.update).toHaveBeenCalledWith(42, {
      sentCount: 4,
      resolvedAt: expect.any(Date),
    });
  });

  it("low เว้นวัน — ซ้ำครั้งที่ 1 แล้วเลื่อนไปอีก 2 วัน", async () => {
    const { service, repeats, issues, notifications } = makeService();
    const row = chain({ type: "stale", priority: "low", appId: null, companyId: null, issueId: 361 });
    repeats.find.mockResolvedValue([row]);
    issues.findOne.mockResolvedValue(issueRow()); // ยังค้างในสถานะ (stamp ยังอยู่)
    await service.sweep();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(repeats.update).toHaveBeenCalledWith(42, {
      sentCount: 1,
      nextNotifyAt: bangkok9(row.nextNotifyAt, 2),
    });
  });

  it("ตัดสายเมื่อสถานะเปลี่ยน — ไม่สร้างแถวใหม่", async () => {
    const { service, repeats, links, notifications } = makeService();
    repeats.find.mockResolvedValue([chain()]);
    links.find.mockResolvedValue([linkRow({ maNotifiedAt: null })]);
    await service.sweep();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(repeats.update).toHaveBeenCalledWith(42, { resolvedAt: expect.any(Date) });
  });

  it("cron ไม่ล้มทั้งระบบแม้ query พัง", async () => {
    const { service, repeats } = makeService();
    repeats.find.mockRejectedValue(new Error("db down"));
    await expect(service.sweep()).resolves.toBeUndefined();
  });
});

describe("NotificationRepeatsService — เช็คว่า 'ทำสิ่งนั้นแล้ว'", () => {
  it("app_expiring ยังเป็นอยู่ได้ทั้ง 30 วันและ 7 วัน แต่จบเมื่อหมดอายุ", async () => {
    const { service, repeats, links, notifications } = makeService();
    links.find.mockResolvedValue([linkRow({ expiresAt: inDays(20) })]);
    repeats.find.mockResolvedValue([
      chain({ type: "app_expiring", priority: "medium", appId: 11, companyId: 5 }),
    ]);
    await service.sweep();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(repeats.update).toHaveBeenCalledWith(42, {
      sentCount: 1,
      nextNotifyAt: bangkok9(chain().nextNotifyAt, 1),
    });

    links.find.mockResolvedValue([linkRow({ expiresAt: inDays(-1) })]);
    repeats.find.mockResolvedValue([
      chain({ type: "app_expiring", priority: "medium", appId: 11, companyId: 5 }),
    ]);
    await service.sweep();
    expect(notifications.notify).toHaveBeenCalledTimes(1); // อันเก่ายังอยู่ ไม่ได้ยิงเพิ่ม
    expect(repeats.update).toHaveBeenCalledWith(42, { resolvedAt: expect.any(Date) });
  });

  it("needs_assignment จบเมื่อมีการมอบหมาย", async () => {
    const { service, repeats, issues, notifications } = makeService();
    repeats.find.mockResolvedValue([
      chain({ type: "needs_assignment", priority: "medium", issueId: 361, appId: null, companyId: null }),
    ]);
    issues.findOne.mockResolvedValue(issueRow({ programmerId: 13 }));
    await service.sweep();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(repeats.update).toHaveBeenCalledWith(42, { resolvedAt: expect.any(Date) });
  });

  it("stale จบเมื่อย้ายการ์ดออก (stale_notified_at ถูกล้าง)", async () => {
    const { service, repeats, issues, notifications } = makeService();
    repeats.find.mockResolvedValue([
      chain({ type: "stale", priority: "medium", issueId: 361, appId: null, companyId: null }),
    ]);
    issues.findOne.mockResolvedValue(issueRow({ staleNotifiedAt: null }));
    await service.sweep();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(repeats.update).toHaveBeenCalledWith(42, { resolvedAt: expect.any(Date) });
  });

  it("สัญญาที่ยกเลิก (1848) ตัดสาย MA/หมดอายุทันที ไม่ส่งแถวเพิ่ม", async () => {
    const { service, repeats, links, notifications } = makeService();
    const stamp = new Date("2026-11-24T00:00:00.000Z");
    links.find.mockResolvedValue([linkRow({ cancelledAt: stamp })]);
    repeats.find.mockResolvedValue([chain()]);
    await service.sweep();
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(repeats.update).toHaveBeenCalledWith(42, { resolvedAt: expect.any(Date) });
  });

  it("lookup พัง = ยังไม่ตัดสาย แล้วค่อยลองใหม่รอบถัดไป", async () => {
    const { service, repeats, links, notifications } = makeService();
    repeats.find.mockResolvedValue([chain()]);
    links.find.mockRejectedValue(new Error("lookup failed"));
    await expect(service.sweep()).resolves.toBeUndefined();
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });
});

describe("registrar", () => {
  it("NotificationsService เรียก registrar หลังบันทึกแถว", () => {
    const { service, notifications } = makeService();
    service.onModuleInit();
    expect(notifications.setRepeatRegistrar).toHaveBeenCalledTimes(1);
  });
});
