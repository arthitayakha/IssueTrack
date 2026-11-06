import {
  AppExpiryService,
  EXPIRY_CRITICAL_DAYS,
  EXPIRY_WARNING_DAYS,
} from "../modules/apps/app-expiry.service";
import type { AppCompany } from "../modules/apps/entities/app-company.entity";
import { isIsoDate, toIsoDate, todayIso } from "../common/dates";

/**
 * The expiry rules — 30 วัน / 7 วัน / หมดอายุ — **นับหนึ่งต่อ 1 แถว**
 * (1 คู่มีได้หลายช่วงเวลาหลัง migration 1812) ไม่ใช่ต่อแอป, and *one* writer
 * for `app_companies.expiry_status` + `app_companies.expiry_notified`. Every path
 * (list read, save, daily cron) goes through `reconcile()`, so these tests pin
 * the things that can go wrong: a wrong chip, a bell that rings twice, a
 * threshold that never rings at all, or two rows ringing each other's dates.
 *
 * Stubbed repositories only — safe to run while `npm run dev` is up.
 */

interface Stub {
  find: jest.Mock;
  update: jest.Mock;
}

function makeService() {
  const links: Stub = {
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const apps = { find: jest.fn().mockResolvedValue([]) };
  const companies = { find: jest.fn().mockResolvedValue([]) };
  const notifications = {
    notifyAdmins: jest.fn().mockResolvedValue(undefined),
  };
  const args = [links, apps, companies, notifications] as unknown as ConstructorParameters<
    typeof AppExpiryService
  >;
  return { service: new AppExpiryService(...args), links, apps, companies, notifications };
}

/** `YYYY-MM-DD`, `n` days from today (Bangkok) — the same clock the service uses. */
function inDays(n: number): string {
  const base = Date.parse(`${todayIso()}T00:00:00Z`) + n * 86_400_000;
  return new Date(base).toISOString().slice(0, 10);
}

/** 1 แถวของ `app_companies` — ค่า default = ยังไม่กรอกอะไรเลย */
function pair(overrides: Partial<AppCompany> = {}): AppCompany {
  return {
    id: 700,
    appId: 42,
    companyId: 3,
    startedAt: null,
    expiresAt: null,
    maHours: null,
    expiryStatus: "none",
    expiryNotified: "none",
    ...overrides,
  };
}

/**
 * surrogate PK (migration 1812) ที่ service ใช้ระบุแถว — ทุก assertion ของ
 * `update` ต้องชี้ตรงนี้ (การใช้ `(app_id, company_id)` จะโดนแถวช่วงอื่น
 * ของคู่เดียวกันด้วย เพราะคู่เดิมมีได้หลายแถว)
 */
const POS_AT_ACME = { id: 700 };

const NAMES = { appName: "POS", companyName: "ACME" };

describe("AppExpiryService.statusFor — the 30/7-day window", () => {
  it("no date → none", () => {
    const { service } = makeService();
    expect(service.statusFor(null)).toBe("none");
    expect(service.statusFor(undefined)).toBe("none");
    expect(service.statusFor("")).toBe("none");
  });

  it("past due → expired", () => {
    const { service } = makeService();
    expect(service.statusFor(inDays(-1))).toBe("expired");
    expect(service.statusFor(inDays(-365))).toBe("expired");
  });

  it("today through day 7 → critical (the 7-day boundary is inclusive)", () => {
    const { service } = makeService();
    expect(EXPIRY_CRITICAL_DAYS).toBe(7);
    expect(service.statusFor(inDays(0))).toBe("critical");
    expect(service.statusFor(inDays(EXPIRY_CRITICAL_DAYS))).toBe("critical");
    expect(service.statusFor(inDays(5))).toBe("critical");
  });

  it("day 8 through day 30 → expiring_soon", () => {
    const { service } = makeService();
    expect(EXPIRY_WARNING_DAYS).toBe(30);
    expect(service.statusFor(inDays(EXPIRY_CRITICAL_DAYS + 1))).toBe("expiring_soon");
    expect(service.statusFor(inDays(20))).toBe("expiring_soon");
    expect(service.statusFor(inDays(EXPIRY_WARNING_DAYS))).toBe("expiring_soon");
  });

  it("day 31 onward → normal", () => {
    const { service } = makeService();
    expect(service.statusFor(inDays(EXPIRY_WARNING_DAYS + 1))).toBe("normal");
    expect(service.statusFor(inDays(400))).toBe("normal");
  });
});

describe("AppExpiryService.reconcile — one bell per threshold, per pair", () => {
  it("an unchanged pair writes nothing and says nothing", async () => {
    const { service, links, notifications } = makeService();

    const changed = await service.reconcile(pair(), NAMES);

    expect(changed).toBe(false);
    expect(links.update).not.toHaveBeenCalled();
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });

  it("crossing 30 days stores the status, marks d30 and says how many days are left", async () => {
    const { service, links, notifications } = makeService();

    const changed = await service.reconcile(
      pair({ expiresAt: inDays(10) }),
      NAMES,
    );

    expect(changed).toBe(true);
    expect(links.update).toHaveBeenCalledWith(POS_AT_ACME, {
      expiryStatus: "expiring_soon",
      expiryNotified: "d30",
    });
    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifications.notifyAdmins).toHaveBeenCalledWith({
      action: "app_expiring",
      title: "POS",
      context: "เหลือ 10 วัน · ACME",
      link: "/systems",
    });
  });

  it("stays quiet while the date holds still (the daily sweep must not re-ring)", async () => {
    const { service, links, notifications } = makeService();

    await service.reconcile(
      pair({
        expiresAt: inDays(10),
        expiryStatus: "expiring_soon",
        expiryNotified: "d30",
      }),
      NAMES,
    );

    expect(links.update).not.toHaveBeenCalled();
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });

  it("crossing 7 days rings once more, with the new day count and the critical chip", async () => {
    const { service, links, notifications } = makeService();

    await service.reconcile(
      pair({
        expiresAt: inDays(5),
        expiryStatus: "expiring_soon",
        expiryNotified: "d30",
      }),
      NAMES,
    );

    expect(links.update).toHaveBeenCalledWith(POS_AT_ACME, {
      expiryStatus: "critical",
      expiryNotified: "d7",
    });
    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ action: "app_expiring", context: "เหลือ 5 วัน · ACME" }),
    );
  });

  it("passing the due date rings app_expired with the company as the context", async () => {
    const { service, notifications } = makeService();

    await service.reconcile(
      pair({
        expiresAt: inDays(-3),
        expiryStatus: "critical",
        expiryNotified: "d7",
      }),
      NAMES,
    );

    expect(notifications.notifyAdmins).toHaveBeenCalledWith({
      action: "app_expired",
      title: "POS",
      context: "ACME",
      link: "/systems",
    });
  });

  it("jumping several thresholds (server slept for 10 days) rings only the nearest one", async () => {
    const { service, links, notifications } = makeService();

    // announced the 30-day one, then the box went down and woke up 5 days out
    await service.reconcile(
      pair({
        expiresAt: inDays(5),
        expiryStatus: "expiring_soon",
        expiryNotified: "d30",
      }),
      NAMES,
    );

    expect(links.update).toHaveBeenCalledWith(POS_AT_ACME, {
      expiryStatus: "critical",
      expiryNotified: "d7",
    });
    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ context: "เหลือ 5 วัน · ACME" }),
    );
  });

  it("pushing the date out resets the announcement and says nothing", async () => {
    const { service, links, notifications } = makeService();

    await service.reconcile(
      pair({
        expiresAt: inDays(60),
        expiryStatus: "expiring_soon",
        expiryNotified: "d30",
      }),
      NAMES,
    );

    expect(links.update).toHaveBeenCalledWith(POS_AT_ACME, {
      expiryStatus: "normal",
      expiryNotified: "none",
    });
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });

  it("clearing the date is silent and resets both columns", async () => {
    const { service, links, notifications } = makeService();

    await service.reconcile(
      pair({ expiresAt: null, expiryStatus: "expired", expiryNotified: "expired" }),
      NAMES,
    );

    expect(links.update).toHaveBeenCalledWith(POS_AT_ACME, {
      expiryStatus: "none",
      expiryNotified: "none",
    });
    expect(notifications.notifyAdmins).not.toHaveBeenCalled();
  });

  it("renewing an expired pair announces the new deadline again", async () => {
    const { service, notifications } = makeService();

    await service.reconcile(
      pair({
        expiresAt: inDays(5),
        expiryStatus: "expired",
        expiryNotified: "expired",
      }),
      NAMES,
    );

    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ action: "app_expiring", context: "เหลือ 5 วัน · ACME" }),
    );
  });

  it("two companies of the same app are independent — one rings, the other stays put", async () => {
    const { service, links, notifications } = makeService();

    // มามี่ฟู้ด ใกล้หมด (ต้องแจ้ง) · ครัวบ้านสวน ยังอีก 200 วัน (นิ่ง)
    const dueSoon = pair({ id: 11, companyId: 3, expiresAt: inDays(5) });
    const farOut = pair({
      id: 12,
      companyId: 9,
      expiresAt: inDays(200),
      expiryStatus: "normal",
      expiryNotified: "none",
    });

    expect(await service.reconcile(dueSoon, NAMES)).toBe(true);
    expect(await service.reconcile(farOut, NAMES)).toBe(false);

    // เขียนแค่แถวที่เปลี่ยน — แตะแถวอื่น = reset รอบแจ้งเตือนของเขา
    expect(links.update).toHaveBeenCalledTimes(1);
    expect(links.update).toHaveBeenCalledWith(
      { id: 11 },
      { expiryStatus: "critical", expiryNotified: "d7" },
    );
    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
  });

  it("the company name in the context is the one of the pair that rang", async () => {
    const { service, notifications } = makeService();

    await service.reconcile(
      pair({ companyId: 9, expiresAt: inDays(12) }),
      { appName: "POS", companyName: "มามี่ฟู้ด จำกัด" },
    );

    expect(notifications.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "POS",
        context: "เหลือ 12 วัน · มามี่ฟู้ด จำกัด",
      }),
    );
  });
});

describe("AppExpiryService.reconcileAll — the 09:00 sweep", () => {
  it("runs every pair through the same path, with names joined from the other tables", async () => {
    const { service, links, apps, companies, notifications } = makeService();
    links.find.mockResolvedValue([
      // crosses both thresholds at once (7 days out) → the only real change
      pair({ id: 501, appId: 1, companyId: 3, expiresAt: inDays(5) }),
      // no date, already `none` → nothing to do
      pair({ id: 502, appId: 2, companyId: 9, expiresAt: null }),
      // far out, already showing `normal` → nothing to do
      pair({ id: 503, appId: 3, companyId: 3, expiresAt: inDays(400), expiryStatus: "normal" }),
    ]);
    apps.find.mockResolvedValue([
      { id: 1, name: "POS" },
      { id: 2, name: "ERP" },
      { id: 3, name: "CRM" },
    ]);
    companies.find.mockResolvedValue([
      { id: 3, name: "ACME" },
      { id: 9, name: "มามี่ฟู้ด จำกัด" },
    ]);

    await service.reconcileAll();

    expect(links.update).toHaveBeenCalledTimes(1);
    expect(links.update).toHaveBeenCalledWith(
      { id: 501 },
      { expiryStatus: "critical", expiryNotified: "d7" },
    );
    expect(notifications.notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifications.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ title: "POS", context: "เหลือ 5 วัน · ACME" }),
    );
  });

  it("a sweep failure is logged, never thrown", async () => {
    const { service, links } = makeService();
    links.find.mockRejectedValue(new Error("db down"));

    await expect(service.reconcileAll()).resolves.toBeUndefined();
  });
});

describe("date helpers — DATE columns come back as a Date at local midnight", () => {
  it("formats a local-midnight Date back to the stored date (never toISOString)", () => {
    // 4 Dec 2026 local — in UTC+7 that is 3 Dec 17:00Z
    const stored = new Date(2026, 11, 4);
    expect(toIsoDate(stored)).toBe("2026-12-04");
    expect(stored.toISOString()).toBe("2026-12-03T17:00:00.000Z"); // the trap
  });

  it("passes ISO strings through", () => {
    expect(toIsoDate("2026-12-04")).toBe("2026-12-04");
  });

  it("accepts real dates and rejects what a text field can hold", () => {
    expect(isIsoDate("2026-12-04")).toBe(true);
    expect(isIsoDate("31/12/2026")).toBe(false);
    expect(isIsoDate("2026-13-45")).toBe(false);
    expect(isIsoDate(20261204)).toBe(false);
  });
});
