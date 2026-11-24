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
 *   - statuses come back zero-filled so the status ring always renders.
 *   - the trend window may be a custom `from`/`to` (Bangkok days) — it never
 *     touches the other aggregates.
 *   - `statusId` cross-filters every aggregate EXCEPT the status ring's
 *     context pair (`statuses` + `total`): the ring that sets the filter keeps
 *     its columns and its total (the client highlights the choice instead of
 *     collapsing the ring).
 *   - `companyIds` is a data scope instead: it narrows EVERY aggregate
 *     including `statuses` + `total`, through the reporter-company EXISTS the
 *     board and `/reports` already use (card → `issue.customer_id` →
 *     `users.company_id`), and the drill-downs inherit it so their lists keep
 *     matching the numbers they came from.
 *   - trendIssues() (one bar's drill-down) reuses that exact scope + trunc.
 *   - drilldown() / dimensionIssues() (one donut slice) reuse that scope too,
 *     and only a level-2 slice carries the extra parent-app filter.
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
  companyId: null,
};

interface BuilderStub {
  where: jest.Mock;
  andWhere: jest.Mock;
  leftJoin: jest.Mock;
  leftJoinAndSelect: jest.Mock;
  innerJoin: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  groupBy: jest.Mock;
  addGroupBy: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  limit: jest.Mock;
  getRawMany: jest.Mock;
  getCount: jest.Mock;
  /** `getMany()` — the entity queries (trend-issues drill-down). */
  getMany: jest.Mock;
  /** Every string passed to where/andWhere/joins — the SQL conditions. */
  conditions: string[];
  /** Parameter bags passed alongside those conditions (where/andWhere). */
  params: Record<string, unknown>[];
}

/**
 * Builds the service with stub deps. Query builders are created one per
 * aggregate query (total, statuses, priorities, apps, categories,
 * trend, workload — in that order), so `rawQueue` /
 * `countQueue` are consumed in creation order. `entityQueue` feeds
 * `getMany()` — only the drill-down (trend-issues) query reads entities
 * instead of aggregates.
 */
function makeService(
  rawQueue: unknown[][] = [],
  countQueue: number[] = [],
  entityQueue: unknown[][] = [],
) {
  const builders: BuilderStub[] = [];
  const issues = {
    createQueryBuilder: jest.fn(() => {
      const conditions: string[] = [];
      const params: Record<string, unknown>[] = [];
      const record = (args: unknown[]) => {
        if (typeof args[0] === "string") conditions.push(args[0]);
        if (args[1] && typeof args[1] === "object") params.push(args[1] as Record<string, unknown>);
      };
      const b: BuilderStub = {
        where: jest.fn((...a: unknown[]) => { record(a); return b; }),
        andWhere: jest.fn((...a: unknown[]) => { record(a); return b; }),
        leftJoin: jest.fn((...a: unknown[]) => { record(a); return b; }),
        leftJoinAndSelect: jest.fn((...a: unknown[]) => { record(a); return b; }),
        innerJoin: jest.fn((...a: unknown[]) => { record(a); return b; }),
        select: jest.fn((...a: unknown[]) => { record(a); return b; }),
        addSelect: jest.fn((...a: unknown[]) => { record(a); return b; }),
        groupBy: jest.fn((...a: unknown[]) => { record(a); return b; }),
        addGroupBy: jest.fn((...a: unknown[]) => { record(a); return b; }),
        orderBy: jest.fn((...a: unknown[]) => { record(a); return b; }),
        addOrderBy: jest.fn((...a: unknown[]) => { record(a); return b; }),
        limit: jest.fn((...a: unknown[]) => { record(a); return b; }),
        params,
        // lazy: consume the queue only when the query actually runs — the
        // total builder never calls getRawMany, so eager shift() would skew
        // every later result by one
        getRawMany: jest.fn().mockImplementation(() => Promise.resolve(rawQueue.shift() ?? [])),
        getCount: jest.fn().mockImplementation(() => Promise.resolve(countQueue.shift() ?? 0)),
        getMany: jest.fn().mockImplementation(() => Promise.resolve(entityQueue.shift() ?? [])),
        conditions,
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

/**
 * Raw queue for a scope=all run (workload included → 6 raw queries). The
 * trend is ONE query now: each row carries `total` + `done`, and `pending`
 * is derived as `total - done` (same cohort split by current status).
 */
function allScopeQueue(extra: Partial<DashboardSummary> = {}) {
  return [
    extra.statuses ?? [],     // statuses
    extra.priorities ?? [],   // priorities
    extra.apps ?? [],         // apps
    extra.categories ?? [],   // categories
    extra.trend ?? [],        // trend — one cohort, split by current status
    extra.workload ?? [],     // workload
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
      [statusesRaw(), [], [], [], []],
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
      [statusesRaw(), [], [], [], []],
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
      [statusesRaw(), [], [], [], []],
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
      [[{ id: "1", count: "5" }], [], [], [], []],
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
    const { service, permissions } = makeService(
      [
        statusesRaw(),
        [{ id: null, name: null, count: "34" }],                 // priorities: ไม่ระบุ group
        [{ id: "3", name: "POS", count: "10" }],                  // apps
        [],                                                        // categories
        [{ bucket: "2026-10-01", total: "3", done: "1" }],         // trend — one cohort
        [
          // workload — string counts, a real position and a position-less row
          { userId: "13", name: "prog@example.com", openCount: "16", positionId: "2", positionName: "Backend" },
          { userId: "14", name: "bob@example.com", openCount: "0", positionId: null, positionName: null },
        ],
      ],
      [64],
    );
    permissions.getUserPermissions.mockResolvedValue([OWN, OVERVIEW]);

    const result = await service.summary("all", "day", ADMIN_USER);

    expect(result.priorities).toEqual([{ id: null, name: null, count: 34 }]);
    expect(result.apps).toEqual([{ id: 3, name: "POS", count: 10 }]);
    expect(result.trend).toEqual([{ bucket: "2026-10-01", pending: 2, done: 1, total: 3 }]);
    expect(result.workload).toEqual([
      { userId: 13, name: "prog@example.com", openCount: 16, positionId: 2, positionName: "Backend" },
      { userId: 14, name: "bob@example.com", openCount: 0, positionId: null, positionName: null },
    ]);
  });

  it("keeps the no-app / no-category group as an id:null slice (not Number(null) = 0)", async () => {
    const { service, builders } = makeService(
      [
        statusesRaw(),
        [],                                                        // priorities
        [{ id: null, name: null, count: "62" }, { id: "4", name: "POS", count: "13" }],
        [{ id: null, name: null, count: "5" }, { id: "1", name: "เข้าสู่ระบบไม่ได้", count: "36" }],
        [],                                                        // trend
      ],
      [75],
    );

    const result = await service.summary("assigned", "week", USER);

    expect(result.apps).toEqual([
      { id: null, name: null, count: 62 },
      { id: 4, name: "POS", count: 13 },
    ]);
    expect(result.categories).toEqual([
      { id: null, name: null, count: 5 },
      { id: 1, name: "เข้าสู่ระบบไม่ได้", count: 36 },
    ]);
    // the ring counts every live card — no NOT NULL filter may sneak back in
    for (const b of [builders[3], builders[4]]) {
      expect(b.leftJoin).toHaveBeenCalledWith(expect.stringContaining("issue."), "dim");
      expect(b.conditions.join(" ")).not.toMatch(/_id IS NOT NULL/);
    }
  });

  it("workload counts unfinished cards only, busiest first, with the position", async () => {
    const { service, permissions, builders } = makeService(allScopeQueue(), [0]);
    permissions.getUserPermissions.mockResolvedValue([OWN, OVERVIEW]);

    await service.summary("all", "week", ADMIN_USER);

    // builder order: total, statuses, priorities, apps, categories,
    // trend, workload
    const w = builders[6];
    const sql = w.conditions.join(" ");
    // only open cards are counted — finished work must not inflate anyone's load
    expect(sql).toContain("COUNT(*) FILTER (WHERE COALESCE(issue.status_id, 0) <> 4)");
    // no timer hours on this card any more (no tracked_duration aggregate)
    expect(sql).not.toContain("tracked_duration");
    // busiest open load first, person.id breaks ties so equal loads stay stable
    expect(w.orderBy).toHaveBeenCalledWith(
      "COUNT(*) FILTER (WHERE COALESCE(issue.status_id, 0) <> 4)",
      "DESC",
    );
    expect(w.addOrderBy).toHaveBeenCalledWith("person.id", "ASC");
    // the position rides along so the card's dropdown needs no second request
    expect(w.leftJoin).toHaveBeenCalledWith("person.position", "pos");
    expect(w.addSelect).toHaveBeenCalledWith("pos.id", "positionId");
    expect(w.addSelect).toHaveBeenCalledWith("pos.name", "positionName");
  });

  it("trend buckets are truncated per period in Bangkok time", async () => {
    const { service, builders } = makeService(
      [statusesRaw(), [], [], [], [{ bucket: "2026-10-26", total: "2", done: "0" }]],
      [0],
    );

    await service.summary("assigned", "week", USER);

    const trendSql = builders[5].conditions.concat(
      builders[5].select.mock.calls.flat().map(String),
    ).join(" ");
    expect(trendSql).toContain("date_trunc('week'");
    expect(trendSql).toContain("Asia/Bangkok");
  });

  it("splits one creation cohort by CURRENT status (pending + done = total)", async () => {
    const { service } = makeService(
      [
        statusesRaw(),
        [],                                                  // priorities
        [],                                                  // apps
        [],                                                  // categories
        [
          { bucket: "2026-10-19", total: "4", done: "0" },
          { bucket: "2026-10-26", total: "8", done: "3" },
        ],
      ],
      [0],
    );

    const result = await service.summary("assigned", "week", USER);

    expect(result.trend).toEqual([
      { bucket: "2026-10-19", pending: 4, done: 0, total: 4 },
      { bucket: "2026-10-26", pending: 5, done: 3, total: 8 },
    ]);
  });

  it("reads the split off the card's current status — no activity_logs event join", async () => {
    const { service, builders } = makeService(
      [statusesRaw(), [], [], [], [{ bucket: "2026-10-26", total: "3", done: "2" }]],
      [0],
    );

    const result = await service.summary("assigned", "week", USER);

    expect(result.trend).toEqual([{ bucket: "2026-10-26", pending: 1, done: 2, total: 3 }]);

    // builder order: total, statuses, priorities, apps, categories, trend
    expect(builders).toHaveLength(6);
    const trend = builders[5];
    expect(trend.innerJoin).not.toHaveBeenCalled();
    const select = [...trend.select.mock.calls, ...trend.addSelect.mock.calls]
      .flat()
      .map(String)
      .join(" ");
    expect(select).toContain("SUM(CASE WHEN issue.status_id = 4 THEN 1 ELSE 0 END)");
    expect(select).toContain("COUNT(*)::int");
    // the window still keys off the card's BIRTH date (the cohort)
    expect(trend.conditions.join(" ")).toContain("issue.created_at >= :trendFrom");
  });

  it("applies a custom from/to window to the trend only — Bangkok days", async () => {
    const { service, builders } = makeService(
      [statusesRaw(), [], [], [], [{ bucket: "2026-09-28", total: "4", done: "0" }]],
      [0],
    );

    const result = await service.summary("assigned", "week", USER, {
      from: "2026-09-01",
      to: "2026-09-30",
    });

    // the window is echoed back so the client zero-fills the same span
    expect(result.from).toBe("2026-09-01");
    expect(result.to).toBe("2026-09-30");

    const trendParams: Record<string, Date> = {};
    for (const call of builders[5].andWhere.mock.calls) {
      Object.assign(trendParams, call[1] ?? {});
    }
    // `from` = that day's Bangkok midnight; `to` = the day *after* (exclusive)
    expect(trendParams.trendFrom?.toISOString()).toBe(
      new Date("2026-09-01T00:00:00+07:00").toISOString(),
    );
    expect(trendParams.trendTo?.toISOString()).toBe(
      new Date("2026-10-01T00:00:00+07:00").toISOString(),
    );

    // every other aggregate stays all-time (the range is chart-only for now)
    for (const b of builders.slice(0, 5)) {
      expect(b.conditions.join(" ")).not.toContain("trendFrom");
      expect(b.conditions.join(" ")).not.toContain("trendTo");
    }
  });

  it("falls back to the period window when a bound is malformed", async () => {
    const { service, builders } = makeService(
      [statusesRaw(), [], [], [], []],
      [0],
    );

    await service.summary("assigned", "week", USER, { from: "31/09/2026" });

    const trendParams: Record<string, Date> = {};
    for (const call of builders[5].andWhere.mock.calls) {
      Object.assign(trendParams, call[1] ?? {});
    }
    const age = Date.now() - (trendParams.trendFrom?.getTime() ?? 0);
    // week window = 84 days, counted back from now
    expect(age).toBeGreaterThan(83 * 24 * 60 * 60 * 1000);
    expect(age).toBeLessThan(85 * 24 * 60 * 60 * 1000);
    expect(trendParams.trendTo).toBeUndefined();
  });
});

describe("DashboardService.trendIssues", () => {
  it("reuses the trend scope + Bangkok trunc so the list matches the bar", async () => {
    const { service, builders } = makeService(
      [],
      [],
      [
        [
          {
            id: 142,
            issueNumber: "#142",
            title: "แก้บั๊คล็อกอินไม่ได้บน Safari",
            createdAt: new Date("2026-09-28T07:22:00.000Z"),
            status: { id: 3, name: "กำลังดำเนินการ", color: "orange" },
            priority: { id: 1, name: "สูง" },
            customer: { id: 1, name: "  aom  ", email: "aom@example.com" },
            programmer: null,
          },
        ],
      ],
    );

    const rows = await service.trendIssues("assigned", "week", "2026-09-28", USER);

    expect(builders).toHaveLength(1);
    const sql = builders[0].conditions.join(" ");
    expect(sql).toContain("issue.programmer_id = :uid");
    expect(sql).toContain("date_trunc('week'");
    expect(sql).toContain("Asia/Bangkok");
    expect(sql).toContain("= :bucket");
    expect(builders[0].limit).toHaveBeenCalledWith(200);
    expect(rows).toEqual([
      {
        id: 142,
        issueNumber: "#142",
        title: "แก้บั๊คล็อกอินไม่ได้บน Safari",
        createdAt: "2026-09-28T07:22:00.000Z",
        status: { id: 3, name: "กำลังดำเนินการ", color: "orange" },
        priority: { id: 1, name: "สูง" },
        reporter: { id: 1, name: "aom" },
        assignee: null,
      },
    ]);
  });

  it("matches the done bar — created in the bucket AND in the done column now", async () => {
    const { service, builders } = makeService([], [], [[]]);

    await service.trendIssues("assigned", "week", "2026-10-26", USER, undefined, undefined, "done");

    expect(builders).toHaveLength(1);
    const b = builders[0];
    expect(b.innerJoin).not.toHaveBeenCalled();
    const sql = b.conditions.join(" ");
    expect(sql).toContain("issue.created_at AT TIME ZONE 'Asia/Bangkok'");
    expect(sql).toContain("= :bucket");
    expect(b.andWhere).toHaveBeenCalledWith("issue.status_id = :doneStatusId", {
      doneStatusId: 4,
    });
    expect(b.orderBy).toHaveBeenCalledWith("issue.created_at", "DESC");
    expect(b.limit).toHaveBeenCalledWith(200);
  });

  it("matches the pending bar — every non-done status, including no status", async () => {
    const { service, builders } = makeService([], [], [[]]);

    await service.trendIssues("assigned", "week", "2026-10-26", USER);

    const b = builders[0];
    expect(b.conditions.join(" ")).toContain("issue.created_at AT TIME ZONE 'Asia/Bangkok'");
    expect(b.andWhere).toHaveBeenCalledWith(
      "(issue.status_id <> :doneStatusId OR issue.status_id IS NULL)",
      { doneStatusId: 4 },
    );
    expect(b.innerJoin).not.toHaveBeenCalled();
  });

  it("downgrades scope=all to own for a caller without overview — no 403", async () => {
    const { service, builders, permissions } = makeService([], [], [[]]);
    permissions.getUserPermissions.mockResolvedValue([OWN]);

    await service.trendIssues("all", "day", "2026-09-28", USER);

    expect(builders[0].conditions.join(" ")).toContain(
      "(issue.programmer_id = :uid OR issue.customer_id = :uid)",
    );
  });

  it("rejects a bucket that is not a yyyy-mm-dd date", async () => {
    const { service } = makeService();

    await expect(
      service.trendIssues("all", "week", "28/09/2026", ADMIN_USER),
    ).rejects.toThrow("bucket");
  });
});

describe("DashboardService.drilldown", () => {
  it("counts one dimension inside a parent app, busiest first", async () => {
    const { service, permissions, builders } = makeService([
      [{ id: "3", name: "บั๊ก", count: "5" }, { id: null, name: null, count: "2" }],
    ]);
    permissions.getUserPermissions.mockResolvedValue([OWN, OVERVIEW]);

    const rows = await service.drilldown("all", "category", "12", ADMIN_USER);

    // the NULL group is kept as id: null — Number(null) === 0 must not win
    expect(rows).toEqual([
      { id: 3, name: "บั๊ก", count: 5 },
      { id: null, name: null, count: 2 },
    ]);
    const sql = builders[0].conditions.join(" ");
    // same grouping as the top-level ring (no NOT NULL filter — cards without
    // a category are their own slice) + the parent's filter on top
    expect(sql).not.toContain("issue.category_id IS NOT NULL");
    expect(builders[0].leftJoin).toHaveBeenCalledWith("issue.category", "dim");
    expect(builders[0].andWhere).toHaveBeenCalledWith("issue.app_id = :parentAppId", {
      parentAppId: 12,
    });
    expect(sql).not.toMatch(/programmer_id = :uid|customer_id = :uid/);
  });

  it("downgrades scope=all to own for a caller without overview — no 403", async () => {
    const { service, permissions, builders } = makeService([[]]);
    permissions.getUserPermissions.mockResolvedValue([OWN]);

    await service.drilldown("all", "category", "12", USER);

    expect(builders[0].conditions.join(" ")).toContain(
      "(issue.programmer_id = :uid OR issue.customer_id = :uid)",
    );
  });

  it("rejects an unusable dimension or parent id instead of falling back", async () => {
    const { service, builders } = makeService();

    await expect(service.drilldown("all", "board", "12", ADMIN_USER)).rejects.toThrow("dim");
    await expect(service.drilldown("all", "category", "abc", ADMIN_USER)).rejects.toThrow("app");
    await expect(service.drilldown("all", "category", "0", ADMIN_USER)).rejects.toThrow("app");

    // rejected before any query ran
    expect(builders).toHaveLength(0);
  });
});

describe("DashboardService.dimensionIssues", () => {
  /** One entity row as `getMany()` would return it. */
  function issueRow() {
    return {
      id: 142,
      issueNumber: "#142",
      title: "แก้บั๊คล็อกอินไม่ได้บน Safari",
      createdAt: new Date("2026-09-28T07:22:00.000Z"),
      status: { id: 3, name: "กำลังดำเนินการ", color: "orange" },
      priority: { id: 1, name: "สูง" },
      customer: { id: 1, name: " aom ", email: "aom@example.com" },
      programmer: null,
    };
  }

  it("filters the list to the slice AND the app it was drilled from", async () => {
    const { service, permissions, builders } = makeService([], [], [[issueRow()]]);
    permissions.getUserPermissions.mockResolvedValue([OWN, OVERVIEW]);

    const rows = await service.dimensionIssues("all", "category", "5", "12", ADMIN_USER);

    expect(builders[0].andWhere).toHaveBeenCalledWith("issue.category_id = :dimId", { dimId: 5 });
    expect(builders[0].andWhere).toHaveBeenCalledWith("issue.app_id = :appId", { appId: 12 });
    expect(builders[0].limit).toHaveBeenCalledWith(200);
    expect(builders[0].conditions.join(" ")).not.toMatch(/programmer_id = :uid|customer_id = :uid/);
    // the same row shape as the trend drill-down (one dialog for both)
    expect(rows).toEqual([
      {
        id: 142,
        issueNumber: "#142",
        title: "แก้บั๊คล็อกอินไม่ได้บน Safari",
        createdAt: "2026-09-28T07:22:00.000Z",
        status: { id: 3, name: "กำลังดำเนินการ", color: "orange" },
        priority: { id: 1, name: "สูง" },
        reporter: { id: 1, name: "aom" },
        assignee: null,
      },
    ]);
  });

  it("omits the app filter for a top-level slice (the category tab)", async () => {
    const { service, permissions, builders } = makeService([], [], [[]]);
    permissions.getUserPermissions.mockResolvedValue([OWN]);

    await service.dimensionIssues("all", "category", "5", undefined, USER);

    const sql = builders[0].conditions.join(" ");
    expect(sql).toContain("issue.category_id = :dimId");
    expect(sql).not.toContain("issue.app_id = :appId");
    expect(sql).toContain("(issue.programmer_id = :uid OR issue.customer_id = :uid)");
  });

  it("treats an empty app param as no parent (the query string has none)", async () => {
    const { service, builders } = makeService([], [], [[]]);

    await service.dimensionIssues("assigned", "app", "5", "", USER);

    const sql = builders[0].conditions.join(" ");
    expect(sql).toContain("issue.app_id = :dimId");
    expect(sql).not.toContain("issue.app_id = :appId");
    expect(sql).toContain("issue.programmer_id = :uid");
  });

  it("lists the no-app / no-category slice when id=none", async () => {
    const { service, builders } = makeService([], [], [[]]);

    await service.dimensionIssues("all", "category", "none", "12", ADMIN_USER);

    const sql = builders[0].conditions.join(" ");
    expect(sql).toContain("issue.category_id IS NULL");
    expect(sql).not.toContain("issue.category_id = :dimId");
    expect(builders[0].andWhere).toHaveBeenCalledWith("issue.app_id = :appId", { appId: 12 });
  });

  it("rejects an unusable dimension or id instead of listing the wrong cards", async () => {
    const { service, builders } = makeService();

    await expect(
      service.dimensionIssues("all", "board", "5", undefined, ADMIN_USER),
    ).rejects.toThrow("dim");
    await expect(
      service.dimensionIssues("all", "category", "5.5", undefined, ADMIN_USER),
    ).rejects.toThrow("id");
    await expect(service.dimensionIssues("all", "category", "5", "-1", ADMIN_USER)).rejects.toThrow(
      "app",
    );

    expect(builders).toHaveLength(0);
  });
});

describe("DashboardService status cross-filter", () => {
  it("narrows every aggregate EXCEPT the status ring that set it", async () => {
    const { service, builders } = makeService(
      [statusesRaw(), [], [], [], []],
      [12],
    );

    const result = await service.summary("assigned", "week", USER, {}, 4);

    // echoed back so the client renders what the server really used
    expect(result.statusId).toBe(4);
    expect(result.total).toBe(12);

    // builder order: total, statuses, priorities, apps, categories,
    // trend
    const sqls = builders.map((b) => b.conditions.join(" "));
    for (const i of [2, 3, 4, 5]) {
      expect(sqls[i]).toContain("issue.status_id = :statusId");
    }
    // the ring's context pair (total + statuses) deliberately keeps every
    // column — it would otherwise collapse to the one status it filtered by
    expect(sqls[0]).not.toContain("issue.status_id = :statusId");
    expect(sqls[1]).not.toContain("issue.status_id = :statusId");
  });

  it("echoes statusId: null and filters nothing when no status is picked", async () => {
    const { service, builders } = makeService(
      [statusesRaw(), [], [], [], []],
      [0],
    );

    const result = await service.summary("assigned", "week", USER);

    expect(result.statusId).toBeNull();
    for (const b of builders) {
      expect(b.conditions.join(" ")).not.toContain("issue.status_id = :statusId");
    }
  });

  it("carries the filter into a trend bar's list so it still matches the bar", async () => {
    const { service, builders } = makeService([], [], [[]]);

    await service.trendIssues("assigned", "week", "2026-09-28", USER, 4);

    expect(builders[0].andWhere).toHaveBeenCalledWith("issue.status_id = :statusId", {
      statusId: 4,
    });
  });

  it("lists a status slice (dim=status) behind the ring's list button", async () => {
    const { service, builders } = makeService([], [], [[]]);

    await service.dimensionIssues("assigned", "status", "4", undefined, USER);

    expect(builders[0].andWhere).toHaveBeenCalledWith("issue.status_id = :dimId", { dimId: 4 });
  });

  it("rejects dim=status on drilldown — a status has no level-2 ring", async () => {
    const { service, builders } = makeService();

    await expect(service.drilldown("assigned", "status", "12", USER)).rejects.toThrow("dim");

    expect(builders).toHaveLength(0);
  });
});

describe("DashboardService company filter", () => {
  const EXISTS_SQL =
    "EXISTS (SELECT 1 FROM users u WHERE u.id = issue.customer_id AND u.company_id IN (:...companyIds))";

  /** The `companyIds` parameter bound to one builder's company clause. */
  function companyParams(b: BuilderStub): number[] | undefined {
    for (const call of b.andWhere.mock.calls) {
      if (typeof call[0] === "string" && call[0].includes("company_id IN")) {
        return (call[1] as { companyIds?: number[] } | undefined)?.companyIds;
      }
    }
    return undefined;
  }

  it("narrows EVERY aggregate — including the status ring and the total", async () => {
    const { service, builders } = makeService([statusesRaw(), [], [], [], []], [7]);

    const result = await service.summary("assigned", "week", USER, {}, undefined, [6]);

    // echoed back so the client keeps rendering what the server really applied
    expect(result.companyIds).toEqual([6]);
    expect(result.total).toBe(7);

    // unlike statusId, the company picker is a DATA SCOPE: the ring's context
    // pair (total + statuses) narrows with everything else on the page
    for (const b of builders) {
      expect(b.conditions.join(" ")).toContain(EXISTS_SQL);
      expect(companyParams(b)).toEqual([6]);
    }
  });

  it("follows the REPORTER's company, not the app's contract row", async () => {
    const { service, builders } = makeService([statusesRaw(), [], [], [], []], [0]);

    await service.summary("assigned", "week", USER, {}, undefined, [4, 6]);

    // the same path GET /issues and GET /reports filter by — one definition
    // of "which company owns this card" across the three screens
    expect(builders[0].conditions.join(" ")).toContain("u.id = issue.customer_id");
    expect(companyParams(builders[0])).toEqual([4, 6]);
    expect(builders[0].conditions.join(" ")).not.toContain("issue.app_id");
  });

  it("filters nothing and echoes [] when no company is picked", async () => {
    const { service, builders } = makeService([statusesRaw(), [], [], [], []], [0]);

    const result = await service.summary("assigned", "week", USER);

    expect(result.companyIds).toEqual([]);
    for (const b of builders) {
      expect(b.conditions.join(" ")).not.toContain("company_id IN");
    }
  });

  it("narrows the workload too (open cards of that company's reporters)", async () => {
    const { service, permissions, builders } = makeService(allScopeQueue(), [0]);
    permissions.getUserPermissions.mockResolvedValue([OWN, OVERVIEW]);

    await service.summary("all", "week", ADMIN_USER, {}, undefined, [6]);

    // builder order: total, statuses, priorities, apps, categories,
    // trend, workload
    expect(builders[6].conditions.join(" ")).toContain(EXISTS_SQL);
    expect(companyParams(builders[6])).toEqual([6]);
  });

  it("carries the filter into a trend bar's list so it still matches the bar", async () => {
    const { service, builders } = makeService([], [], [[]]);

    await service.trendIssues("assigned", "week", "2026-09-28", USER, undefined, [6]);

    expect(builders[0].andWhere).toHaveBeenCalledWith(EXISTS_SQL, { companyIds: [6] });
  });

  it("carries the filter into a donut slice's list", async () => {
    const { service, builders } = makeService([], [], [[]]);

    await service.dimensionIssues("assigned", "category", "5", undefined, USER, undefined, [6]);

    expect(builders[0].andWhere).toHaveBeenCalledWith(EXISTS_SQL, { companyIds: [6] });
  });

  it("carries the filter into the level-2 drilldown", async () => {
    const { service, permissions, builders } = makeService([[]]);
    permissions.getUserPermissions.mockResolvedValue([OWN, OVERVIEW]);

    await service.drilldown("all", "category", "12", ADMIN_USER, undefined, [6]);

    expect(builders[0].andWhere).toHaveBeenCalledWith(EXISTS_SQL, { companyIds: [6] });
  });
});

/** Statuses raw row for a run whose only non-empty dimension is statuses. */
function statusesRaw() {
  return [{ id: "1", count: "2" }];
}
