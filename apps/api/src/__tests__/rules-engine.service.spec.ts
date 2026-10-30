import { RulesEngineService, type EngineTrigger } from "../modules/rules/rules-engine.service";

/**
 * The engine is the one piece that silently changes data on behalf of a user,
 * so these tests pin down its contract: it applies the right action, it never
 * breaks the request that triggered it, it never re-enters itself and it
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
  delete: jest.Mock;
}

function repo(overrides: Partial<Stub> = {}): Stub {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (value: unknown) => value),
    create: jest.fn((value: unknown) => value),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
    ...overrides,
  };
}

type EngineArgs = ConstructorParameters<typeof RulesEngineService>;

/** Builds the engine with one stub per injected repository, in injection order. */
function makeEngine() {
  const rules = repo();
  const issues = repo();
  const comments = repo();
  const users = repo();
  const labels = repo();
  const positions = repo();
  const statuses = repo();
  const priorities = repo();
  const categories = repo();
  const activityLogs = repo();
  const workSessions = repo();
  const repos = [
    rules,
    issues,
    comments,
    users,
    labels,
    positions,
    statuses,
    priorities,
    categories,
    activityLogs,
    workSessions,
  ];
  // rule-driven moves/assigns notify through the shared recipient policy
  const notifications = {
    notifyIssueEvent: jest.fn().mockResolvedValue(undefined),
    notifyStatusChange: jest.fn().mockResolvedValue(undefined),
    notifyAssignmentChange: jest.fn().mockResolvedValue(undefined),
  };
  const engine = new RulesEngineService(
    ...( [...repos, notifications] as unknown as EngineArgs ),
  );
  return {
    engine,
    rules,
    issues,
    comments,
    users,
    statuses,
    activityLogs,
    workSessions,
    notifications,
  };
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

const MOVED: EngineTrigger = "issue.moved";

describe("RulesEngineService.evaluate", () => {
  it("runs the action when conditions pass", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([
      rule({ actionKey: "issue.set_priority", actionConfig: { priority: 3 } }),
    ]);

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 5 });

    expect(issues.update).toHaveBeenCalledWith(42, { priorityId: 3 });
  });

  it("runs nothing when a condition does not pass", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([
      rule({ conditions: [{ field: "to_status", operator: "=", value: "9", position: 0 }] }),
    ]);

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 5 });

    expect(issues.update).not.toHaveBeenCalled();
  });

  it("ANDs several conditions and understands list operators", async () => {
    const { engine, rules, issues } = makeEngine();
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
    expect(issues.update).toHaveBeenCalledWith(42, { programmerId: null });

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 5, actorRole: "customer" });
    expect(issues.update).toHaveBeenCalledTimes(1); // the second round did nothing
  });

  it("skips an action the engine cannot run yet", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "issue.set_time" })]);

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(issues.update).not.toHaveBeenCalled();
  });

  it("skips when the context carries no issue", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([rule()]);

    await engine.evaluate(MOVED, {});

    expect(issues.update).not.toHaveBeenCalled();
  });

  it("does not reject the caller when an action fails", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([rule()]);
    issues.update.mockRejectedValue(new Error("deadlock detected"));

    await expect(engine.evaluate(MOVED, { issueId: 42 })).resolves.toBeUndefined();
    expect(issues.update).toHaveBeenCalled();
  });

  it("stops after a failure when the rule asks for it", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([
      rule({ id: 1, stopOnError: true }),
      rule({ id: 2, actionKey: "issue.unlock" }),
    ]);
    issues.update.mockRejectedValue(new Error("boom"));

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(issues.update).toHaveBeenCalledTimes(1); // the second rule never ran
  });

  it("keeps evaluating the other rules after a failure without stopOnError", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([
      rule({ id: 1, actionKey: "issue.set_priority", actionConfig: { priority: 1 } }),
      rule({ id: 2, actionKey: "issue.unlock" }),
    ]);
    issues.update.mockRejectedValueOnce(new Error("boom"));

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(issues.update).toHaveBeenCalledTimes(2);
    // unlock clears the per-card flag and grants the one-shot release
    expect(issues.update).toHaveBeenLastCalledWith(42, { isLocked: false, lockExempted: true });
  });

  it("ignores a nested evaluation fired from inside an action", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "issue.unlock" })]);
    issues.update.mockImplementation(async () => {
      // an action must not trigger another round of rules
      void engine.evaluate("comment.created", { issueId: 42 });
      return { affected: 1 };
    });

    await engine.evaluate(MOVED, { issueId: 42 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(rules.find).toHaveBeenCalledTimes(1);
  });

  it("swallows a repository error instead of breaking the request", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockRejectedValue(new Error("connection refused"));

    await expect(engine.evaluate(MOVED, { issueId: 42 })).resolves.toBeUndefined();
  });

  it("queries only active rules for the trigger that fired", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([]);

    await engine.evaluate("comment.created", { issueId: 1 });

    expect(rules.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { triggerKey: "comment.created", isActive: true },
      }),
    );
  });

  describe("analysis / resolution actions", () => {
    it("opens the analysis field as soon as the rule fires", async () => {
      const { engine, rules, issues } = makeEngine();
      rules.find.mockResolvedValue([rule({ actionKey: "issue.open_analysis" })]);

      await engine.evaluate(MOVED, { issueId: 42, toStatusId: 5 });

      expect(issues.update).toHaveBeenCalledWith(42, { isAnalysisOpen: true });
      expect(issues.update).not.toHaveBeenCalledWith(42, { isResolutionOpen: true });
    });

    it("opens the resolution field as soon as the rule fires", async () => {
      const { engine, rules, issues } = makeEngine();
      rules.find.mockResolvedValue([rule({ actionKey: "issue.open_resolution" })]);

      await engine.evaluate(MOVED, { issueId: 42, toStatusId: 5 });

      expect(issues.update).toHaveBeenCalledWith(42, { isResolutionOpen: true });
      expect(issues.update).not.toHaveBeenCalledWith(42, { isAnalysisOpen: true });
    });

    it("lets the trigger conditions gate the status (not the action config)", async () => {
      const { engine, rules, issues } = makeEngine();
      // the rule only fires when the card moves to status 5 — the action has
      // no status of its own to check
      rules.find.mockResolvedValue([
        rule({
          actionKey: "issue.open_analysis",
          conditions: [{ field: "to_status", operator: "=", value: "5", position: 0 }],
        }),
      ]);

      await engine.evaluate(MOVED, { issueId: 42, toStatusId: 9 });

      expect(issues.update).not.toHaveBeenCalled();

      await engine.evaluate(MOVED, { issueId: 42, toStatusId: 5 });

      expect(issues.update).toHaveBeenCalledWith(42, { isAnalysisOpen: true });
    });
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
      const { engine, comments } = setupCommentRule("   ");

      await engine.evaluate(MOVED, { issueId: 42 });

      expect(comments.save).not.toHaveBeenCalled();
    });
  });
});

describe("time actions (rule-driven timer)", () => {
  it("starts a timer owned by the assignee", async () => {
    const { engine, rules, workSessions, issues, users } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "work_session.start" })]);
    workSessions.findOne.mockResolvedValue(null);
    issues.findOne.mockResolvedValue({ id: 42, programmerId: 7 });
    users.findOne.mockResolvedValue({ id: 7, name: "Dev" });

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(workSessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: 42, programmerId: 7 }),
    );
    expect(workSessions.save).toHaveBeenCalledTimes(1);
  });

  it("never stacks a second session on a card that is already running", async () => {
    const { engine, rules, workSessions } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "work_session.start" })]);
    workSessions.findOne.mockResolvedValue({ id: 1, issueId: 42, endedAt: null });

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(workSessions.save).not.toHaveBeenCalled();
  });

  it("skips starting when no user can own the timer", async () => {
    const { engine, rules, workSessions, issues, users } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "work_session.start" })]);
    workSessions.findOne.mockResolvedValue(null);
    issues.findOne.mockResolvedValue({ id: 42, programmerId: null });
    users.findOne.mockResolvedValue(null); // nobody: no assignee, no actor, no author

    await engine.evaluate(MOVED, { issueId: 42, actorId: null });

    expect(workSessions.save).not.toHaveBeenCalled();
  });

  it("stops the open session and banks it into tracked_duration", async () => {
    const { engine, rules, workSessions, issues } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "work_session.stop" })]);
    workSessions.findOne.mockResolvedValue({
      id: 5,
      issueId: 42,
      startedAt: new Date(Date.now() - 60_000),
      endedAt: null,
      duration: 0,
    });
    workSessions.find.mockResolvedValue([{ duration: 45 }]);

    await engine.evaluate(MOVED, { issueId: 42 });

    const saved = workSessions.save.mock.calls[0][0] as { endedAt: Date; duration: number };
    expect(saved.endedAt).toBeInstanceOf(Date);
    expect(saved.duration).toBeGreaterThanOrEqual(59);
    expect(issues.update).toHaveBeenCalledWith(42, { trackedDuration: 45 });
  });

  it("skips a stop when nothing is running", async () => {
    const { engine, rules, workSessions } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "work_session.stop" })]);
    workSessions.findOne.mockResolvedValue(null);

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(workSessions.save).not.toHaveBeenCalled();
  });

  it("resets by wiping every session and zeroing the total", async () => {
    const { engine, rules, workSessions, issues } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "work_session.reset" })]);

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(workSessions.delete).toHaveBeenCalledWith({ issueId: 42 });
    expect(issues.update).toHaveBeenCalledWith(42, { trackedDuration: 0 });
  });

  it("opens the actual time entry and remembers it was ever granted", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "issue.allow_time_entry" })]);

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(issues.update).toHaveBeenCalledWith(42, {
      timeEntryUnlocked: true,
      timeEntryEverGranted: true,
    });
  });

  it("orders one event as reset → stop → everything else → start", async () => {
    const { engine, rules, issues, workSessions, users } = makeEngine();
    // deliberately in "wrong" creation order — the engine must fix the sequence
    rules.find.mockResolvedValue([
      rule({ id: 1, actionKey: "work_session.start" }),
      rule({ id: 2, actionKey: "work_session.reset" }),
      rule({ id: 3, actionKey: "work_session.stop" }),
      rule({ id: 4, actionKey: "issue.lock" }),
    ]);

    // Track the real side effects in order: reset wipes sessions, stop closes
    // the one open session, lock flips isLocked, start opens a fresh session.
    const order: string[] = [];
    let openLookups = 0;
    workSessions.delete.mockImplementation(async () => {
      order.push("reset");
      return { affected: 1 };
    });
    workSessions.findOne.mockImplementation(async () => {
      // stop finds the still-open session; start (later) finds none
      openLookups += 1;
      return openLookups === 1
        ? { id: 9, issueId: 42, startedAt: new Date(), endedAt: null, duration: 0 }
        : null;
    });
    workSessions.save.mockImplementation(async (value: { endedAt?: Date }) => {
      order.push(value.endedAt ? "stop" : "start");
      return value;
    });
    issues.update.mockImplementation(async (_id: number, patch: Record<string, unknown>) => {
      if (patch && "isLocked" in patch) order.push("lock");
      return { affected: 1 };
    });
    // the start action needs an assignee it can hand the timer to
    issues.findOne.mockResolvedValue({ id: 42, programmerId: 7 });
    users.findOne.mockResolvedValue({ id: 7, name: "Dev" });

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(order).toEqual(["reset", "stop", "lock", "start"]);
  });
});

describe("startTimerApplies — which statuses the timer rules cover", () => {
  it("marks only the statuses an active start-timer rule targets", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([
      rule({
        actionKey: "work_session.start",
        conditions: [{ field: "to_status", operator: "=", value: "3", position: 0 }],
      }),
    ]);

    const applies = await engine.startTimerApplies([3, 5, 7]);

    expect([...applies]).toEqual([3]);
  });

  it("treats a rule without a status condition as timing every status", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "work_session.start" })]);

    const applies = await engine.startTimerApplies([3, 5, null]);

    expect([...applies].sort((a, b) => a - b)).toEqual([3, 5]); // null never matches
  });

  it("understands list conditions and skips cards with no status", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([
      rule({
        actionKey: "work_session.start",
        conditions: [{ field: "to_status", operator: "in", value: "2, 4", position: 0 }],
      }),
    ]);

    const applies = await engine.startTimerApplies([2, 4, 6, null]);

    expect([...applies].sort((a, b) => a - b)).toEqual([2, 4]);
  });

  it("returns nothing when no start-timer rule is active", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([]);

    const applies = await engine.startTimerApplies([3]);

    expect(applies.size).toBe(0);
  });
});

describe("statusGates — fields a rule opens without a new event", () => {
  it("marks the statuses an active open-analysis rule targets", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([
      rule({
        actionKey: "issue.open_analysis",
        conditions: [{ field: "to_status", operator: "=", value: "3", position: 0 }],
      }),
    ]);

    const gates = await engine.statusGates([2, 3, 7]);

    expect([...gates.analysis]).toEqual([3]); // card already in status 3 counts
    expect(gates.timer.size).toBe(0);
    expect(gates.resolution.size).toBe(0);
  });

  it("keeps the analysis, resolution and timer buckets apart", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([
      rule({
        id: 1,
        actionKey: "issue.open_analysis",
        conditions: [{ field: "to_status", operator: "=", value: "3", position: 0 }],
      }),
      rule({
        id: 2,
        actionKey: "issue.open_resolution",
        conditions: [{ field: "to_status", operator: "=", value: "7", position: 0 }],
      }),
      rule({
        id: 3,
        actionKey: "work_session.start",
        conditions: [{ field: "to_status", operator: "=", value: "3", position: 0 }],
      }),
    ]);

    const gates = await engine.statusGates([3, 7]);

    expect([...gates.analysis]).toEqual([3]);
    expect([...gates.resolution]).toEqual([7]);
    expect([...gates.timer]).toEqual([3]);
  });

  it("covers every non-null status when the rule has no status condition", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "issue.open_analysis" })]);

    const gates = await engine.statusGates([2, 4, null]);

    expect([...gates.analysis].sort((a, b) => a - b)).toEqual([2, 4]); // null never matches
  });

  it("ignores inactive rules and actions that gate no field", async () => {
    const { engine, rules } = makeEngine();
    const rows = [
      rule({
        id: 1,
        actionKey: "issue.open_analysis",
        isActive: false,
        conditions: [{ field: "to_status", operator: "=", value: "3", position: 0 }],
      }),
      rule({
        id: 2,
        actionKey: "issue.set_priority",
        conditions: [{ field: "to_status", operator: "=", value: "3", position: 0 }],
      }),
    ];
    // the repo honours `where: { isActive: true }` — emulate that in the stub
    rules.find.mockImplementation((options: { where?: { isActive?: boolean } }) =>
      Promise.resolve(
        rows.filter((r) => options?.where?.isActive == null || r.isActive === options.where.isActive),
      ),
    );

    const gates = await engine.statusGates([3]);

    expect(gates.analysis.size).toBe(0);
    expect(gates.timer.size).toBe(0);
    expect(gates.resolution.size).toBe(0);
    expect(gates.locked.size).toBe(0);
  });
});

describe("RulesEngineService.isStepOnlyMoveActive — the drag guard switch", () => {
  it("is off with no rule, on while an active step-only rule exists", async () => {
    const { engine, rules } = makeEngine();

    expect(await engine.isStepOnlyMoveActive()).toBe(false);

    rules.findOne.mockResolvedValue({ id: 7, actionKey: "issue.move_step_only", isActive: true });
    expect(await engine.isStepOnlyMoveActive()).toBe(true);
    // a paused rule never reaches the lookup: the filter carries `isActive`
    expect(rules.findOne).toHaveBeenCalledWith({
      where: { actionKey: "issue.move_step_only", isActive: true },
    });
  });

  it("fails open when the lookup breaks, so a hiccup never wedges the board", async () => {
    const { engine, rules } = makeEngine();
    rules.findOne.mockRejectedValue(new Error("connection lost"));

    expect(await engine.isStepOnlyMoveActive()).toBe(false);
  });
});

describe("RulesEngineService.statusGates — the locked set (status locks)", () => {
  it("locks only the statuses a lock rule names", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([
      rule({
        actionKey: "issue.lock",
        conditions: [{ field: "to_status", operator: "=", value: "4", position: 0 }],
      }),
    ]);

    const gates = await engine.statusGates([2, 4, 6]);

    expect([...gates.locked]).toEqual([4]);
  });

  it("never freezes every column for a condition-less lock rule (per-card only)", async () => {
    // "created → lock this card" writes the per-card flag when it fires; it
    // must not read back as "all statuses are locked"
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "issue.lock" })]);

    const gates = await engine.statusGates([2, 4]);

    expect(gates.locked.size).toBe(0);
  });

  it("frees every status the moment the lock rule is paused", async () => {
    const { engine, rules } = makeEngine();
    rules.find.mockResolvedValue([]);

    const gates = await engine.statusGates([4]);

    expect(gates.locked.size).toBe(0);
  });
});

describe("RulesEngineService.runAction — lock and unlock", () => {
  it("writes no per-card flag for a status-named lock rule (the gate does it)", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([
      rule({
        actionKey: "issue.lock",
        conditions: [{ field: "to_status", operator: "=", value: "4", position: 0 }],
      }),
    ]);

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 4 });

    expect(issues.update).not.toHaveBeenCalled();
  });

  it("still writes the per-card flag for a condition-less lock rule", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "issue.lock" })]);

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 4 });

    expect(issues.update).toHaveBeenCalledWith(42, { isLocked: true });
  });

  it("unlock clears the flag and grants the one-shot release", async () => {
    const { engine, rules, issues } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "issue.unlock" })]);

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 4 });

    expect(issues.update).toHaveBeenCalledWith(42, { isLocked: false, lockExempted: true });
  });
});

/**
 * A rule that moves/assigns a card used to write silently — a card finished
 * by automation never reached the customer. These actions now go through the
 * SAME recipient policy as the manual endpoints (notifyStatusChange /
 * notifyAssignmentChange on NotificationsService).
 */
describe("RulesEngineService.runAction — rule-driven notifications", () => {
  it("move_status notifies through the shared policy with the target status", async () => {
    const { engine, rules, issues, statuses, notifications } = makeEngine();
    rules.find.mockResolvedValue([
      rule({ actionKey: "issue.move_status", actionConfig: { targetStatus: 4 } }),
    ]);
    statuses.findOne.mockResolvedValue({ id: 4, name: "เสร็จสิ้น" });
    issues.findOne.mockResolvedValue({
      id: 42,
      statusId: 3,
      title: "POS error",
      programmerId: 7,
      customerId: 9,
    });

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 3, actorId: 1 });

    expect(issues.update).toHaveBeenCalledWith(42, { statusId: 4 });
    expect(notifications.notifyStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        issue: expect.objectContaining({ id: 42 }),
        statusId: 4,
        actor: { actorId: 1 },
      }),
    );
  });

  it("move_status stays silent when the card already sits in the target column", async () => {
    const { engine, rules, issues, statuses, notifications } = makeEngine();
    rules.find.mockResolvedValue([
      rule({ actionKey: "issue.move_status", actionConfig: { targetStatus: 4 } }),
    ]);
    statuses.findOne.mockResolvedValue({ id: 4, name: "เสร็จสิ้น" });
    issues.findOne.mockResolvedValue({ id: 42, statusId: 4, title: "already done" });

    await engine.evaluate(MOVED, { issueId: 42, toStatusId: 3 });

    expect(issues.update).toHaveBeenCalledWith(42, { statusId: 4 });
    expect(notifications.notifyStatusChange).not.toHaveBeenCalled();
  });

  it("assign notifies the shared policy with the previous assignee", async () => {
    const { engine, rules, issues, users, notifications } = makeEngine();
    rules.find.mockResolvedValue([
      rule({ actionKey: "issue.assign", actionConfig: { position: 2 } }),
    ]);
    users.findOne.mockResolvedValue({ id: 7, name: "Ploy", positionId: 2 });
    issues.findOne.mockResolvedValue({
      id: 42,
      title: "POS error",
      programmerId: 3,
      customerId: 9,
    });

    await engine.evaluate(MOVED, { issueId: 42, actorId: 1 });

    expect(issues.update).toHaveBeenCalledWith(42, { programmerId: 7 });
    expect(notifications.notifyAssignmentChange).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: 7, previousAssigneeId: 3, actor: { actorId: 1 } }),
    );
  });

  it("unassign tells the previous assignee's removal through the shared policy", async () => {
    const { engine, rules, issues, notifications } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "issue.unassign" })]);
    issues.findOne.mockResolvedValue({ id: 42, title: "POS error", programmerId: 3 });

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(issues.update).toHaveBeenCalledWith(42, { programmerId: null });
    expect(notifications.notifyAssignmentChange).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: null, previousAssigneeId: 3 }),
    );
  });

  it("keeps working (and writing) when the issue row is gone — no notification", async () => {
    const { engine, rules, issues, notifications } = makeEngine();
    rules.find.mockResolvedValue([rule({ actionKey: "issue.unassign" })]);
    issues.findOne.mockResolvedValue(null);

    await engine.evaluate(MOVED, { issueId: 42 });

    expect(issues.update).toHaveBeenCalledWith(42, { programmerId: null });
    expect(notifications.notifyAssignmentChange).not.toHaveBeenCalled();
  });
});

describe("RulesEngineService.isUnlockRuleActive — the unlock button switch", () => {
  it("is off with no rule, on while an active unlock rule exists", async () => {
    const { engine, rules } = makeEngine();

    expect(await engine.isUnlockRuleActive()).toBe(false);

    rules.findOne.mockResolvedValue({ id: 8, actionKey: "issue.unlock", isActive: true });
    expect(await engine.isUnlockRuleActive()).toBe(true);
    expect(rules.findOne).toHaveBeenCalledWith({
      where: { actionKey: "issue.unlock", isActive: true },
    });
  });

  it("fails closed when the lookup breaks — no unlock offered without a rule", async () => {
    const { engine, rules } = makeEngine();
    rules.findOne.mockRejectedValue(new Error("connection lost"));

    expect(await engine.isUnlockRuleActive()).toBe(false);
  });
});
