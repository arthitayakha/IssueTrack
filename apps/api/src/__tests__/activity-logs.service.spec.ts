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
    it("restricts to card/comment rows and maps the actor join", async () => {
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

      // Top-level array = TypeORM's OR. Each branch carries its own entityId so
      // the card timeline can never pick up a `user.*`/`app.*` row that happens
      // to share the number — the interceptor writes those with entity ids too.
      const where = logs.find.mock.calls[0][0].where as Array<{
        entityId: number;
        action: { type: string; value: string };
      }>;
      expect(where).toHaveLength(2);
      expect(where.map((branch) => branch.action.value)).toEqual(["card.%", "comment.%"]);
      for (const branch of where) expect(branch.entityId).toBe(42);
      for (const branch of where) expect(branch.action.type).toBe("like");
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

      // one prefix → a one-branch OR array; the shared filters ride along on it
      const where = logs.findAndCount.mock.calls[0][0].where as Array<{
        action: { type: string; value: string };
        actorId: number;
        detail: { type: string; value: string };
      }>;
      expect(where).toHaveLength(1);
      expect(where[0].action.type).toBe("like");
      expect(where[0].action.value).toBe("comment.%");
      expect(where[0].actorId).toBe(7);
      expect(where[0].detail.type).toBe("ilike");
      expect(where[0].detail.value).toBe("%bug%");
    });

    it("expands a multi-prefix group into one branch per prefix", async () => {
      const { service, logs } = makeService();
      logs.findAndCount.mockResolvedValue([[], 0]);

      // `user` = user/role/position/permission/auth — filtering on `user.%`
      // alone would hide the other four groups' rows
      await service.findAll({ type: "user", actorId: "7" });

      const where = logs.findAndCount.mock.calls[0][0].where as Array<{
        action: { value: string };
        actorId: number;
      }>;
      expect(where.map((branch) => branch.action.value)).toEqual([
        "user.%",
        "role.%",
        "position.%",
        "permission.%",
        "auth.%",
      ]);
      // every branch keeps the actor filter, or the OR would drop it
      for (const branch of where) expect(branch.actorId).toBe(7);
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
