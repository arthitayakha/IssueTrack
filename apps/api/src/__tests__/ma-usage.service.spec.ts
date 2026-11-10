import { MaUsageService } from "../modules/apps/ma-usage.service";

/**
 * MaUsageService with in-memory stubs — no database, no Nest testing module,
 * safe to run next to a live `npm run dev`.
 *
 * Guards the contract `/systems` + the bell depend on:
 *
 * - **ครั้งเดียวต่อรอบ** — depleted + no latch → rings and stamps
 *   `ma_notified_at`; depleted + latch set → silent; hours come back → latch
 *   clears so the NEXT exhaustion can ring again
 * - **Fail-open ทุกขั้น** — no app / no reporter / reporter without a company /
 *   no pair row / `maHours` not set → nothing is read, written or sent
 * - **สูตรเดียวกับ `/reports/usage`** — the query filters `task_type IN
 *   ('feature','requirement')` (bug/NULL never deduct) and pairs the hours
 *   through the reporter's company
 * - never throws: the hook runs fire-and-forget after `save()`
 */

interface LinkRow {
  id: number;
  appId: number;
  companyId: number;
  maHours: number | null;
  maNotifiedAt: Date | null;
}

function link(overrides: Partial<LinkRow> = {}): LinkRow {
  return {
    id: 500,
    appId: 7,
    companyId: 3,
    maHours: 40,
    maNotifiedAt: null,
    ...overrides,
  };
}

function makeService(options?: {
  /** ผู้แจ้งงาน — `null` = ไม่มีผู้แจ้ง / ไม่พบแถว */
  reporter?: { id: number; companyId: number | null } | null;
  /** แถวล่าสุดของคู่ — `null` = คู่นั้นไม่มี row ใน `app_companies` */
  link?: LinkRow | null;
  /** ผลรวมวินาทีที่ query คืน */
  usedSeconds?: number;
  app?: { id: number; name: string } | null;
  company?: { id: number; name: string } | null;
}) {
  const state = {
    link: options?.link === undefined ? link() : options.link,
    /** andWhere args ที่ fake QB ได้รับ — ใช้assertสูตรการหัก */
    filters: [] as unknown[][],
    updates: [] as Array<{ where: Record<string, unknown>; patch: Record<string, unknown> }>,
  };

  const links = {
    find: jest.fn().mockImplementation((opts?: { take?: number }) => {
      if (!state.link) return Promise.resolve([]);
      // service สั่ง `order id DESC` + `take: 1` — stub คืนแถวนั้นกลับไป1แถว
      void opts;
      return Promise.resolve([{ ...state.link }]);
    }),
    update: jest.fn().mockImplementation((where: Record<string, unknown>, patch: Record<string, unknown>) => {
      state.updates.push({ where, patch });
      if (state.link && where.id === state.link.id) {
        Object.assign(state.link, patch);
      }
      return Promise.resolve(undefined);
    }),
  };

  const users = {
    findOne: jest.fn().mockImplementation((opts: { where: { id: number } }) => {
      const reporter = options?.reporter;
      if (!reporter || reporter.id !== opts.where.id) return Promise.resolve(null);
      return Promise.resolve({ id: reporter.id, companyId: reporter.companyId });
    }),
  };

  /** fake QB — เก็บทุก andWhere ไว้ assert แล้วคืนค่า seconds ที่ตั้งไว้ */
  type FakeQb = {
    leftJoin: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    select: jest.Mock;
    getRawOne: jest.Mock;
  };
  const qb: FakeQb = {
    leftJoin: jest.fn((): FakeQb => qb),
    where: jest.fn((): FakeQb => qb),
    andWhere: jest.fn((...args: unknown[]): FakeQb => {
      state.filters.push(args);
      return qb;
    }),
    select: jest.fn((): FakeQb => qb),
    getRawOne: jest.fn(
      (): Promise<{ seconds: string }> =>
        Promise.resolve({ seconds: String(options?.usedSeconds ?? 0) }),
    ),
  };
  const issues = { createQueryBuilder: jest.fn(() => qb) };

  const apps = {
    findOne: jest.fn().mockResolvedValue(options?.app ?? { id: 7, name: "POS" }),
  };
  const companies = {
    findOne: jest.fn().mockResolvedValue(options?.company ?? { id: 3, name: "ครัวบ้านสวน" }),
  };
  const notifications = {
    notifyMaDepleted: jest.fn().mockResolvedValue(undefined),
  };

  const service = new MaUsageService(
    links as unknown as never,
    apps as unknown as never,
    companies as unknown as never,
    issues as unknown as never,
    users as unknown as never,
    notifications as unknown as never,
  );

  return { service, state, links, notifications, users, qb };
}

/** การ์ดที่กรอกเวลา — ผู้แจ้ง id 2 (คู่ แอป 7 × บริษัท 3) */
const ISSUE = { id: 42, appId: 7, customerId: 2 } as never;
const REPORTER = { id: 2, companyId: 3 };

const HOUR = 3600;

describe("MaUsageService.checkAndNotify — one ring per exhaustion episode", () => {
  it("rings the company + admins and stamps the latch when used reaches MA", async () => {
    const { service, state, notifications } = makeService({
      reporter: REPORTER,
      usedSeconds: 40 * HOUR, // เท่ากับ maHours พอดี → หมด
    });

    await service.checkAndNotify(ISSUE);

    expect(notifications.notifyMaDepleted).toHaveBeenCalledTimes(1);
    expect(notifications.notifyMaDepleted).toHaveBeenCalledWith({
      companyId: 3,
      appName: "POS",
      companyName: "ครัวบ้านสวน",
      maHours: 40,
      usedHours: 40,
    });
    expect(state.link?.maNotifiedAt).toBeInstanceOf(Date);
  });

  it("stays silent while the latch is already set (แจ้งซ้ำ = spam)", async () => {
    const { service, state, notifications } = makeService({
      reporter: REPORTER,
      link: link({ maNotifiedAt: new Date("2026-11-01T00:00:00Z") }),
      usedSeconds: 45 * HOUR,
    });

    await service.checkAndNotify(ISSUE);

    expect(notifications.notifyMaDepleted).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("clears the latch when hours come back (งานย้ายเป็นบั๊ก / MA ถูกแก้ให้มากขึ้น)", async () => {
    const { service, state, notifications } = makeService({
      reporter: REPORTER,
      link: link({ maNotifiedAt: new Date("2026-11-01T00:00:00Z") }),
      usedSeconds: 30 * HOUR, // ยังเหลือ 10 ชม.
    });

    await service.checkAndNotify(ISSUE);

    expect(notifications.notifyMaDepleted).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].patch).toEqual({ maNotifiedAt: null });
    expect(state.link?.maNotifiedAt).toBeNull();
  });

  it("does nothing while hours remain and no latch is set", async () => {
    const { service, state, notifications } = makeService({
      reporter: REPORTER,
      usedSeconds: 10 * HOUR,
    });

    await service.checkAndNotify(ISSUE);

    expect(notifications.notifyMaDepleted).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("counts partial hours too (used 40.5 ชม. ≥ เพดาน 40 = หมด)", async () => {
    const { service, notifications } = makeService({
      reporter: REPORTER,
      usedSeconds: 40.5 * HOUR,
    });

    await service.checkAndNotify(ISSUE);

    expect(notifications.notifyMaDepleted).toHaveBeenCalledWith(
      expect.objectContaining({ usedHours: 40.5 }),
    );
  });
});

describe("MaUsageService.checkAndNotify — fail-open on every unpairable step", () => {
  it("no app on the card → nothing read, nothing sent", async () => {
    const { service, links, notifications } = makeService({ reporter: REPORTER });

    await service.checkAndNotify({ id: 42, appId: null, customerId: 2 } as never);

    expect(links.find).not.toHaveBeenCalled();
    expect(notifications.notifyMaDepleted).not.toHaveBeenCalled();
  });

  it("no reporter on the card → skip (จับคู่ไม่ได้ = ไม่หักที่ไหน)", async () => {
    const { service, users, notifications } = makeService({ reporter: REPORTER });

    await service.checkAndNotify({ id: 42, appId: 7, customerId: null } as never);

    expect(users.findOne).not.toHaveBeenCalled();
    expect(notifications.notifyMaDepleted).not.toHaveBeenCalled();
  });

  it("reporter without a company → skip (ผู้แจ้งไม่มีบริษัท)", async () => {
    const { service, links, notifications } = makeService({
      reporter: { id: 2, companyId: null },
    });

    await service.checkAndNotify(ISSUE);

    expect(links.find).not.toHaveBeenCalled();
    expect(notifications.notifyMaDepleted).not.toHaveBeenCalled();
  });

  it("pair has no row in app_companies → skip", async () => {
    const { service, notifications } = makeService({
      reporter: REPORTER,
      link: null,
      usedSeconds: 99 * HOUR,
    });

    await service.checkAndNotify(ISSUE);

    expect(notifications.notifyMaDepleted).not.toHaveBeenCalled();
  });

  it("maHours never set (null) → no ceiling, no ring", async () => {
    const { service, state, notifications } = makeService({
      reporter: REPORTER,
      link: link({ maHours: null }),
      usedSeconds: 99 * HOUR,
    });

    await service.checkAndNotify(ISSUE);

    expect(notifications.notifyMaDepleted).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it("skips when the reporter row cannot be read (fail-open ไม่ throw)", async () => {
    const { service, users, notifications } = makeService({
      reporter: null,
      usedSeconds: 99 * HOUR,
    });

    await service.checkAndNotify(ISSUE);

    expect(users.findOne).toHaveBeenCalled();
    expect(notifications.notifyMaDepleted).not.toHaveBeenCalled();
  });
});

describe("MaUsageService.checkAndNotify — the usage query matches /reports/usage", () => {
  it("filters bug/NULL out and pairs through the reporter's company", async () => {
    const { service, qb } = makeService({ reporter: REPORTER, usedSeconds: 40 * HOUR });

    await service.checkAndNotify(ISSUE);

    const clauses = qb.andWhere.mock.calls.map(([sql]) => String(sql));
    // bug กับ NULL (ยังไม่ระบุ) ไม่หัก MA — ตรงสูตรฝั่งรายงาน
    expect(clauses.some((c) => c.includes("task_type IN"))).toBe(true);
    // เวลาของคู่อื่นไม่มาหักแถวนี้
    expect(clauses.some((c) => c.includes("reporter.company_id"))).toBe(true);
    // งานถังขยะไม่นับ
    expect(clauses.some((c) => c.includes("deleted_at IS NULL"))).toBe(true);
  });

  it("never throws when the notification itself fails (hook fire-and-forget)", async () => {
    const { service, notifications } = makeService({
      reporter: REPORTER,
      usedSeconds: 40 * HOUR,
    });
    notifications.notifyMaDepleted.mockRejectedValue(new Error("bell broken"));

    await expect(service.checkAndNotify(ISSUE)).resolves.toBeUndefined();
  });
});
