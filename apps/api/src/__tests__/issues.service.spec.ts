import { ConflictException, BadRequestException, NotFoundException } from "@nestjs/common";
import { IssuesService } from "../modules/issues/issues.service";

/**
 * `IssuesService.create()` must also emit `issue.category_changed` when the
 * card is born with a category: rules like "when category is error → assign"
 * listen for that trigger, and a card created *with* the category never
 * changes one. Without this, the rules only ever fire for cards whose
 * category is edited afterwards.
 *
 * Stubbed repositories only — safe to run while `npm run dev` is up.
 */

interface Stub {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  createQueryBuilder: jest.Mock;
}

function repo(overrides: Partial<Stub> = {}): Stub {
  const builder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  };
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (value: unknown) => value),
    create: jest.fn((value: unknown) => value),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue(builder),
    ...overrides,
  };
}

type ServiceArgs = ConstructorParameters<typeof IssuesService>;

/** Builds the service with one stub per dependency, in injection order. */
function makeService() {
  const issues = repo({
    // mimic TypeORM: save() stamps the generated id onto the entity
    save: jest.fn(async (value: Record<string, unknown>) => {
      if (value.id == null) value.id = 42;
      return value;
    }),
  });
  const activityLogs = repo();
  const users = repo();
  const issueStatuses = repo({
    findOne: jest.fn().mockResolvedValue({ id: 1, name: "Todo" }),
  });
  const categories = repo();
  const labels = repo();
  const workSessions = { stop: jest.fn().mockResolvedValue(null) };
  const permissions = {};
  const rulesEngine = {
    evaluate: jest.fn().mockResolvedValue(undefined),
    // `toResponse()` asks which statuses each active rule covers — none in tests
    statusGates: jest.fn().mockResolvedValue({
      timer: new Set<number>(),
      analysis: new Set<number>(),
      resolution: new Set<number>(),
      locked: new Set<number>(),
    }),
    startTimerApplies: jest.fn().mockResolvedValue(new Set<number>()),
    // the step-only drag guard: off by default so every test opts in
    isStepOnlyMoveActive: jest.fn().mockResolvedValue(false),
    // the unlock-button switch: off by default so every test opts in
    isUnlockRuleActive: jest.fn().mockResolvedValue(false),
  };
  const notifications = {
    notifyIssueEvent: jest.fn().mockResolvedValue(undefined),
    // the shared recipient policies (milestone columns / assignment changes)
    notifyStatusChange: jest.fn().mockResolvedValue(undefined),
    notifyAssignmentChange: jest.fn().mockResolvedValue(undefined),
  };
  const service = new IssuesService(
    ...( [
      issues,
      activityLogs,
      users,
      issueStatuses,
      categories,
      labels,
      workSessions,
      permissions,
      rulesEngine,
      notifications,
    ] as unknown as ServiceArgs ),
  );
  return { service, issues, users, issueStatuses, rulesEngine, activityLogs, workSessions, notifications };
}

/** A fully-shaped issue row — `update()` re-reads it before responding. */
function issueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    title: "Fix login",
    description: "d",
    statusId: 9,
    priorityId: null,
    categoryId: null,
    labelId: null,
    labels: [],
    analysisCause: null,
    resolution: null,
    trackedDuration: 0,
    actualFixDuration: null,
    timeEntryUnlocked: false,
    timeEntryEverGranted: false,
    isLocked: false,
    lockExempted: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

const ACTOR = { actorId: 1, actorName: "aom", actorRole: "admin" };

/** The context each `evaluate` call received, keyed by trigger. */
function evaluateCalls(rulesEngine: { evaluate: jest.Mock }) {
  return rulesEngine.evaluate.mock.calls.map(([trigger, ctx]) => ({ trigger, ctx }));
}

/** A `statusGates` answer opening `analysis`/`resolution` at the given columns. */
function fieldGates(analysis: number[], resolution: number[] = []) {
  return {
    timer: new Set<number>(),
    analysis: new Set<number>(analysis),
    resolution: new Set<number>(resolution),
    locked: new Set<number>(),
  };
}

describe("IssuesService.create — automation triggers", () => {
  it("emits category_changed (oldValue=null) when the card is born with a category", async () => {
    const { service, issues, rulesEngine } = makeService();
    // the final reload returns the just-saved card
    issues.findOne.mockResolvedValue({ id: 42, title: "POS error", labels: [] });

    await service.create({ title: "POS error", description: "d", statusId: 1, categoryId: 3 });

    const calls = evaluateCalls(rulesEngine);
    expect(calls.map((c) => c.trigger)).toEqual(["issue.created", "issue.category_changed"]);

    const categoryCall = calls.find((c) => c.trigger === "issue.category_changed");
    expect(categoryCall?.ctx).toMatchObject({
      issueId: 42,
      newValue: 3,
      oldValue: null,
      toStatusId: 1,
    });
  });

  it("does not emit category_changed when the card has no category", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue({ id: 42, title: "no category", labels: [] });

    await service.create({ title: "no category", description: "d", statusId: 1 });

    expect(evaluateCalls(rulesEngine).map((c) => c.trigger)).toEqual(["issue.created"]);
  });
});

describe("IssuesService.create — admin fan-out (alsoAdmins)", () => {
  it("passes alsoAdmins: true so every admin sees new cards", async () => {
    const { service, issues, notifications } = makeService();
    issues.findOne.mockResolvedValue({ id: 42, title: "New bug", labels: [] });

    await service.create({ title: "New bug", description: "d", statusId: 1 });

    expect(notifications.notifyIssueEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "created", alsoAdmins: true }),
    );
  });
});

describe("IssuesService.move — shared recipient policy (notifyStatusChange)", () => {
  it("delegates the status change to the shared policy with the target status", async () => {
    const { service, issues, notifications } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1 }));

    await service.move(5, 2, ACTOR);

    expect(notifications.notifyStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ statusId: 2, actor: ACTOR }),
    );
    // the policy (not the service) decides who hears about which column
    expect(notifications.notifyIssueEvent).not.toHaveBeenCalled();
  });

  it("passes the issue along so the policy sees assignee / reporter / category", async () => {
    const { service, issues, notifications } = makeService();
    issues.findOne.mockResolvedValue(
      issueRow({ statusId: 1, programmerId: 7, customerId: 9, category: { name: "Backend" } }),
    );

    await service.move(5, 4, ACTOR);

    expect(notifications.notifyStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        issue: expect.objectContaining({
          id: 5,
          programmerId: 7,
          customerId: 9,
          category: { name: "Backend" },
        }),
        statusId: 4,
      }),
    );
  });
});

describe("IssuesService.assign — shared recipient policy (notifyAssignmentChange)", () => {
  it("routes an assign through the shared policy with old and new assignee", async () => {
    const { service, issues, users, notifications } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ programmerId: 3 }));
    users.findOne.mockResolvedValue({ id: 7, name: "Ploy" });

    await service.assign(5, 7, ACTOR);

    expect(notifications.notifyAssignmentChange).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: 7, previousAssigneeId: 3, actor: ACTOR }),
    );
  });

  it("clearing the assignee goes through the same policy (unassign path)", async () => {
    const { service, issues, notifications } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ programmerId: 3 }));

    await service.assign(5, null, ACTOR);

    expect(notifications.notifyAssignmentChange).toHaveBeenCalledWith(
      expect.objectContaining({ assigneeId: null, previousAssigneeId: 3 }),
    );
  });
});

describe("IssuesService.move — time entry gate", () => {
  it("re-locks the actual time field on every move (rules may grant it again)", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 9, timeEntryUnlocked: true }));

    await service.move(5, 1, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, {
      statusId: 1,
      timeEntryUnlocked: false,
      lockExempted: false,
    });
  });
});

describe("IssuesService.move — step-only guard (issue.move_step_only rule)", () => {
  /** Turns the guard on with the board's real order: column 1 → 2 → 3. */
  function guardOn() {
    const ctx = makeService();
    ctx.rulesEngine.isStepOnlyMoveActive.mockResolvedValue(true);
    ctx.issueStatuses.find.mockResolvedValue([
      { id: 1, position: 1 },
      { id: 2, position: 2 },
      { id: 3, position: 3 },
    ]);
    return ctx;
  }

  it("rejects a jump over a column while the rule is active, before writing", async () => {
    const { service, issues } = guardOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1 }));

    await expect(service.move(5, 3, ACTOR)).rejects.toThrow(BadRequestException);
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("allows one step forward (1 → 2)", async () => {
    const { service, issues } = guardOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1 }));

    await service.move(5, 2, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 2, timeEntryUnlocked: false, lockExempted: false });
  });

  it("allows one step backward (3 → 2)", async () => {
    const { service, issues } = guardOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 3 }));

    await service.move(5, 2, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 2, timeEntryUnlocked: false, lockExempted: false });
  });

  it("allows every jump again while the rule is paused", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1 }));

    await service.move(5, 3, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 3, timeEntryUnlocked: false, lockExempted: false });
  });

  it("lets a card with no status land in any column", async () => {
    const { service, issues } = guardOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: null }));

    await service.move(5, 3, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 3, timeEntryUnlocked: false, lockExempted: false });
  });

  it("fails open when the status order cannot be read", async () => {
    const { service, issues, issueStatuses } = guardOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1 }));
    // an empty/unreadable list means adjacency cannot be measured → allowed
    issueStatuses.find.mockResolvedValue([]);

    await expect(service.move(5, 3, ACTOR)).resolves.toBeDefined();
    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 3, timeEntryUnlocked: false, lockExempted: false });
  });
});

describe("IssuesService.move — status lock (issue.lock rule)", () => {
  it("rejects leaving a locked status before writing (409, not 400)", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 4 }));
    rulesEngine.statusGates.mockResolvedValue({
      timer: new Set<number>(),
      analysis: new Set<number>(),
      resolution: new Set<number>(),
      locked: new Set<number>([4]),
    });

    await expect(service.move(5, 3, ACTOR)).rejects.toThrow(ConflictException);
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("lets a one-shot unlock release the card and consumes the flag", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 4, lockExempted: true }));
    rulesEngine.statusGates.mockResolvedValue({
      timer: new Set<number>(),
      analysis: new Set<number>(),
      resolution: new Set<number>(),
      locked: new Set<number>([4]),
    });

    await service.move(5, 3, ACTOR);

    // the move itself clears the exemption — re-entering a locked status later locks again
    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 3, timeEntryUnlocked: false, lockExempted: false });
  });

  it("blocks a card the engine locked per-card, even outside a locked status", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 2, isLocked: true }));

    await expect(service.move(5, 3, ACTOR)).rejects.toThrow(ConflictException);
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("fails open when the lock lookup breaks, so a hiccup never traps a card", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 4 }));
    // only the guard's own lookup fails — the response build still answers
    rulesEngine.statusGates.mockRejectedValueOnce(new Error("connection lost"));

    await expect(service.move(5, 3, ACTOR)).resolves.toBeDefined();
    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 3, timeEntryUnlocked: false, lockExempted: false });
  });
});

describe("IssuesService.unlock — the one-shot release", () => {
  it("clears the per-card flag, grants the exemption and logs the release", async () => {
    const { service, issues, activityLogs } = makeService();
    // unlock re-reads the card for its response — second read sees the write
    issues.findOne
      .mockResolvedValueOnce(
        issueRow({ statusId: 4, isLocked: true, status: { id: 4, name: "Done" } }),
      )
      .mockResolvedValueOnce(
        issueRow({ statusId: 4, isLocked: false, lockExempted: true, status: { id: 4, name: "Done" } }),
      );

    const result = await service.unlock(5, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { isLocked: false, lockExempted: true });
    expect(activityLogs.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: "card.unlocked", entityId: 5 }),
    );
    expect(result.isLocked).toBe(false);
  });

  it("404s for a card that no longer exists", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(null);

    await expect(service.unlock(999, ACTOR)).rejects.toThrow(NotFoundException);
  });
});

describe("IssuesService.findOne — the lock the board renders", () => {
  it("reports a card as locked while an active lock rule covers its status", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 4 }));
    rulesEngine.statusGates.mockResolvedValue({
      timer: new Set<number>(),
      analysis: new Set<number>(),
      resolution: new Set<number>(),
      locked: new Set<number>([4]),
    });

    const result = await service.findOne(5);

    expect(result.isLocked).toBe(true);
  });

  it("shows a one-shot-unlocked card as free until its next move", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 4, lockExempted: true }));
    rulesEngine.statusGates.mockResolvedValue({
      timer: new Set<number>(),
      analysis: new Set<number>(),
      resolution: new Set<number>(),
      locked: new Set<number>([4]),
    });

    const result = await service.findOne(5);

    expect(result.isLocked).toBe(false);
  });
});

describe("IssuesService.movePolicy — what the card menu keys off", () => {
  it("reports both the step-only guard and the unlock availability", async () => {
    const { service, rulesEngine } = makeService();
    rulesEngine.isStepOnlyMoveActive.mockResolvedValue(true);
    rulesEngine.isUnlockRuleActive.mockResolvedValue(true);

    await expect(service.movePolicy()).resolves.toEqual({ stepOnly: true, unlockAvailable: true });
  });
});

describe("IssuesService.remove — running timer", () => {
  it("closes a still-running session before the card goes to the trash", async () => {
    const { service, issues, workSessions } = makeService();
    issues.findOne.mockResolvedValue(
      issueRow({ statusId: 1, status: { name: "Backlog" }, title: "Fix login" }),
    );

    await service.remove(5, ACTOR);

    expect(workSessions.stop).toHaveBeenCalledWith(5);
    expect(issues.save).toHaveBeenCalled();
  });
});

describe("IssuesService.remove — customer delete rule (first column, not the name)", () => {
  const CUSTOMER = { actorId: 2, actorName: "arthitaya", actorRole: "customer" };

  it("lets a customer clear a card out of the first column — renamed to Thai or not", async () => {
    const { service, issues, issueStatuses, workSessions } = makeService();
    // column order is the rule; the name shown here is already Thai
    issueStatuses.find.mockResolvedValue([{ id: 1 }]);
    issues.findOne.mockResolvedValue(
      issueRow({ statusId: 1, status: { name: "รอรับเรื่อง" } }),
    );

    await service.remove(5, CUSTOMER);

    expect(workSessions.stop).toHaveBeenCalledWith(5);
    expect(issues.save).toHaveBeenCalled();
  });

  it("refuses a card outside the first column even when its name still reads Backlog", async () => {
    const { service, issues, issueStatuses, workSessions } = makeService();
    issueStatuses.find.mockResolvedValue([{ id: 1 }]);
    issues.findOne.mockResolvedValue(
      issueRow({ statusId: 9, status: { name: "Backlog" } }),
    );

    await expect(service.remove(5, CUSTOMER)).rejects.toThrow("first column");

    expect(workSessions.stop).not.toHaveBeenCalled();
    expect(issues.save).not.toHaveBeenCalled();
  });
});

describe("IssuesService.findOne — analysis/resolution visibility & editability", () => {
  // Board columns 7 → 8 → 9 → 10; the rules open analysis at column 8 and
  // resolution at column 10. Nothing in the service knows either id: both
  // answers come from the rules plus this board order.
  const FIELD_BOARD = [
    { id: 7, position: 1 },
    { id: 8, position: 2 },
    { id: 9, position: 3 },
    { id: 10, position: 4 },
  ];

  it("lets the opening column see AND edit the field", async () => {
    const { service, issues, issueStatuses, rulesEngine } = makeService();
    issueStatuses.find.mockResolvedValue(FIELD_BOARD);
    issues.findOne.mockResolvedValue(issueRow({ statusId: 8 }));
    rulesEngine.statusGates.mockResolvedValue(fieldGates([8], [10]));

    const result = await service.findOne(5);

    expect(rulesEngine.statusGates).toHaveBeenCalledWith([8]);
    expect(result.isAnalysisOpen).toBe(true);
    expect(result.canEditAnalysis).toBe(true);
    expect(result.isResolutionOpen).toBe(false);
    expect(result.canEditResolution).toBe(false);
    expect(result.timerRuleApplies).toBe(false);
  });

  it("shows the field read-only in a later column (visible is not editable)", async () => {
    const { service, issues, issueStatuses, rulesEngine } = makeService();
    issueStatuses.find.mockResolvedValue(FIELD_BOARD);
    issues.findOne.mockResolvedValue(issueRow({ statusId: 9 }));
    rulesEngine.statusGates.mockResolvedValue(fieldGates([8]));

    const result = await service.findOne(5);

    expect(result.isAnalysisOpen).toBe(true);
    expect(result.canEditAnalysis).toBe(false);
  });

  it("hides the field in an earlier column no rule opens", async () => {
    const { service, issues, issueStatuses, rulesEngine } = makeService();
    issueStatuses.find.mockResolvedValue(FIELD_BOARD);
    issues.findOne.mockResolvedValue(issueRow({ statusId: 7 }));
    rulesEngine.statusGates.mockResolvedValue(fieldGates([8]));

    const result = await service.findOne(5);

    expect(result.isAnalysisOpen).toBe(false);
    expect(result.canEditAnalysis).toBe(false);
  });

  it("keeps a recorded value visible upstream of the rule, still read-only", async () => {
    const { service, issues, issueStatuses, rulesEngine } = makeService();
    issueStatuses.find.mockResolvedValue(FIELD_BOARD);
    issues.findOne.mockResolvedValue(
      issueRow({ statusId: 7, analysisCause: "root cause recorded earlier" }),
    );
    rulesEngine.statusGates.mockResolvedValue(fieldGates([8]));

    const result = await service.findOne(5);

    expect(result.isAnalysisOpen).toBe(true);
    expect(result.canEditAnalysis).toBe(false);
  });

  it("ignores the legacy is_*_open flags — a flag alone shows nothing", async () => {
    const { service, issues, issueStatuses } = makeService();
    issueStatuses.find.mockResolvedValue(FIELD_BOARD);
    issues.findOne.mockResolvedValue(
      issueRow({ statusId: 9, isAnalysisOpen: true, isResolutionOpen: true }),
    );

    const result = await service.findOne(5);

    expect(result.isAnalysisOpen).toBe(false);
    expect(result.isResolutionOpen).toBe(false);
    expect(result.canEditAnalysis).toBe(false);
    expect(result.canEditResolution).toBe(false);
  });

  it("applies the same pair at the resolution column (analysis stays read-only)", async () => {
    const { service, issues, issueStatuses, rulesEngine } = makeService();
    issueStatuses.find.mockResolvedValue(FIELD_BOARD);
    issues.findOne.mockResolvedValue(issueRow({ statusId: 10 }));
    rulesEngine.statusGates.mockResolvedValue(fieldGates([8], [10]));

    const result = await service.findOne(5);

    expect(result.isResolutionOpen).toBe(true);
    expect(result.canEditResolution).toBe(true);
    expect(result.isAnalysisOpen).toBe(true);
    expect(result.canEditAnalysis).toBe(false);
  });
});

describe("IssuesService.update — fill-ins change only where the rule opens them", () => {
  it("accepts a new analysis value while an active rule opens the field here", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 9 }));
    rulesEngine.statusGates.mockResolvedValue(fieldGates([9]));

    await service.update(5, { analysisCause: "root cause" }, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { analysisCause: "root cause" });
  });

  it("400s when the card sits outside every status the rule opens", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 9 }));
    rulesEngine.statusGates.mockResolvedValue(fieldGates([8]));

    await expect(
      service.update(5, { analysisCause: "root cause" }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("applies the same guard to the resolution field", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 9 }));
    rulesEngine.statusGates.mockResolvedValue(fieldGates([9], [10]));

    await expect(service.update(5, { resolution: "fixed in code" }, ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("never 400s when the value did not actually change", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 9, analysisCause: "same text" }));

    await service.update(5, { analysisCause: "same text" }, ACTOR);

    expect(issues.update).not.toHaveBeenCalled();
  });

  it("fails open when the rule list cannot be read (a hiccup must not wedge the field)", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 9 }));
    rulesEngine.statusGates
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValue(fieldGates([]));

    await service.update(5, { analysisCause: "root cause" }, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { analysisCause: "root cause" });
  });

  it("refuses either field while the card has no status at all", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: null }));
    rulesEngine.statusGates.mockResolvedValue(fieldGates([9]));

    await expect(service.update(5, { analysisCause: "x" }, ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(issues.update).not.toHaveBeenCalled();
  });
});
