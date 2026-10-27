import { BadRequestException, NotFoundException } from "@nestjs/common";
import { RulesService, type RuleInput } from "../modules/rules/rules.service";
import { RuleCondition } from "../modules/rules/entities/rule-condition.entity";

/**
 * RulesService is tested with stub repositories: no database, no Nest testing
 * module. Only the behaviour callers rely on is asserted — validation, DTO
 * mapping, condition replacement and run pagination.
 */

interface RepoStub {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  findAndCount: jest.Mock;
  manager: { transaction: jest.Mock };
}

function repoStub(overrides: Partial<RepoStub> = {}): RepoStub {
  const transaction = jest.fn(async (cb: (em: Record<string, jest.Mock>) => Promise<void>) => {
    await cb({ save: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) });
  });
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (value: unknown) => value),
    create: jest.fn((value: unknown) => value),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    // nothing matched unless a test says otherwise
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    manager: { transaction: transaction as unknown as RepoStub["manager"]["transaction"] },
    ...overrides,
  };
}

function makeService(): {
  service: RulesService;
  rules: RepoStub;
  conditions: RepoStub;
  runs: RepoStub;
} {
  const rules = repoStub();
  const conditions = repoStub();
  const runs = repoStub();
  const service = new RulesService(
    rules as unknown as never,
    conditions as unknown as never,
    runs as unknown as never,
  );
  return { service, rules, conditions, runs };
}

function ruleRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    name: "Auto triage",
    triggerKey: "issue.created",
    templateKey: null,
    category: null,
    actionKey: "issue.set_priority",
    actionConfig: { priority: 3 },
    conditionGroup: "AND",
    isActive: true,
    stopOnError: false,
    createdBy: 1,
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    updatedAt: new Date("2026-01-03T03:04:05.000Z"),
    conditions: [],
    ...overrides,
  };
}

describe("RulesService", () => {
  describe("findAll / toDto", () => {
    it("maps a rule and sorts its conditions by position", async () => {
      const { service, rules } = makeService();
      rules.find.mockResolvedValue([
        ruleRecord({
          conditions: [
            { field: "status", operator: "=", value: "2", position: 1 },
            { field: "priority", operator: "in", value: "1,2", position: 0 },
          ],
        }),
      ]);

      const [dto] = await service.findAll();

      expect(dto.conditions.map((c) => c.field)).toEqual(["priority", "status"]);
      expect(dto.conditions[0]).toEqual({ field: "priority", operator: "in", value: "1,2", position: 0 });
      // null-ish columns come back as usable defaults for the wizard
      expect(dto.category).toBe("");
      expect(dto.actionConfig).toEqual({ priority: 3 });
      expect(dto.createdAt).toBe("2026-01-02T03:04:05.000Z");
      expect(rules.find).toHaveBeenCalledWith(
        expect.objectContaining({ relations: { conditions: true } }),
      );
    });

    it("throws NotFoundException for a missing rule", async () => {
      const { service } = makeService();
      await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("create", () => {
    const valid: RuleInput = {
      name: "New rule",
      triggerKey: "issue.moved",
      actionKey: "issue.lock",
      conditions: [{ field: "to_status", operator: "=", value: "4" }],
    };

    it("rejects a rule without a trigger or an action", async () => {
      const { service } = makeService();
      await expect(service.create({ actionKey: "issue.lock" }, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.create({ triggerKey: "issue.moved" }, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("trims the name to 150 characters and defaults a blank one", async () => {
      const { service, rules } = makeService();
      // create() re-reads the rule, so the stub has to hand back what it saved
      // (the entity's timestamps are filled in by the DB in production)
      let stored: Record<string, unknown> | null = null;
      rules.save.mockImplementation(async (value: Record<string, unknown>) => {
        stored = {
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          ...value,
          id: 1,
        };
        return stored;
      });
      rules.findOne.mockImplementation(async () => stored);

      const long = await service.create({ ...valid, name: "x".repeat(400) }, 1);
      expect(long.name).toHaveLength(150);

      const blank = await service.create({ ...valid, name: "   " }, 1);
      expect(blank.name).toBe("Untitled rule");
    });

    it("defaults condition positions to their index and marks the rule active", async () => {
      const { service, rules } = makeService();
      rules.save.mockImplementation(async (value: Record<string, unknown>) => ({ ...value, id: 2 }));
      rules.findOne.mockResolvedValue(ruleRecord({ id: 2 }));

      await service.create(valid, 1);

      const created = rules.create.mock.calls[0][0] as {
        isActive: boolean;
        stopOnError: boolean;
        createdBy: number;
        conditions: Array<{ position: number; ruleId: number }>;
      };
      expect(created.isActive).toBe(true);
      expect(created.stopOnError).toBe(false);
      expect(created.createdBy).toBe(1);
      expect(created.conditions[0].position).toBe(0);
      expect(created.conditions[0].ruleId).toBe(0);
    });
  });

  describe("update", () => {
    it("replaces the condition set inside a transaction", async () => {
      const { service, rules } = makeService();
      const existing = ruleRecord({ id: 5, name: "Old" });
      rules.findOne.mockResolvedValue(existing);

      const em = { save: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue(undefined) };
      rules.manager.transaction.mockImplementation(async (cb: (manager: typeof em) => Promise<void>) =>
        cb(em),
      );

      await service.update(5, { name: "Renamed", conditions: [] });

      expect(rules.manager.transaction).toHaveBeenCalledTimes(1);
      expect(em.delete).toHaveBeenCalledWith(RuleCondition, { ruleId: 5 });
      expect(existing.name).toBe("Renamed");
    });

    it("rejects an empty trigger or action when one is supplied", async () => {
      const { service, rules } = makeService();
      // answer per id so 404 really is "not found"
      rules.findOne.mockImplementation(
        async ({ where }: { where: { id: number } }) =>
          (where.id === 404 ? null : ruleRecord({ id: where.id })) as never,
      );

      await expect(service.update(5, { triggerKey: " " })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.update(5, { actionKey: "" })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.update(404, { name: "x" })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("toggle / remove", () => {
    it("toggles the active flag", async () => {
      const { service, rules } = makeService();
      rules.findOne.mockResolvedValue(ruleRecord({ id: 3 }));

      await service.toggle(3, false);

      expect(rules.update).toHaveBeenCalledWith(3, { isActive: false });
    });

    it("reports a missing rule on toggle and on delete", async () => {
      const { service } = makeService();
      await expect(service.toggle(404, true)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(404)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("returns deleted: true when the row went away", async () => {
      const { service, rules } = makeService();
      rules.delete.mockResolvedValue({ affected: 1 });
      await expect(service.remove(8)).resolves.toEqual({ deleted: true });
    });
  });

  describe("findRuns", () => {
    it("normalises pagination and caps the page size", async () => {
      const { service, runs } = makeService();
      runs.findAndCount.mockResolvedValue([[], 0]);

      const first = await service.findRuns({});
      expect(first).toMatchObject({ page: 1, limit: 10, total: 0, totalPages: 1 });

      const capped = await service.findRuns({ page: "0", limit: "5000" });
      expect(capped).toMatchObject({ page: 1, limit: 100 });

      const second = await service.findRuns({ page: "2", limit: "5" });
      expect(runs.findAndCount).toHaveBeenLastCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
      expect(second.page).toBe(2);
    });

    it("filters by rule and maps rows to DTOs", async () => {
      const { service, runs } = makeService();
      runs.findAndCount.mockResolvedValue([
        [
          {
            id: 11,
            ruleId: 4,
            ruleName: "Auto triage",
            triggerKey: "issue.created",
            issueId: 12,
            issue: { title: "Login broken" },
            status: "applied",
            actionKey: "issue.set_priority",
            detail: null,
            durationMs: 12,
            createdAt: new Date("2026-02-03T04:05:06.000Z"),
          },
          {
            id: 12,
            ruleId: 4,
            ruleName: "Auto triage",
            triggerKey: "issue.created",
            issueId: null,
            issue: null,
            status: "failed",
            actionKey: "issue.lock",
            detail: "boom",
            durationMs: 3,
            createdAt: new Date("2026-02-03T04:05:07.000Z"),
          },
        ],
        2,
      ]);

      const page = await service.findRuns({ ruleId: "4", limit: "1" });

      expect(runs.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { ruleId: 4 }, take: 1 }),
      );
      expect(page.total).toBe(2);
      expect(page.totalPages).toBe(2);
      expect(page.data[0]).toMatchObject({
        issueTitle: "Login broken",
        status: "applied",
        createdAt: "2026-02-03T04:05:06.000Z",
      });
      // a deleted card keeps its history with no title
      expect(page.data[1]).toMatchObject({ issueTitle: null, status: "failed", detail: "boom" });
    });

    it("ignores a non-numeric rule filter", async () => {
      const { service, runs } = makeService();
      runs.findAndCount.mockResolvedValue([[], 0]);

      await service.findRuns({ ruleId: "abc" });

      expect(runs.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });
});
