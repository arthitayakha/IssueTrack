import { BadRequestException, NotFoundException } from "@nestjs/common";
import { RulesService, type RuleInput } from "../modules/rules/rules.service";

/**
 * RulesService is tested with stub repositories: no database, no Nest testing
 * module. Only the behaviour callers rely on is asserted — validation, DTO
 * mapping, condition replacement and audit pagination.
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
  activityLogs: RepoStub;
  notifications: { notifyAdmins: jest.Mock };
} {
  const rules = repoStub();
  const activityLogs = repoStub();
  // board-wide rule-change alerts — assert they fire, never let them throw
  const notifications = { notifyAdmins: jest.fn().mockResolvedValue(undefined) };
  const service = new RulesService(
    rules as unknown as never,
    activityLogs as unknown as never,
    notifications as unknown as never,
  );
  return { service, rules, activityLogs, notifications };
}

/** The actor every CRUD call now carries (controller builds it from the JWT). */
const ACTOR = { actorId: 1, actorName: "aom", actorRole: "admin" };

function ruleRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 7,
    name: "Auto triage",
    triggerKey: "issue.created",
    templateKey: null,
    category: null,
    actionKey: "issue.set_priority",
    actionConfig: { priority: 3 },
    conditions: [],
    isActive: true,
    stopOnError: false,
    createdBy: 1,
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    updatedAt: new Date("2026-01-03T03:04:05.000Z"),
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
      // conditions ride on the rule row itself (JSONB) — no relation to load
      expect(rules.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: "DESC" } }),
      );
      expect(rules.find).toHaveBeenCalledWith(
        expect.not.objectContaining({ relations: expect.anything() }),
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
      await expect(service.create({ actionKey: "issue.lock" }, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.create({ triggerKey: "issue.moved" }, ACTOR)).rejects.toBeInstanceOf(
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

      const long = await service.create({ ...valid, name: "x".repeat(400) }, ACTOR);
      expect(long.name).toHaveLength(150);

      const blank = await service.create({ ...valid, name: "   " }, ACTOR);
      expect(blank.name).toBe("Untitled rule");
    });

    it("defaults condition positions to their index and marks the rule active", async () => {
      const { service, rules } = makeService();
      rules.save.mockImplementation(async (value: Record<string, unknown>) => ({ ...value, id: 2 }));
      rules.findOne.mockResolvedValue(ruleRecord({ id: 2 }));

      await service.create(valid, ACTOR);

      const created = rules.create.mock.calls[0][0] as {
        isActive: boolean;
        stopOnError: boolean;
        createdBy: number;
        conditions: Array<{ field: string; operator: string; position: number }>;
      };
      expect(created.isActive).toBe(true);
      expect(created.stopOnError).toBe(false);
      expect(created.createdBy).toBe(1);
      // conditions land on the rule row itself as a plain JSON array
      expect(created.conditions).toEqual([
        { field: "to_status", operator: "=", value: "4", position: 0 },
      ]);
    });
  });

  describe("update", () => {
    it("replaces the condition set stored on the rule", async () => {
      const { service, rules } = makeService();
      const existing = ruleRecord({
        id: 5,
        name: "Old",
        conditions: [{ field: "category", operator: "=", value: "9", position: 0 }],
      });
      rules.findOne.mockResolvedValue(existing);

      await service.update(5, { name: "Renamed", conditions: [] }, ACTOR);

      expect(existing.name).toBe("Renamed");
      expect(existing.conditions).toEqual([]);
      expect(rules.save).toHaveBeenCalledWith(existing);
    });

    it("keeps the stored conditions when the input omits them", async () => {
      const { service, rules } = makeService();
      const stored = [{ field: "category", operator: "=", value: "1", position: 0 }];
      const existing = ruleRecord({ id: 6, conditions: stored });
      rules.findOne.mockResolvedValue(existing);

      await service.update(6, { name: "Renamed only" }, ACTOR);

      expect(existing.conditions).toEqual(stored);
    });

    it("rejects an empty trigger or action when one is supplied", async () => {
      const { service, rules } = makeService();
      // answer per id so 404 really is "not found"
      rules.findOne.mockImplementation(
        async ({ where }: { where: { id: number } }) =>
          (where.id === 404 ? null : ruleRecord({ id: where.id })) as never,
      );

      await expect(service.update(5, { triggerKey: " " }, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.update(5, { actionKey: "" }, ACTOR)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.update(404, { name: "x" }, ACTOR)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("toggle / remove", () => {
    it("toggles the active flag", async () => {
      const { service, rules } = makeService();
      rules.findOne.mockResolvedValue(ruleRecord({ id: 3 }));

      await service.toggle(3, false, ACTOR);

      expect(rules.update).toHaveBeenCalledWith(3, { isActive: false });
    });

    it("reports a missing rule on toggle and on delete", async () => {
      const { service } = makeService();
      await expect(service.toggle(404, true, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(404, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("returns deleted: true when the row went away", async () => {
      const { service, rules } = makeService();
      rules.findOne.mockResolvedValue(ruleRecord({ id: 8 }));
      rules.delete.mockResolvedValue({ affected: 1 });
      await expect(service.remove(8, ACTOR)).resolves.toEqual({ deleted: true });
    });
  });

  describe("audit log (activity_logs)", () => {
    it("records create / update / toggle / delete with the actor and rule name", async () => {
      const { service, rules, activityLogs } = makeService();
      rules.save.mockImplementation(async (value: Record<string, unknown>) => ({ ...value, id: 9 }));
      rules.findOne.mockResolvedValue(ruleRecord({ id: 9 }));
      rules.delete.mockResolvedValue({ affected: 1 });

      await service.create(
        { name: "New rule", triggerKey: "issue.moved", actionKey: "issue.lock" },
        ACTOR,
      );
      await service.update(9, { name: "Renamed" }, ACTOR);
      await service.toggle(9, false, ACTOR);
      await service.remove(9, ACTOR);

      const rows = activityLogs.create.mock.calls.map((c) => c[0] as Record<string, unknown>);
      expect(rows.map((r) => r.action)).toEqual([
        "rule.created",
        "rule.updated",
        "rule.updated",
        "rule.deleted",
      ]);
      expect(rows[0]).toMatchObject({
        entityId: 9,
        detail: JSON.stringify({ ruleName: "New rule" }),
        actorId: 1,
        actorName: "aom",
        actorRole: "admin",
      });
      // update / toggle / delete all see the renamed rule (the delete captures
      // the name before the row goes away)
      expect(rows[1].detail).toBe(JSON.stringify({ ruleName: "Renamed" }));
      expect(rows[2].detail).toBe(JSON.stringify({ ruleName: "Renamed" }));
      expect(rows[3].detail).toBe(JSON.stringify({ ruleName: "Renamed" }));
      expect(activityLogs.save).toHaveBeenCalledTimes(4);
    });

    it("writes no log when the rule does not exist", async () => {
      const { service, activityLogs } = makeService();
      await expect(service.remove(404, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.toggle(404, true, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
      expect(activityLogs.create).not.toHaveBeenCalled();
    });

    it("keeps the CRUD call working even when the log write fails", async () => {
      const { service, rules, activityLogs } = makeService();
      rules.findOne.mockResolvedValue(ruleRecord({ id: 3 }));
      activityLogs.save.mockRejectedValue(new Error("db down"));

      await expect(service.toggle(3, false, ACTOR)).resolves.toMatchObject({ id: 3 });
      expect(activityLogs.save).toHaveBeenCalledTimes(1);
    });
  });

  describe("rule-change notifications (notifyAdmins)", () => {
    it("notifies admins on create / update / toggle — but not on delete", async () => {
      const { service, rules, notifications } = makeService();
      rules.save.mockImplementation(async (value: Record<string, unknown>) => ({ ...value, id: 9 }));
      rules.findOne.mockResolvedValue(ruleRecord({ id: 9 }));
      rules.delete.mockResolvedValue({ affected: 1 });

      await service.create(
        { name: "New rule", triggerKey: "issue.moved", actionKey: "issue.lock" },
        ACTOR,
      );
      await service.update(9, { name: "Renamed" }, ACTOR);
      await service.toggle(9, false, ACTOR);
      await service.remove(9, ACTOR);

      const calls = notifications.notifyAdmins.mock.calls.map((c) => c[0] as Record<string, unknown>);
      expect(calls.map((c) => c.action)).toEqual(["rule_created", "rule_updated", "rule_updated"]);
      // deep-links to the wizard's edit page, carries the rule name and actor
      expect(calls[0]).toMatchObject({
        title: "New rule",
        link: "/automation/9",
        actor: { actorId: 1, actorName: "aom" },
      });
      expect(calls[1].title).toBe("Renamed");
    });

    it("keeps the CRUD call working even when the notification fails", async () => {
      const { service, rules, notifications } = makeService();
      rules.findOne.mockResolvedValue(ruleRecord({ id: 3 }));
      notifications.notifyAdmins.mockRejectedValue(new Error("db down"));

      // notifyAdmins itself never throws (best-effort), but even a rejection
      // bubbling up must not break the toggle
      await expect(service.toggle(3, false, ACTOR)).resolves.toMatchObject({ id: 3 });
    });
  });

  describe("findActivity", () => {
    it("normalises pagination and only reads rule.* rows", async () => {
      const { service, activityLogs } = makeService();
      activityLogs.findAndCount.mockResolvedValue([[], 0]);

      const first = await service.findActivity({ page: "0", limit: "5000" });
      expect(first).toMatchObject({ page: 1, limit: 100, total: 0, totalPages: 1 });

      const where = activityLogs.findAndCount.mock.calls[0][0].where as {
        action: { type: string; value: string };
      };
      expect(where.action.type).toBe("like");
      expect(where.action.value).toBe("rule.%");

      await service.findActivity({ ruleId: "7" });
      const filtered = activityLogs.findAndCount.mock.calls[1][0].where as {
        action: { type: string };
        entityId?: number;
      };
      expect(filtered.action.type).toBe("like");
      expect(filtered.entityId).toBe(7);
    });

    it("maps rows and pulls the rule name out of detail", async () => {
      const { service, activityLogs } = makeService();
      activityLogs.findAndCount.mockResolvedValue(
        [
          [
            {
              id: 1,
              action: "rule.deleted",
              entityId: 7,
              detail: JSON.stringify({ ruleName: "Auto" }),
              actorName: "aom",
              actorRole: "admin",
              createdAt: new Date("2026-03-04T05:06:07.000Z"),
            },
            {
              id: 2,
              action: "rule.updated",
              entityId: null,
              detail: null,
              actorName: null,
              actorRole: null,
              createdAt: new Date("2026-03-04T05:06:08.000Z"),
            },
          ],
          2,
        ],
      );

      const page = await service.findActivity({});

      expect(page.total).toBe(2);
      expect(page.data[0]).toEqual({
        id: 1,
        action: "rule.deleted",
        ruleId: 7,
        ruleName: "Auto",
        actorName: "aom",
        actorRole: "admin",
        createdAt: "2026-03-04T05:06:07.000Z",
      });
      // a row with no usable detail still reaches the page
      expect(page.data[1]).toMatchObject({ ruleId: null, ruleName: null, actorName: null });
    });
  });
});
