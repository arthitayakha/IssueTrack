import { DashboardService, type DashboardSummary } from "../modules/dashboard/dashboard.service";
import { AuthUser } from "../modules/auth/auth-user";

/**
 * DashboardService.summary() scope rules — the security boundary of the
 * dashboard:
 *
 *   - `scope=all` requires `dashboard.overview.view`; without it the service
 *     silently falls back to "own" (assigned-to-me OR reported-by-me) so the
 *     page still renders — never a 403.
 *   - personal scopes ("assigned" / "reported") always filter by uid, no
 *     permission lookup needed — they can only ever return the caller's rows.
 *   - the workload list is overview-only; everyone else gets [].
 *   - statuses come back zero-filled so the status cards always render.
 *
 * Stubbed repositories only — safe to run while `npm run dev` is up.
 */

const USER: AuthUser = {
  id: "7",
  email: "someone@example.com",
  name: "Someone",
  roleId: 2,
  roleName: "customer",
  positionId: null,
};

interface BuilderStub {
  where: jest.Mock;
  andWhere: jest.Mock;
  leftJoin: jest.Mock;
  innerJoin: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  groupBy: jest.Mock;
  addGroupBy: jest.Mock;
  orderBy: jest.Mock;
  getRawMany: jest.Mock;
  getCount: jest.Mock;
  /** Every string passed to where/andWhere/joins — the SQL conditions. */
  conditions: string[];
}

/**
 * Builds the service with stub deps. Query builders are created one per
 * aggregate query (total, statuses, priorities, apps, categories, trend,
 * workload — in that order), so `rawQueue` / `countQueue` are consumed in
 * creation order.
 */
function makeService(rawQueue: unknown[][] = [], countQueue: number[] = []) {
  const builders: BuilderStub[] = [];
  const issues = {
    createQueryBuilder: jest.fn(() => {
      const conditions: string[] = [];
      const record = (args: unknown[]) => {
        if (typeof args[0] === "string") conditions.push(args[0]);
      };
      const b: BuilderStub = {
        where: jest.fn((...a: unknown[]) => { record(a); return b; }),
        andWhere: jest.fn((...a: unknown[]) => { record(a); return b; }),
        leftJoin: jest.fn((...a: unknown[]) => { record(a); return b; }),
        innerJoin: jest.fn((...a: unknown[]) => { record(a); return b; }),
        select: jest.fn((...a: unknown[]) => { record(a); return b; }),
        addSelect: jest.fn((...a: unknown[]) => { record(a); return b; }),
        groupBy: jest.fn((...a: unknown[]) => { record(a); return b; }),
        addGroupBy: jest.fn((...a: unknown[]) => { record(a); return b; }),
        orderBy: jest.fn((...a: unknown[]) => { record(a); return b; }),
        getRawMany: jest.fn().mockResolvedValue(rawQueue.shift() ?? []),
        getCount: jest.fn().mockResolvedValue(countQueue.shift() ?? 0),
      };
      builders.push(b);
      return b;
    }),
  };
  const statuses = { find: jest.fn().mockResolvedValue([]) };
  const permissions = { getUserPermissions: jest.fn().mockResolvedValue([] as string[]) };
  const service = new DashboardService(
    issues as never,
    statuses as never,
    permissions as never,
  );
  return { service, statuses, permissions, builders };
}

const OVERVIEW = "dashboard.overview.view";
const OWN = "dashboard.own.view";

const ADMIN_USER: AuthUser = { ...USER, roleId: 1, roleName: "admin" };

/** Raw queue for a scope=all run (workload included → 6 raw queries). */
function allScopeQueue(extra: Partial<DashboardSummary> = {}) {
  return [
    extra.statuses ?? [],        // statuses
    extra.priorities ?? [],      // priorities
    extra.apps ?? [],            // apps
    extra.categories ?? [],      // categories
    extra.trend ?? [],           // trend
    extra.workload ?? [],        // workload
  ];
}

describe("DashboardService.summary", () => {
  it("keeps scope=all when the caller has dashboard.overview.view (no uid filter)", async () => {
    const { service, permissions, builders } = makeService(allScopeQueue(), [64]);
    permissions.getUserPermissions.mockResolvedValue([OWN, OVERVIEW]);

    const result = await service.summary("all", "week", ADMIN_USER);

    expect(result.scope).toBe("all");
    expect(result.total).toBe(64);
    expect(permissions.getUserPermissions).toHaveBeenCalledWith(ADMIN_USER.roleId, ADMIN_USER.positionId);
    for (const b of builders) {
      expect(b.conditions.join(" ")).not.toMatch(/programmer_id = :uid|customer_id = :uid/);
    }
  });

  it("falls back to own (assigned OR reported) when overview is missing — no 403", async () => {
    const { service, permissions, builders } = makeService(
      [statusesRaw(), [], [], [], [], []],
      [33],
    );
    permissions.getUserPermissions.mockResolvedValue([OWN]);

    const result = await service.summary("all", "week", USER);

    expect(result.scope).toBe("own");
    expect(result.total).toBe(33);
    // every aggregate query carries the personal filter
    for (const b of builders) {
      expect(b.conditions.join(" ")).toContain("(issue.programmer_id = :uid OR issue.customer_id = :uid)");
    }
  });

  it("serves scope=assigned with a uid filter and no permission lookup", async () => {
    const { service, permissions, builders } = makeService(
      [statusesRaw(), [], [], [], [], []],
      [0],
    );

    const result = await service.summary("assigned", "day", USER);

    expect(result.scope).toBe("assigned");
    expect(permissions.getUserPermissions).not.toHaveBeenCalled();
    for (const b of builders) {
      expect(b.conditions.join(" ")).toContain("issue.programmer_id = :uid");
    }
  });

  it("serves scope=reported with a uid filter and no permission lookup", async () => {
    const { service, permissions, builders } = makeService(
      [statusesRaw(), [], [], [], [], []],
      [5],
    );

    const result = await service.summary("reported", "year", USER);

    expect(result.scope).toBe("reported");
    expect(result.total).toBe(5);
    expect(permissions.getUserPermissions).not.toHaveBeenCalled();
    for (const b of builders) {
      expect(b.conditions.join(" ")).toContain("issue.customer_id = :uid");
    }
  });

  it("returns an empty workload outside scope=all (builders stop at trend)", async () => {
    const { service, builders } = makeService(
      [statusesRaw(), [], [], [], []],
      [0],
    );

    const result = await service.summary("assigned", "week", USER);

    expect(result.workload).toEqual([]);
    // total + statuses + priorities + apps + categories + trend = 6 builders,
    // no 7th (workload short-circuits before building a query)
    expect(builders).toHaveLength(6);
  });

  it("zero-fills statuses so every board column renders even when empty", async () => {
    const { service, statuses } = makeService(
      [[{ id: "1", count: "5" }], [], [], [], [], []],
      [5],
    );
    statuses.find.mockResolvedValue([
      { id: 1, name: "รอรับเรื่อง", position: 0 },
      { id: 4, name: "เสร็จสิ้น", position: 3 },
    ]);

    const result = await service.summary("assigned", "week", USER);

    expect(result.statuses).toEqual([
      { id: 1, name: "รอรับเรื่อง", count: 5 },
      { id: 4, name: "เสร็จสิ้น", count: 0 },
    ]);
  });

  it("coerces raw string counts to numbers and maps the workload rows", async () => {
    const { service } = makeService(
      [
        statusesRaw(),
        [{ id: null, name: null, count: "34" }],                 // priorities: ไม่ระบุ group
        [{ id: "3", name: "POS", count: "10" }],                  // apps
        [],                                                        // categories
        [{ bucket: "2026-10-01", count: "3" }],                   // trend
        [{ userId: "13", name: "prog@example.com", openCount: "16", seconds: "175680" }], // workload
      ],
      [64],
    );

    const result = await service.summary("all", "day", ADMIN_USER);

    expect(result.priorities).toEqual([{ id: null, name: null, count: 34 }]);
    expect(result.apps).toEqual([{ id: 3, name: "POS", count: 10 }]);
    expect(result.trend).toEqual([{ bucket: "2026-10-01", count: 3 }]);
    expect(result.workload).toEqual([
      { userId: 13, name: "prog@example.com", openCount: 16, hours: 48.8 },
    ]);
  });

  it("trend buckets are truncated per period in Bangkok time", async () => {
    const { service, builders } = makeService(
      [statusesRaw(), [], [], [], [{ bucket: "2026-10-26", count: "2" }], []],
      [0],
    );

    await service.summary("assigned", "week", USER);

    const trendSql = builders[5].conditions.concat(
      builders[5].select.mock.calls.flat().map(String),
    ).join(" ");
    expect(trendSql).toContain("date_trunc('week'");
    expect(trendSql).toContain("Asia/Bangkok");
  });
});

/** Statuses raw row for a run whose only non-empty dimension is statuses. */
function statusesRaw() {
  return [{ id: "1", count: "2" }];
}
