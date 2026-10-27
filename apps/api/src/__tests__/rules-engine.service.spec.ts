import { RulesEngineService, type EngineTrigger } from "../modules/rules/rules-engine.service";

/**
 * The engine is the one piece that silently changes data on behalf of a user,
 * so these tests pin down its contract: it records only real executions, it
 * never breaks the request that triggered it, it never re-enters itself and it
 * renders the Thai message tokens the wizard offers.
 *
 * Everything runs against stub repositories — no database, no Nest testing
 * module — so the suite stays safe to run while `npm run dev` is up.
 */

interface Stub {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
}

function repo(overrides: Partial<Stub> = {}): Stub {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (value: unknown) => value),
    create: jest.fn((value: unknown) => value),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  };
}

type EngineArgs = ConstructorParameters<typeof RulesEngineService>;

/** Builds the engine with one stub per injected repository, in injection order. */
function makeEngine() {
  const rules = repo();
  const runs = repo();
  const issues = repo();
  const comments = repo();
  const users = repo();
  const labels = repo();
  const positions = repo();
  const statuses = repo();
  const priorities = repo();
  const categories = repo();
  const activityLogs = repo();
  const repos = [
    rules,
    runs,
    issues,
    comments,
    users,
    labels,
    positions,
    statuses,
    priorities,
    categories,
    activityLogs,
  ];
  const engine = new RulesEngineService(...(repos as unknown as EngineArgs));
  return { engine, rules, runs, issues, comments, users, statuses, activityLogs };
}

function rule(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: "Auto lock",
    triggerKey: "issue.moved",
    actionKey: "issue.lock",
    actionConfig: {},
    conditions: [],
    isActive: true,
    stopOnError: false,
    createdBy: 1,
    ...overrides,
  };
}

/** The row the engine created for the first recorded run, if any. */
function recordedRun(runs: Stub): Record<string, unknown> | null {
  if (runs.create.mock.calls.length === 0) return null;
  return runs.create.mock.calls[0][0] as Record<string, unknown>;
}

const MOVED: EngineTrigger = "issue.moved";

describe("RulesEngineService.evaluate", () => {
  it("runs the action and records an applied run when conditions pass", async () => {
    const { engine, rules, runs, issues } = makeEngine();
    rules.find.mockResolvedValue([
      rule({ actionKey: "issue.set_priority", actionConfig: { priority: 3 } }),
    ]);

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 5 });

    expect(issues.update).toHaveBeenCalledWith(42, { priorityId: 3 });
    expect(recordedRun(runs)).toMatchObject({
      status: "applied",
      triggerKey: "issue.moved",
      issueId: 42,
      actionKey: "issue.set_priority",
      detail: null,
    });
    expect(runs.save).toHaveBeenCalledTimes(1);
  });

  it("records nothing when a condition does not pass", async () => {
    const { engine, rules, runs, issues } = makeEngine();
    rules.find.mockResolvedValue([
      rule({ conditions: [{ field: "to_status", operator: "=", value: "9", position: 0 }] }),
    ]);

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 5 });

    expect(issues.update).not.toHaveBeenCalled();
    expect(runs.save).not.toHaveBeenCalled();
  });

  it("ANDs several conditions and understands list operators", async () => {
    const { engine, rules, runs } = makeEngine();
    rules.find.mockResolvedValue([
      rule({
        actionKey: "issue.unassign",
        conditions: [
          { field: "to_status", operator: "in", value: "5, 6", position: 0 },
          { field: "actor_role", operator: "=", value: "admin", position: 1 },
        ],
      }),
    ]);

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 5, actorRole: "admin" });
    expect(recordedRun(runs)).toMatchObject({ status: "applied" });

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 5, actorRole: "customer" });
    expect(runs.create).toHaveBeenCalledTimes(1); // the second round recorded nothing
  });

  it("skips, with a reason, an action the engine cannot run yet", async () => {
    const { engine, rules, runs, issues } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "work_session.start" })]);

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(issues.update).not.toHaveBeenCalled();
    expect(recordedRun(runs)).toMatchObject({ status: "skipped" });
    expect(String(recordedRun(runs)?.detail)).toMatch(/not supported yet/);
  });

  it("skips when the context carries no issue", async () => {
    const { engine, rules, runs } = makeEngine();
    rules.find.mockResolvedValue([rule()]);

    await engine.evaluate(MOVED, {});

    expect(recordedRun(runs)).toMatchObject({ status: "skipped", issueId: null });
    expect(String(recordedRun(runs)?.detail)).toMatch(/no issue in context/);
  });

  it("marks a failed action without rejecting the caller", async () => {
    const { engine, rules, runs, issues } = makeEngine();
    rules.find.mockResolvedValue([rule()]);
    issues.update.mockRejectedValue(new Error("deadlock detected"));

    await expect(engine.evaluate(MOVED, { issueId: 42 })).resolves.toBeUndefined();

    expect(recordedRun(runs)).toMatchObject({ status: "failed", detail: "deadlock detected" });
  });

  it("stops after a failure when the rule asks for it", async () => {
    const { engine, rules, runs, issues } = makeEngine();
    rules.find.mockResolvedValue([
      rule({ id: 1, stopOnError: true }),
      rule({ id: 2, actionKey: "issue.unlock" }),
    ]);
    issues.update.mockRejectedValue(new Error("boom"));

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(runs.create).toHaveBeenCalledTimes(1);
    expect(issues.update).toHaveBeenCalledTimes(1);
  });

  it("keeps evaluating the other rules after a failure without stopOnError", async () => {
    const { engine, rules, runs, issues } = makeEngine();
    rules.find.mockResolvedValue([
      rule({ id: 1, actionKey: "issue.set_priority", actionConfig: { priority: 1 } }),
      rule({ id: 2, actionKey: "issue.unlock" }),
    ]);
    issues.update.mockRejectedValueOnce(new Error("boom"));

    await engine.evaluate(MOVED, { issueId: 42 });

    const statuses = runs.create.mock.calls.map(([row]) => (row as { status: string }).status);
    expect(statuses).toEqual(["failed", "applied"]);
  });

  it("ignores a nested evaluation fired from inside an action", async () => {
    const { engine, rules, runs, issues } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "issue.unlock" })]);
    issues.update.mockImplementation(async () => {
      // an action must not trigger another round of rules
      void engine.evaluate("comment.created", { issueId: 42 });
      return { affected: 1 };
    });

    await engine.evaluate(MOVED, { issueId: 42 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(rules.find).toHaveBeenCalledTimes(1);
    expect(runs.create).toHaveBeenCalledTimes(1);
  });

  it("swallows a repository error instead of breaking the request", async () => {
    const { engine, rules, runs } = makeEngine();
    rules.find.mockRejectedValue(new Error("connection refused"));

    await expect(engine.evaluate(MOVED, { issueId: 42 })).resolves.toBeUndefined();
    expect(runs.save).not.toHaveBeenCalled();
  });

  it("still resolves when storing the run fails", async () => {
    const { engine, rules, runs, issues } = makeEngine();
    rules.find.mockResolvedValue([rule()]);
    runs.save.mockRejectedValue(new Error("disk full"));

    await expect(engine.evaluate(MOVED, { issueId: 42 })).resolves.toBeUndefined();
    expect(issues.update).toHaveBeenCalled();
  });

  it("queries only active rules for the trigger that fired", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([]);

    await engine.evaluate("comment.created", { issueId: 1 });

    expect(rules.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { triggerKey: "comment.created", isActive: true },
        relations: { conditions: true },
      }),
    );
  });

  describe("auto-comment rendering", () => {
    function setupCommentRule(text: string) {
      const ctx = makeEngine();
      ctx.rules.find.mockResolvedValue([
        rule({ actionKey: "issue.comment", actionConfig: { text } }),
      ]);
      ctx.issues.findOne.mockResolvedValue({ id: 42, title: "เข้าสู่ระบบไม่ได้" });
      ctx.users.findOne.mockResolvedValue({ id: 7, name: "สมชาย", role: { name: "admin" } });
      ctx.statuses.findOne.mockResolvedValue({ id: 5, name: "กำลังตรวจสอบ" });
      return ctx;
    }

    it("substitutes the Thai tokens the wizard offers and keeps unknown ones", async () => {
      const { engine, comments, activityLogs } = setupCommentRule(
        "การ์ด {ชื่อการ์ด} โดย {ผู้กระทำ} → {สถานะใหม่} [{ไม่มีจริง}]",
      );

      await engine.evaluate(MOVED, { issueId: 42, actorId: 7, toStatusId: 5 });

      expect(comments.save).toHaveBeenCalledWith(
        expect.objectContaining({
          issueId: 42,
          userId: 7,
          comment: "การ์ด เข้าสู่ระบบไม่ได้ โดย สมชาย → กำลังตรวจสอบ [{ไม่มีจริง}]",
        }),
      );
      expect(activityLogs.save).toHaveBeenCalledWith(
        expect.objectContaining({ action: "comment.created", entityId: 42 }),
      );
    });

    it("renders a token blank when its value is unknown", async () => {
      const { engine, comments } = setupCommentRule("จาก {สถานะเดิม} ไป {สถานะใหม่}");

      await engine.evaluate(MOVED, { issueId: 42, actorId: 7 });

      expect(comments.save).toHaveBeenCalledWith(
        expect.objectContaining({ comment: "จาก  ไป " }),
      );
    });

    it("skips when the rule has no message to post", async () => {
      const { engine, comments, runs } = setupCommentRule("   ");

      await engine.evaluate(MOVED, { issueId: 42 });

      expect(comments.save).not.toHaveBeenCalled();
      expect(recordedRun(runs)).toMatchObject({ status: "skipped" });
    });
  });
});
