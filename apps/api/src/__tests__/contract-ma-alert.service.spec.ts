import { ContractMaAlertService } from "../modules/apps/contract-ma-alert.service";
import { todayIso } from "../common/dates";
import type { AppCompany } from "../modules/apps/entities/app-company.entity";

/**
 * กระดิ่ง "สัญญาใกล้หมดแต่ MA ยังเหลือ" — 09:00 ทุกวัน แต่ยิงเฉพาะวันที่
 * เหลือ 7/5/3/1 วัน (วันเว้นวันใน 7 วันสุดท้าย) ให้ลูกค้า + แอดมิน
 *
 * Stubbed repositories only — ไม่มี DB ไม่มี Nest module รันคู่ npm run dev ได้
 */

function inDays(n: number): string {
  const base = Date.parse(`${todayIso()}T00:00:00Z`) + n * 86_400_000;
  return new Date(base).toISOString().slice(0, 10);
}

function pair(overrides: Partial<AppCompany> = {}): AppCompany {
  return {
    id: 700,
    appId: 42,
    companyId: 3,
    startedAt: null,
    expiresAt: null,
    maHours: 20,
    expiryStatus: "critical",
    expiryNotified: "d7",
    kind: "renew",
    maNotifiedAt: null,
    cancelledAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function usage(recordId: number, used: number) {
  return {
    recordId,
    count: 1,
    periodUsedHours: used,
    byType: { bug: 0, ma: 1, requirement: 0, none: 0 },
    listedCount: 1,
    afterExpiryCount: 0,
  };
}

function makeService() {
  const links = { find: jest.fn().mockResolvedValue([]) };
  const apps = { find: jest.fn().mockResolvedValue([{ id: 42, name: "POS" }]) };
  const companies = { find: jest.fn().mockResolvedValue([{ id: 3, name: "ACME" }]) };
  const notices = { count: jest.fn().mockResolvedValue(0) };
  const maUsage = { usageCounts: jest.fn().mockResolvedValue([]) };
  const notifications = { notifyContractMaRemaining: jest.fn().mockResolvedValue(undefined) };
  const service = new ContractMaAlertService(
    links as never,
    apps as never,
    companies as never,
    notices as never,
    maUsage as never,
    notifications as never,
  );
  return { service, links, apps, companies, notices, maUsage, notifications };
}

describe("ContractMaAlertService.sweep — MA คงเหลือก่อนหมดอายุ", () => {
  it("ไม่ทำอะไรเลยเมื่อไม่มีสัญญา (fail open)", async () => {
    const { service, links, notifications } = makeService();

    await service.sweep();

    expect(links.find).toHaveBeenCalledTimes(1);
    expect(links.find.mock.calls[0][0].where.cancelledAt).toEqual(expect.anything()); // IS NULL
    expect(notifications.notifyContractMaRemaining).not.toHaveBeenCalled();
  });

  it("ยิงเฉพาะวันคี่ใน 7 วันสุดท้าย พร้อมวันเหลือ + MA คงเหลือ", async () => {
    const { service, links, maUsage, notifications } = makeService();
    links.find.mockResolvedValue([pair({ expiresAt: inDays(7), maHours: 20 })]);
    maUsage.usageCounts.mockResolvedValue([usage(700, 5)]);

    await service.sweep();

    expect(notifications.notifyContractMaRemaining).toHaveBeenCalledTimes(1);
    expect(notifications.notifyContractMaRemaining).toHaveBeenCalledWith({
      companyId: 3,
      appId: 42,
      appName: "POS",
      companyName: "ACME",
      daysLeft: 7,
      remainingHours: 15,
    });
  });

  it.each([
    ["วันคู่ในช่วง 7 วัน", inDays(6)],
    ["เกิน 7 วัน", inDays(14)],
    ["หมดอายุวันนี้", inDays(0)],
    ["หมดอายุไปแล้ว", inDays(-1)],
  ])("ไม่ยิง: %s", async (_label, expiresAt) => {
    const { service, links, maUsage, notifications } = makeService();
    links.find.mockResolvedValue([pair({ expiresAt })]);
    maUsage.usageCounts.mockResolvedValue([usage(700, 5)]);

    await service.sweep();

    expect(notifications.notifyContractMaRemaining).not.toHaveBeenCalled();
  });

  it("ดูแค่ช่วงล่าสุดของคู่ — ถามใช้ไปของรอบใหม่สุดเท่านั้น", async () => {
    const { service, links, maUsage, notifications } = makeService();
    links.find.mockResolvedValue([
      pair({ id: 700, expiresAt: inDays(7) }),
      pair({ id: 800, expiresAt: inDays(7) }),
    ]);
    maUsage.usageCounts.mockResolvedValue([usage(800, 5)]);

    await service.sweep();

    expect(maUsage.usageCounts).toHaveBeenCalledWith([800]);
    expect(notifications.notifyContractMaRemaining).toHaveBeenCalledTimes(1);
  });

  it("รอบเก่าใกล้หมดแต่รอบใหม่ยังไม่หมด = ไม่ยิง", async () => {
    const { service, links, maUsage, notifications } = makeService();
    links.find.mockResolvedValue([
      pair({ id: 700, expiresAt: inDays(7) }),
      pair({ id: 800, expiresAt: inDays(200) }),
    ]);
    maUsage.usageCounts.mockResolvedValue([usage(800, 5)]);

    await service.sweep();

    expect(maUsage.usageCounts).not.toHaveBeenCalled();
    expect(notifications.notifyContractMaRemaining).not.toHaveBeenCalled();
  });

  it("MA หมดแล้ว (ใช้ไป ≥ ma_hours) → ไม่ยิง", async () => {
    const { service, links, maUsage, notifications } = makeService();
    links.find.mockResolvedValue([pair({ expiresAt: inDays(5), maHours: 10 })]);
    maUsage.usageCounts.mockResolvedValue([usage(700, 10)]);

    await service.sweep();

    expect(notifications.notifyContractMaRemaining).not.toHaveBeenCalled();
  });

  it("ดึงใช้ไปไม่ได้ / lookup พัง → ไม่เดาตัวเลข ไม่ยิง ไม่ throw", async () => {
    const { service, links, maUsage, notifications } = makeService();
    links.find.mockResolvedValue([pair({ expiresAt: inDays(3) })]);
    maUsage.usageCounts.mockRejectedValue(new Error("db down"));

    await expect(service.sweep()).resolves.toBeUndefined();
    expect(notifications.notifyContractMaRemaining).not.toHaveBeenCalled();
  });

  it("ยิงไปแล้ววันนี้ (cron restart) → ไม่ยิงซ้ำ", async () => {
    const { service, links, maUsage, notices, notifications } = makeService();
    links.find.mockResolvedValue([pair({ expiresAt: inDays(1) })]);
    maUsage.usageCounts.mockResolvedValue([usage(700, 2)]);
    notices.count.mockResolvedValue(1);

    await service.sweep();

    const where = notices.count.mock.calls[0][0].where;
    expect(where.type).toBe("contract_ma_remaining");
    expect(where.appId).toBe(42);
    expect(where.companyId).toBe(3);
    expect(notifications.notifyContractMaRemaining).not.toHaveBeenCalled();
  });

  it("swallows a broken round — cron ต้องไม่ทำให้ API ล้ม", async () => {
    const { service, links } = makeService();
    links.find.mockRejectedValue(new Error("connection refused"));

    await expect(service.sweep()).resolves.toBeUndefined();
  });
});
