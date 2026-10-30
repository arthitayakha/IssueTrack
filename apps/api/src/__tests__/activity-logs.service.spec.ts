import { ActivityLogsService } from "../modules/activity-logs/activity-logs.service";

/**
 * ActivityLogsService is tested with a stub repository — no database, no Nest
 * testing module. Two read paths are covered: the issue-scoped history (the
 * card drawer) and the system-wide feed behind /logs.
 */

interface QueryBuilderStub {
  distinct: jest.Mock;
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  orderBy: jest.Mock;
  getRawMany: jest.Mock;
}

interface RepoStub {
  find: jest.Mock;
  findAndCount: jest.Mock;
  createQueryBuilder: jest.Mock;
}

function queryBuilderStub(raw: unknown[] = []): QueryBuilderStub {
  const chain: QueryBuilderStub = {
    distinct: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    select: jest.fn(),
    addSelect: jest.fn(),
    orderBy: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue(raw),
  };
  // every builder call returns the builder itself
  for (const key of ["distinct", "innerJoin", "leftJoin", "select", "addSelect", "orderBy"] as const) {
    chain[key].mockReturnValue(chain);
  }
  return chain;
}

function makeService(): {
  service: ActivityLogsService;
  logs: RepoStub;
  setActorsRaw: (raw: unknown[]) => void;
} {
  const logs: RepoStub = {
    find: jest.fn().mockResolvedValue([]),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn(),
  };
  let builder = queryBuilderStub();
  logs.createQueryBuilder.mockImplementation(() => builder);
  const service = new ActivityLogsService(logs as unknown as never);
  return {
    service,
    logs,
    setActorsRaw: (raw: unknown[]) => {
      builder = queryBuilderStub(raw);
    },
  };
}

function logRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    action: "card.moved",
    entityId: 42,
    actorId: 1,
    detail: JSON.stringify({ from: "Backlog", to: "Doing" }),
    actor: { name: "aom", role: { name: "admin" } },
    createdAt: new Date("2026-03-04T05:06:07.000Z"),
    ...overrides,
  };
}

describe("ActivityLogsService", () => {
  describe("findByIssue", () => {
    it("excludes rule.* rows and maps the actor join", async () => {
      const { service, logs } = makeService();
      logs.find.mockResolvedValue([logRow()]);

      const [dto] = await service.findByIssue(42);

      expect(dto).toMatchObject({
        action: "card.moved",
        actorName: "aom",
        actorRole: "admin",
        entityId: 42,
        detail: JSON.stringify({ from: "Backlog", to: "Doing" }),
      });
      const where = logs.find.mock.calls[0][0].where as {
        entityId: number;
        // Not(Like(...)) — `value` unwraps to the inner literal, the wrapper
        // operator (the "like") is reachable through `child`
        action: { type: string; value: string; child: { type: string } };
      };
      expect(where.entityId).toBe(42);
      expect(where.action.type).toBe("not");
      expect(where.action.value).toBe("rule.%");
      expect(where.action.child.type).toBe("like");
    });
  });

  describe("findAll", () => {
    it("defaults to page 1 / 10 per page, newest first", async () => {
      const { service, logs } = makeService();
      logs.findAndCount.mockResolvedValue([[], 0]);

      const page = await service.findAll({});

      expect(page).toMatchObject({ page: 1, limit: 10, total: 0, totalPages: 1 });
      const options = logs.findAndCount.mock.calls[0][0] as {
        order: Record<string, string>;
        skip: number;
        take: number;
      };
      expect(options.order).toEqual({ createdAt: "DESC", id: "DESC" });
      expect(options.skip).toBe(0);
      expect(options.take).toBe(10);
    });

    it("maps a row: type from the action prefix and detail parsed to payload", async () => {
      const { service, logs } = makeService();
      logs.findAndCount.mockResolvedValue([[logRow()], 1]);

      const { data } = await service.findAll({});

      expect(data[0]).toMatchObject({
        type: "card",
        actorName: "aom",
        actorRole: "admin",
        payload: { from: "Backlog", to: "Doing" },
        createdAt: "2026-03-04T05:06:07.000Z",
      });
    });

    it("treats a non-JSON detail as no payload instead of throwing", async () => {
      const { service, logs } = makeService();
      logs.findAndCount.mockResolvedValue([[logRow({ detail: "free text" })], 1]);

      const { data } = await service.findAll({});

      expect(data[0].payload).toBeNull();
    });

    it("filters by group type, actor and search", async () => {
      const { service, logs } = makeService();
      logs.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ type: "comment", actorId: "7", search: " bug " });

      const where = logs.findAndCount.mock.calls[0][0].where as {
        action: { type: string; value: string };
        actorId: number;
        detail: { type: string; value: string };
      };
      expect(where.action.type).toBe("like");
      expect(where.action.value).toBe("comment.%");
      expect(where.actorId).toBe(7);
      expect(where.detail.type).toBe("ilike");
      expect(where.detail.value).toBe("%bug%");
    });

    it("ignores an unknown type instead of hiding every row", async () => {
      const { service, logs } = makeService();
      logs.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ type: "banana" });

      const where = logs.findAndCount.mock.calls[0][0].where as { action?: unknown };
      expect(where.action).toBeUndefined();
    });

    it("applies the created-from/created-to range and drops bad dates", async () => {
      const { service, logs } = makeService();
      logs.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll({ createdFrom: "2026-03-01", createdTo: "2026-03-04" });
      const ranged = logs.findAndCount.mock.calls[0][0].where as {
        createdAt: { type: string; value: [Date, Date] };
      };
      // day boundaries are built in server-local time (same as RulesService)
      expect(ranged.createdAt.type).toBe("between");
      expect(ranged.createdAt.value[0]).toEqual(new Date("2026-03-01T00:00:00"));
      expect(ranged.createdAt.value[1]).toEqual(new Date("2026-03-04T23:59:59.999"));

      await service.findAll({ createdFrom: "not-a-date" });
      const unfiltered = logs.findAndCount.mock.calls[1][0].where as { createdAt?: unknown };
      expect(unfiltered.createdAt).toBeUndefined();
    });
  });

  describe("findActors", () => {
    it("returns distinct actors with their role", async () => {
      const { service, logs, setActorsRaw } = makeService();
      setActorsRaw([
        { actorId: 1, name: "aom", role: "admin" },
        { actorId: 13, name: "programmer", role: null },
      ]);

      await expect(service.findActors()).resolves.toEqual([
        { id: 1, name: "aom", role: "admin" },
        { id: 13, name: "programmer", role: null },
      ]);
      // `.distinct(true)` is the only form that survives addSelect — a
      // `.select("DISTINCT ...")` string emits `SELECT a, DISTINCT b`
      expect(logs.createQueryBuilder).toHaveBeenCalled();
      const builder = logs.createQueryBuilder.mock.results[0].value as {
        distinct: jest.Mock;
      };
      expect(builder.distinct).toHaveBeenCalledWith(true);
    });
  });
});
