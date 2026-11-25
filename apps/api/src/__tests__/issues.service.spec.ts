import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
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
    // findAll's query chain (count → id page → data page); the id page ends
    // in getRawMany, which tests stub to [] so the data query never runs
    clone: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    loadRelationCountAndMap: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
    getRawMany: jest.fn().mockResolvedValue([]),
    getMany: jest.fn().mockResolvedValue([]),
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
      taskType: new Set<number>(),
    }),
    startTimerApplies: jest.fn().mockResolvedValue(new Set<number>()),
    // the step-only drag guard: off by default so every test opts in
    isStepOnlyMoveActive: jest.fn().mockResolvedValue(false),
    // the "task type before moving" gate: no gated status by default
    taskTypeGateStatuses: jest.fn().mockResolvedValue(new Set<number>()),
    // the unlock-button switch: off by default so every test opts in
    isUnlockRuleActive: jest.fn().mockResolvedValue(false),
    // the stale policy (red border + 09:00 bell): no active rule by default
    staleRules: jest.fn().mockResolvedValue([]),
    // the hide-from-board policy: nothing hides by default
    hideStaleRules: jest.fn().mockResolvedValue([]),
  };
  const notifications = {
    notifyIssueEvent: jest.fn().mockResolvedValue(undefined),
    // the shared recipient policies (milestone columns / assignment changes)
    notifyStatusChange: jest.fn().mockResolvedValue(undefined),
    notifyAssignmentChange: jest.fn().mockResolvedValue(undefined),
  };
  // MA quota check after a time entry — off unless a test opts in
  const maUsage = { checkAndNotify: jest.fn().mockResolvedValue(undefined) };
  // "MA หมดอายุ → รับงาน MA/Requirement ไม่ได้" — off (ยังไม่หมดอายุ) by default
  const apps = { isPairExpired: jest.fn().mockResolvedValue(false) };
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
      maUsage,
      apps,
    ] as unknown as ServiceArgs ),
  );
  return {
    service,
    issues,
    users,
    issueStatuses,
    rulesEngine,
    activityLogs,
    workSessions,
    notifications,
    maUsage,
    apps,
  };
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
    taskType: new Set<number>(),
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
      statusChangedAt: expect.any(Date),
      staleNotifiedAt: null,
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

    expect(issues.update).toHaveBeenCalledWith(5, {
      statusId: 2,
      timeEntryUnlocked: false,
      lockExempted: false,
      statusChangedAt: expect.any(Date),
      staleNotifiedAt: null,
    });
  });

  it("allows one step backward (3 → 2)", async () => {
    const { service, issues } = guardOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 3 }));

    await service.move(5, 2, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, {
      statusId: 2,
      timeEntryUnlocked: false,
      lockExempted: false,
      statusChangedAt: expect.any(Date),
      staleNotifiedAt: null,
    });
  });

  it("allows every jump again while the rule is paused", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1 }));

    await service.move(5, 3, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, {
      statusId: 3,
      timeEntryUnlocked: false,
      lockExempted: false,
      statusChangedAt: expect.any(Date),
      staleNotifiedAt: null,
    });
  });

  it("lets a card with no status land in any column", async () => {
    const { service, issues } = guardOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: null }));

    await service.move(5, 3, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, {
      statusId: 3,
      timeEntryUnlocked: false,
      lockExempted: false,
      statusChangedAt: expect.any(Date),
      staleNotifiedAt: null,
    });
  });

  it("fails open when the status order cannot be read", async () => {
    const { service, issues, issueStatuses } = guardOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1 }));
    // an empty/unreadable list means adjacency cannot be measured → allowed
    issueStatuses.find.mockResolvedValue([]);

    await expect(service.move(5, 3, ACTOR)).resolves.toBeDefined();
    expect(issues.update).toHaveBeenCalledWith(5, {
      statusId: 3,
      timeEntryUnlocked: false,
      lockExempted: false,
      statusChangedAt: expect.any(Date),
      staleNotifiedAt: null,
    });
  });
});

describe("IssuesService.move — task-type gate (issue.require_task_type rule)", () => {
  /** Turns the gate on: status 1 (รอรับเรื่อง) demands a ประเภทงาน. */
  function gateOn() {
    const ctx = makeService();
    ctx.rulesEngine.taskTypeGateStatuses.mockResolvedValue(new Set([1]));
    return ctx;
  }

  it("refuses leaving the gated status while the card has no task type, before writing", async () => {
    const { service, issues } = gateOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1, taskType: null }));

    await expect(service.move(5, 2, ACTOR)).rejects.toThrow(UnprocessableEntityException);
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("allows the same drag once a task type is set", async () => {
    const { service, issues } = gateOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1, taskType: "bug" }));

    await service.move(5, 2, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, {
      statusId: 2,
      timeEntryUnlocked: false,
      lockExempted: false,
      statusChangedAt: expect.any(Date),
      staleNotifiedAt: null,
    });
  });

  it("never blocks a card sitting outside the gated statuses", async () => {
    const { service, issues } = gateOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 2, taskType: null }));

    await service.move(5, 3, ACTOR);

    expect(issues.update).toHaveBeenCalled();
  });

  it("fails open while no rule is active (the default empty set)", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1, taskType: null }));

    await service.move(5, 2, ACTOR);

    expect(issues.update).toHaveBeenCalled();
  });

  it("lets a card with no status land anywhere", async () => {
    const { service, issues } = gateOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: null, taskType: null }));

    await service.move(5, 1, ACTOR);

    expect(issues.update).toHaveBeenCalled();
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
      taskType: new Set<number>(),
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
      taskType: new Set<number>(),
    });

    await service.move(5, 3, ACTOR);

    // the move itself clears the exemption — re-entering a locked status later locks again
    expect(issues.update).toHaveBeenCalledWith(5, {
      statusId: 3,
      timeEntryUnlocked: false,
      lockExempted: false,
      statusChangedAt: expect.any(Date),
      staleNotifiedAt: null,
    });
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
    expect(issues.update).toHaveBeenCalledWith(5, {
      statusId: 3,
      timeEntryUnlocked: false,
      lockExempted: false,
      statusChangedAt: expect.any(Date),
      staleNotifiedAt: null,
    });
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

  it("refuses a card frozen by a status lock — the column is sealed", async () => {
    const { service, issues, rulesEngine, activityLogs } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 4, isLocked: false }));
    rulesEngine.statusGates.mockResolvedValue({
      timer: new Set<number>(),
      analysis: new Set<number>(),
      resolution: new Set<number>(),
      locked: new Set<number>([4]),
      taskType: new Set<number>(),
    });

    await expect(service.unlock(5, ACTOR)).rejects.toThrow(ForbiddenException);
    expect(issues.update).not.toHaveBeenCalled();
    expect(activityLogs.save).not.toHaveBeenCalled();
  });

  it("fails closed when the status-lock lookup breaks — no release is handed out", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 4 }));
    rulesEngine.statusGates.mockRejectedValueOnce(new Error("connection lost"));

    await expect(service.unlock(5, ACTOR)).rejects.toThrow(ForbiddenException);
    expect(issues.update).not.toHaveBeenCalled();
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
      taskType: new Set<number>(),
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
      taskType: new Set<number>(),
    });

    const result = await service.findOne(5);

    expect(result.isLocked).toBe(false);
  });
});

describe("IssuesService.movePolicy — what the card menu keys off", () => {
  it("reports the step-only guard, the unlock availability and the stale rules", async () => {
    const { service, rulesEngine } = makeService();
    rulesEngine.isStepOnlyMoveActive.mockResolvedValue(true);
    rulesEngine.isUnlockRuleActive.mockResolvedValue(true);
    rulesEngine.taskTypeGateStatuses.mockResolvedValue(new Set([1, 2]));

    await expect(service.movePolicy()).resolves.toEqual({
      stepOnly: true,
      unlockAvailable: true,
      requireTaskTypeStatusIds: [1, 2],
      staleRules: [],
      hideStaleRules: [],
    });
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

describe("IssuesService.update — task type (MA deduction gate)", () => {
  it("writes a whitelisted type and logs the change", async () => {
    const { service, issues, activityLogs } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ taskType: null }));

    await service.update(5, { taskType: "bug" }, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { taskType: "bug" });
    expect(activityLogs.create).toHaveBeenCalled();
  });

  it("400s on a value outside the 3 known types (before any write)", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ taskType: null }));

    await expect(
      service.update(5, { taskType: "chore" as never }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("null clears the type back to ยังไม่ระบุ (no deduction until set)", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ taskType: "ma" }));

    await service.update(5, { taskType: null }, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { taskType: null });
  });

  it("skips the write when the type did not actually change", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ taskType: "requirement" }));

    await service.update(5, { taskType: "requirement" }, ACTOR);

    expect(issues.update).not.toHaveBeenCalled();
  });
});

describe("IssuesService.update — the task-type field lock (issue.require_task_type)", () => {
  /** statusGates with the gate naming status 1 (รอรับเรื่อง). */
  function gateGates() {
    return {
      timer: new Set<number>(),
      analysis: new Set<number>(),
      resolution: new Set<number>(),
      locked: new Set<number>(),
      taskType: new Set<number>([1]),
    };
  }

  it("refuses to change a set type while the card sits outside the gated status", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 2, taskType: "bug" }));
    rulesEngine.statusGates.mockResolvedValue(gateGates());

    await expect(service.update(5, { taskType: "ma" }, ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("allows the change inside the status the rule names", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1, taskType: "bug" }));
    rulesEngine.statusGates.mockResolvedValue(gateGates());

    await service.update(5, { taskType: "ma" }, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { taskType: "ma" });
  });

  it("refuses to FILL an empty type outside the gated status too — no escape hatch", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 9, taskType: null }));
    rulesEngine.statusGates.mockResolvedValue(gateGates());

    await expect(service.update(5, { taskType: "bug" }, ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("refuses a card with NO status as well (the gate covers every other case)", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: null, taskType: null }));
    rulesEngine.statusGates.mockResolvedValue(gateGates());

    await expect(service.update(5, { taskType: "bug" }, ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("still lets a write through when the rule lookup breaks (fail open)", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 9, taskType: null }));
    rulesEngine.statusGates.mockRejectedValueOnce(new Error("connection lost"));

    await service.update(5, { taskType: "bug" }, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { taskType: "bug" });
  });

  it("locks nothing while no rule is active (fail open)", async () => {
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 2, taskType: "bug" }));
    rulesEngine.statusGates.mockResolvedValue({
      timer: new Set<number>(),
      analysis: new Set<number>(),
      resolution: new Set<number>(),
      locked: new Set<number>(),
      taskType: new Set<number>(),
    });

    await service.update(5, { taskType: "ma" }, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { taskType: "ma" });
  });

  it("payload: canEditTaskType mirrors the same lock — no empty/null escape", async () => {
    const { service, issues, rulesEngine } = makeService();

    // set + outside the gate → locked
    issues.findOne.mockResolvedValue(issueRow({ statusId: 2, taskType: "bug" }));
    rulesEngine.statusGates.mockResolvedValue(gateGates());
    expect((await service.findOne(5)).canEditTaskType).toBe(false);

    // empty + outside → STILL locked (the card goes back to the gate to be typed)
    issues.findOne.mockResolvedValue(issueRow({ statusId: 2, taskType: null }));
    expect((await service.findOne(5)).canEditTaskType).toBe(false);

    // no status at all → locked while a rule stands
    issues.findOne.mockResolvedValue(issueRow({ statusId: null, taskType: null }));
    expect((await service.findOne(5)).canEditTaskType).toBe(false);

    // set + inside the rule's status → editable
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1, taskType: "bug" }));
    expect((await service.findOne(5)).canEditTaskType).toBe(true);

    // no rule active → editable everywhere (fail open)
    rulesEngine.statusGates.mockResolvedValue({
      timer: new Set<number>(),
      analysis: new Set<number>(),
      resolution: new Set<number>(),
      locked: new Set<number>(),
      taskType: new Set<number>(),
    });
    issues.findOne.mockResolvedValue(issueRow({ statusId: 2, taskType: "bug" }));
    expect((await service.findOne(5)).canEditTaskType).toBe(true);
  });
});

describe("IssuesService.update — MA หมดอายุ → รับงาน MA/Requirement ไม่ได้ (ตีกลับ)", () => {
  /** งานที่มีผู้แจ้ง + บริษัท (คู่กับแอป 4) — รูปแบบเดียวกับ `update()` อ่านจริง */
  const typedRow = (overrides: Record<string, unknown> = {}) =>
    issueRow({
      appId: 4,
      customerId: 2,
      customer: { companyId: 5 },
      taskType: null,
      ...overrides,
    });

  it("400s when the pair's contract is expired and the team picks 'ma'", async () => {
    const { service, issues, apps } = makeService();
    issues.findOne.mockResolvedValue(typedRow());
    apps.isPairExpired.mockResolvedValue(true);

    await expect(service.update(5, { taskType: "ma" }, ACTOR)).rejects.toThrow("MA หมดอายุ");
    expect(apps.isPairExpired).toHaveBeenCalledWith(4, 5);
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("400s for 'requirement' as well — both types are rejected", async () => {
    const { service, issues, apps } = makeService();
    issues.findOne.mockResolvedValue(typedRow());
    apps.isPairExpired.mockResolvedValue(true);

    await expect(service.update(5, { taskType: "requirement" }, ACTOR)).rejects.toThrow(
      "MA หมดอายุ",
    );
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("lets 'bug' through while expired — never even asks the contract (บั๊กทำต่อได้)", async () => {
    const { service, issues, apps } = makeService();
    issues.findOne.mockResolvedValue(typedRow());
    apps.isPairExpired.mockResolvedValue(true);

    await service.update(5, { taskType: "bug" }, ACTOR);

    expect(apps.isPairExpired).not.toHaveBeenCalled();
    expect(issues.update).toHaveBeenCalledWith(5, { taskType: "bug" });
  });

  it("clearing the type (null) passes even while the contract is expired", async () => {
    const { service, issues, apps } = makeService();
    issues.findOne.mockResolvedValue(typedRow({ taskType: "ma" }));
    apps.isPairExpired.mockResolvedValue(true);

    await service.update(5, { taskType: null }, ACTOR);

    expect(apps.isPairExpired).not.toHaveBeenCalled();
    expect(issues.update).toHaveBeenCalledWith(5, { taskType: null });
  });

  it("re-saving the same type skips the check entirely (no write, no query)", async () => {
    const { service, issues, apps } = makeService();
    issues.findOne.mockResolvedValue(typedRow({ taskType: "requirement" }));
    apps.isPairExpired.mockResolvedValue(true);

    await service.update(5, { taskType: "requirement" }, ACTOR);

    expect(apps.isPairExpired).not.toHaveBeenCalled();
    expect(issues.update).not.toHaveBeenCalled();
  });

  it("writes 'ma' when the contract is still valid", async () => {
    const { service, issues, apps } = makeService();
    issues.findOne.mockResolvedValue(typedRow());
    // default stub: isPairExpired → false (ยังไม่หมดอายุ)

    await service.update(5, { taskType: "ma" }, ACTOR);

    expect(apps.isPairExpired).toHaveBeenCalledWith(4, 5);
    expect(issues.update).toHaveBeenCalledWith(5, { taskType: "ma" });
  });

  it("fails open with NO reporter (staff-created card) — the contract is never asked", async () => {
    const { service, issues, apps } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ taskType: null }));
    apps.isPairExpired.mockResolvedValue(true); // ถึงจะคืน true ก็ไม่มีทางถูกเรียก

    await service.update(5, { taskType: "ma" }, ACTOR);

    expect(apps.isPairExpired).not.toHaveBeenCalled();
    expect(issues.update).toHaveBeenCalledWith(5, { taskType: "ma" });
  });

  it("fails open when the reporter has no company", async () => {
    const { service, issues, apps } = makeService();
    issues.findOne.mockResolvedValue(typedRow({ customer: { companyId: null } }));
    apps.isPairExpired.mockResolvedValue(true);

    await service.update(5, { taskType: "ma" }, ACTOR);

    expect(apps.isPairExpired).not.toHaveBeenCalled();
    expect(issues.update).toHaveBeenCalledWith(5, { taskType: "ma" });
  });

  it("fails open when the contract lookup breaks (log, never wedge classification)", async () => {
    const { service, issues, apps } = makeService();
    issues.findOne.mockResolvedValue(typedRow());
    apps.isPairExpired.mockRejectedValue(new Error("connection lost"));

    await service.update(5, { taskType: "ma" }, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { taskType: "ma" });
  });

  it("the status field gate answers FIRST — its 400 wins and the contract is never asked", async () => {
    const { service, issues, rulesEngine, apps } = makeService();
    issues.findOne.mockResolvedValue(typedRow({ statusId: 2, taskType: "bug" }));
    rulesEngine.statusGates.mockResolvedValue({
      timer: new Set<number>(),
      analysis: new Set<number>(),
      resolution: new Set<number>(),
      locked: new Set<number>(),
      taskType: new Set<number>([1]),
    });
    apps.isPairExpired.mockResolvedValue(true);

    await expect(service.update(5, { taskType: "ma" }, ACTOR)).rejects.toThrow(
      "The task type field is not editable",
    );
    expect(apps.isPairExpired).not.toHaveBeenCalled();
    expect(issues.update).not.toHaveBeenCalled();
  });
});

describe("IssuesService.findOne — maExpired ธงให้ป๊อปอัพบนบอร์ด", () => {
  const pairRow = (overrides: Record<string, unknown> = {}) =>
    issueRow({ appId: 4, customerId: 2, customer: { companyId: 5 }, ...overrides });

  it("sends maExpired=true when the reporter's pair is expired", async () => {
    const { service, issues, apps } = makeService();
    issues.findOne.mockResolvedValue(pairRow());
    apps.isPairExpired.mockResolvedValue(true);

    const res = await service.findOne(5);

    expect(res.maExpired).toBe(true);
    expect(apps.isPairExpired).toHaveBeenCalledWith(4, 5);
  });

  it("sends maExpired=false while the contract is still valid", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(pairRow());

    const res = await service.findOne(5);

    expect(res.maExpired).toBe(false);
  });

  it("skips the lookup (false) with no app or no reporter company", async () => {
    const { service, issues, apps } = makeService();
    apps.isPairExpired.mockResolvedValue(true);
    issues.findOne.mockResolvedValue(issueRow({ customer: { companyId: 5 } }));
    expect((await service.findOne(5)).maExpired).toBe(false);

    issues.findOne.mockResolvedValue(pairRow({ customer: { companyId: null } }));
    expect((await service.findOne(5)).maExpired).toBe(false);
    expect(apps.isPairExpired).not.toHaveBeenCalled();
  });

  it("fails open (false) when the contract lookup breaks", async () => {
    const { service, issues, apps } = makeService();
    issues.findOne.mockResolvedValue(pairRow());
    apps.isPairExpired.mockRejectedValue(new Error("connection lost"));

    await expect(service.findOne(5)).resolves.toMatchObject({ maExpired: false });
  });
});

describe("IssuesService.move — MA bell when the card enters เสร็จสิ้น", () => {
  /** source = 3 (กำลังดำเนินการ), target ตามที่เรียก */
  const setup = () => {
    const ctx = makeService();
    ctx.issues.findOne.mockResolvedValue(
      issueRow({ statusId: 3, appId: 7, customerId: 2, customer: { companyId: 5 } }),
    );
    ctx.issueStatuses.findOne.mockImplementation(({ where }: { where: { id: number } }) =>
      Promise.resolve(
        where.id === 4 ? { id: 4, name: "เสร็จสิ้น" } : { id: 3, name: "กำลังดำเนินการ" },
      ),
    );
    return ctx;
  };

  it("checks MA depletion after the write — hours entered back in review now count", async () => {
    const { service, maUsage } = setup();

    await service.move(5, 4, ACTOR);

    expect(maUsage.checkAndNotify).toHaveBeenCalledWith(
      expect.objectContaining({ id: 5, appId: 7, customerId: 2 }),
    );
  });

  it("does not check on a move to any other status", async () => {
    const { service, maUsage } = setup();

    await service.move(5, 7, ACTOR);

    expect(maUsage.checkAndNotify).not.toHaveBeenCalled();
  });
});

describe("IssuesService.movePolicy — the stale rules the board paints from", () => {
  it("passes the engine's active rules straight through", async () => {
    const { service, rulesEngine } = makeService();
    rulesEngine.staleRules.mockResolvedValue([{ statusId: 4, days: 3 }]);

    const policy = await service.movePolicy();

    expect(policy.staleRules).toEqual([{ statusId: 4, days: 3 }]);
  });

  it("fails open to [] when the lookup breaks — no border, board still loads", async () => {
    const { service, rulesEngine } = makeService();
    rulesEngine.staleRules.mockResolvedValue([]);

    const policy = await service.movePolicy();

    expect(policy.staleRules).toEqual([]);
  });
});

describe("IssuesService.movePolicy — the hide rules the folder filters with", () => {
  it("passes the engine's active hide rules straight through", async () => {
    const { service, rulesEngine } = makeService();
    rulesEngine.hideStaleRules.mockResolvedValue([{ statusId: 4, days: 7 }]);

    const policy = await service.movePolicy();

    expect(policy.hideStaleRules).toEqual([{ statusId: 4, days: 7 }]);
  });

  it("fails open to [] when the lookup breaks — nothing hides", async () => {
    const { service, rulesEngine } = makeService();
    rulesEngine.hideStaleRules.mockResolvedValue([]);

    const policy = await service.movePolicy();

    expect(policy.hideStaleRules).toEqual([]);
  });
});

describe("IssuesService.findAll — the board search finds a card by ANY field", () => {
  const PARAMS = { page: 1, limit: 20 };
  const builderOf = (issues: { createQueryBuilder: jest.Mock }) =>
    issues.createQueryBuilder.mock.results.at(-1)?.value;

  it("covers number/id, text, people, status/app and dates — not just the title", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, "281026", {});

    const builder = builderOf(issues);
    const searchCall = builder.andWhere.mock.calls.find(([sql]: unknown[]) => String(sql).includes("ILIKE"));
    expect(searchCall).toBeDefined();
    const clause = String(searchCall?.[0]);
    for (const field of [
      "issue.title ILIKE :q",
      "issue.issue_number ILIKE :q",
      "CAST(issue.id AS TEXT) ILIKE :q",
      "issue.analysis_cause ILIKE :q",
      "issue.resolution ILIKE :q",
      "searchStatus.name ILIKE :q",
      "searchProgrammer.name ILIKE :q",
      "searchCustomer.name ILIKE :q",
      "searchCustomerCompany.name ILIKE :q",
      "searchApp.name ILIKE :q",
      "CAST(issue.created_at AS TEXT) ILIKE :q",
    ]) {
      expect(clause).toContain(field);
    }
    expect((searchCall?.[1] as { q: string }).q).toBe("%281026%");

    const joins = builder.leftJoin.mock.calls.map(([path]: unknown[]) => String(path));
    expect(joins).toEqual(
      expect.arrayContaining(["issue.status", "issue.programmer", "issue.customer", "searchCustomer.company"]),
    );
  });

  it("adds no search clause when the box is empty", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, {});

    const builder = builderOf(issues);
    expect(builder.andWhere.mock.calls.some(([sql]: unknown[]) => String(sql).includes("ILIKE"))).toBe(false);
  });
});

describe("IssuesService.findAll — ?hideStaleDone=1 cuts stale cards for the board", () => {
  const PARAMS = { page: 1, limit: 20 };

  /** The `andWhere` calls the single query builder received during findAll. */
  function whereCalls(issues: { createQueryBuilder: jest.Mock }): unknown[][] {
    const builder = issues.createQueryBuilder.mock.results.at(-1)?.value;
    return builder?.andWhere?.mock.calls ?? [];
  }

  it("excludes each rule's status past its day count — OR'd inside one NOT", async () => {
    const { service, issues, rulesEngine } = makeService();
    rulesEngine.hideStaleRules.mockResolvedValue([
      { statusId: 4, days: 7 },
      { statusId: 7, days: 3 },
    ]);

    await service.findAll(PARAMS, [], null, undefined, { hideStaleDone: true });

    const calls = whereCalls(issues);
    const hideClause = calls.find(([sql]) => String(sql).includes("NOT ("));
    expect(hideClause).toBeDefined();
    const [sql, params] = hideClause as [string, Record<string, unknown>];
    // both rules inside ONE NOT: a card stays visible unless some rule covers it
    expect(sql).toContain("issue.status_id = :hideStatus0");
    expect(sql).toContain("issue.status_id = :hideStatus1");
    expect(sql).toContain(" OR ");
    expect(params.hideStatus0).toBe(4);
    expect(params.hideStatus1).toBe(7);
    // unknown age (NULL stamp) can never satisfy the cutoff → fails open
    expect(sql).toContain("issue.status_changed_at IS NOT NULL");
    expect((params.hideCutoff0 as Date).getTime()).toBeLessThan(Date.now());
  });

  it("never hides without the flag — the table's request stays untouched", async () => {
    const { service, issues, rulesEngine } = makeService();

    await service.findAll(PARAMS, [], null, undefined, {});

    // no flag → the policy isn't even looked up (the table sees every card)
    expect(rulesEngine.hideStaleRules).not.toHaveBeenCalled();
    expect(whereCalls(issues).some(([sql]) => String(sql).includes("NOT ("))).toBe(false);
  });

  it("adds no clause at all when no hide rule is active (fail open)", async () => {
    const { service, issues, rulesEngine } = makeService();
    rulesEngine.hideStaleRules.mockResolvedValue([]);

    await service.findAll(PARAMS, [], null, undefined, { hideStaleDone: true });

    expect(rulesEngine.hideStaleRules).toHaveBeenCalled();
    expect(whereCalls(issues).some(([sql]) => String(sql).includes("NOT ("))).toBe(false);
  });
});

describe("IssuesService.findAll — the board's card order (sortBy)", () => {
  const PARAMS = { page: 1, limit: 20 };

  /** The `orderBy` calls the single query builder received during findAll. */
  function orderByCalls(issues: { createQueryBuilder: jest.Mock }): unknown[][] {
    const builder = issues.createQueryBuilder.mock.results.at(-1)?.value;
    return builder?.orderBy?.mock.calls ?? [];
  }

  it("orders by status_changed_at DESC NULLS LAST — a dragged card lands on TOP", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, {
      sortBy: "statusChangedAt",
      sortOrder: "desc",
    });

    const calls = orderByCalls(issues);
    expect(calls.length).toBeGreaterThan(0);
    // the newest *entry into this column* first; the shared NULLS LAST keeps a
    // rare unstamped row at the bottom, where the web comparator puts it too
    expect(calls[0]).toEqual(["issue.statusChangedAt", "DESC", "NULLS LAST"]);
    // ties break the same way on every page so "load more" cannot shuffle
    const builder = issues.createQueryBuilder.mock.results.at(-1)?.value;
    expect(builder.addOrderBy).toHaveBeenCalledWith("issue.createdAt", "DESC");
    expect(builder.addOrderBy).toHaveBeenCalledWith("issue.id", "DESC");
  });

  it("flips ONLY the primary direction for sortOrder=asc — the toggle's order", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, {
      sortBy: "statusChangedAt",
      sortOrder: "asc",
    });

    // asc = longest-sitting first (the toolbar toggle's other side)
    expect(orderByCalls(issues)[0]).toEqual(["issue.statusChangedAt", "ASC", "NULLS LAST"]);
    // the tie-breaks are addOrderBy and stay DESC in BOTH directions — if the
    // server flipped them too, page 2 would disagree with the web comparator
    const builder = issues.createQueryBuilder.mock.results.at(-1)?.value;
    expect(builder.addOrderBy).toHaveBeenCalledWith("issue.createdAt", "DESC");
    expect(builder.addOrderBy).toHaveBeenCalledWith("issue.id", "DESC");
    // NULLS LAST is direction-independent: an unstamped card sinks in asc too
    expect(orderByCalls(issues)[0][2]).toBe("NULLS LAST");
  });

  it("falls back to createdAt for a sort the whitelist does not know", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, {
      sortBy: "createdAt",
      sortOrder: "asc",
    });

    expect(orderByCalls(issues)[0]).toEqual(["issue.createdAt", "ASC", "NULLS LAST"]);
  });

  it("ignores an unknown sortBy — creation date, newest first (the default)", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { sortBy: "nonsense" });

    expect(orderByCalls(issues)[0]).toEqual(["issue.createdAt", "DESC", "NULLS LAST"]);
  });
});

describe("IssuesService.findAll — the company filter follows the REPORTER", () => {
  const PARAMS = { page: 1, limit: 20 };

  /** The `andWhere` calls the single query builder received during findAll. */
  function whereCalls(issues: { createQueryBuilder: jest.Mock }): unknown[][] {
    const builder = issues.createQueryBuilder.mock.results.at(-1)?.value;
    return builder?.andWhere?.mock.calls ?? [];
  }

  it("narrows to cards whose reporter belongs to a selected company", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { companyIds: [6] });

    const clause = whereCalls(issues).find(([sql]) => String(sql).includes("u.company_id"));
    expect(clause).toBeDefined();
    const [sql, params] = clause as [string, Record<string, unknown>];
    // card → reporter → company, NOT card → app → app_companies
    expect(sql).toContain("u.id = issue.customer_id");
    expect(sql).toContain("u.company_id IN (:...companyIds)");
    expect(sql).not.toContain("app_companies");
    expect(params.companyIds).toEqual([6]);
  });

  it("adds no company clause without the filter", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, {});

    // a card with no reporter can never satisfy the EXISTS → cards without
    // one are hidden only while a company is actually selected
    expect(whereCalls(issues).some(([sql]) => String(sql).includes("u.company_id"))).toBe(false);
  });

  it("keeps every selected company in ONE clause (multi-select)", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { companyIds: [4, 6] });

    const clauses = whereCalls(issues).filter(([sql]) => String(sql).includes("u.company_id"));
    expect(clauses).toHaveLength(1);
    expect((clauses[0] as [string, Record<string, unknown>])[1].companyIds).toEqual([4, 6]);
  });
});

describe("IssuesService.findAll — noApp / noCategory (the dashboard's NULL slices)", () => {
  const PARAMS = { page: 1, limit: 20 };

  /** The `andWhere` calls the single query builder received during findAll. */
  function whereCalls(issues: { createQueryBuilder: jest.Mock }): unknown[][] {
    const builder = issues.createQueryBuilder.mock.results.at(-1)?.value;
    return builder?.andWhere?.mock.calls ?? [];
  }

  it("noApp alone → app_id IS NULL", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { noApp: true });

    const clause = whereCalls(issues).find(([sql]) => String(sql).includes("app_id"));
    expect(clause).toBeDefined();
    expect(String((clause as [string])[0])).toBe("issue.app_id IS NULL");
  });

  it("noCategory alone → category_id IS NULL", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { noCategory: true });

    const clause = whereCalls(issues).find(([sql]) => String(sql).includes("category_id"));
    expect(clause).toBeDefined();
    expect(String((clause as [string])[0])).toBe("issue.category_id IS NULL");
  });

  /**
   * Ticking "ไม่มีแอป" *and* a real app must OR inside ONE clause — two ANDed
   * clauses (`IS NULL` AND `IN (…)`) could never match a row, and the panel
   * offers both checkboxes side by side.
   */
  it("noApp + appIds → ONE OR clause, never two ANDed clauses", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { noApp: true, appIds: [3, 5] });

    const clauses = whereCalls(issues).filter(([sql]) => String(sql).includes("app_id"));
    expect(clauses).toHaveLength(1);
    const [sql, params] = clauses[0] as [string, Record<string, unknown>];
    expect(sql).toBe("(issue.app_id IS NULL OR issue.app_id IN (:...appIds))");
    expect(params.appIds).toEqual([3, 5]);
  });

  it("noCategory + categoryIds → ONE OR clause", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { noCategory: true, categoryIds: [7] });

    const clauses = whereCalls(issues).filter(([sql]) => String(sql).includes("category_id"));
    expect(clauses).toHaveLength(1);
    expect(String((clauses[0] as [string])[0])).toBe(
      "(issue.category_id IS NULL OR issue.category_id IN (:...categoryIds))",
    );
  });

  it("noPriority alone → priority_id IS NULL (the dashboard's ไม่ระบุ bar)", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { noPriority: true });

    const clause = whereCalls(issues).find(([sql]) => String(sql).includes("priority_id"));
    expect(clause).toBeDefined();
    expect(String((clause as [string])[0])).toBe("issue.priority_id IS NULL");
  });

  it("noPriority + priorityIds → ONE OR clause", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { noPriority: true, priorityIds: [1, 3] });

    const clauses = whereCalls(issues).filter(([sql]) => String(sql).includes("priority_id"));
    expect(clauses).toHaveLength(1);
    const [sql, params] = clauses[0] as [string, Record<string, unknown>];
    expect(sql).toBe("(issue.priority_id IS NULL OR issue.priority_id IN (:...priorityIds))");
    expect(params.priorityIds).toEqual([1, 3]);
  });

  /** The flag is opt-in: every other caller must keep the plain `IN` clause. */
  it("neither flag set → the plain IN clause, unchanged", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { appIds: [3], categoryIds: [7] });

    const clauses = whereCalls(issues).filter(
      ([sql]) => String(sql).includes("app_id") || String(sql).includes("category_id"),
    );
    expect(clauses.map(([sql]) => String(sql))).toEqual([
      "issue.category_id IN (:...categoryIds)",
      "issue.app_id IN (:...appIds)",
    ]);
  });
});

describe("IssuesService.findAll — taskTypes / noTaskType (ประเภทงาน)", () => {
  const PARAMS = { page: 1, limit: 20 };

  /** The `andWhere` calls the single query builder received during findAll. */
  function whereCalls(issues: { createQueryBuilder: jest.Mock }): unknown[][] {
    const builder = issues.createQueryBuilder.mock.results.at(-1)?.value;
    return builder?.andWhere?.mock.calls ?? [];
  }

  /** Every clause touching `task_type` — the filter section's own dimension. */
  function typeClauses(issues: { createQueryBuilder: jest.Mock }): unknown[][] {
    return whereCalls(issues).filter(([sql]) => String(sql).includes("task_type"));
  }

  /** The whitelist lives in the controller (`common/task-types.ts`), so the
   *  service only ever sees known values — mirror that here. */
  it("taskTypes alone → the plain IN clause", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { taskTypes: ["bug", "ma"] });

    const clauses = typeClauses(issues);
    expect(clauses).toHaveLength(1);
    const [sql, params] = clauses[0] as [string, Record<string, unknown>];
    expect(sql).toBe("issue.task_type IN (:...taskTypes)");
    expect(params.taskTypes).toEqual(["bug", "ma"]);
  });

  it("noTaskType alone → task_type IS NULL (the \"ไม่ระบุ\" bucket)", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { noTaskType: true });

    const clauses = typeClauses(issues);
    expect(clauses).toHaveLength(1);
    expect(String((clauses[0] as [string])[0])).toBe("issue.task_type IS NULL");
  });

  /**
   * Ticking "ไม่ระบุประเภทงาน" *and* a real type must OR inside ONE clause —
   * two ANDed clauses (`IS NULL` AND `IN (…)`) could never match a row, and the
   * panel offers those checkboxes side by side (same rule as noApp/noCategory).
   */
  it("noTaskType + taskTypes → ONE OR clause, never two ANDed clauses", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, {
      taskTypes: ["bug"],
      noTaskType: true,
    });

    const clauses = typeClauses(issues);
    expect(clauses).toHaveLength(1);
    const [sql, params] = clauses[0] as [string, Record<string, unknown>];
    expect(sql).toBe("(issue.task_type IN (:...taskTypes) OR issue.task_type IS NULL)");
    expect(params.taskTypes).toEqual(["bug"]);
  });

  /** Fail-open: no param → no clause, so every other caller sees every type. */
  it("neither set → no task_type clause at all", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, { appIds: [3] });

    expect(typeClauses(issues)).toHaveLength(0);
  });
});

describe("IssuesService.findAll — completedFrom/To (the trend's completed bar)", () => {
  const PARAMS = { page: 1, limit: 20 };

  function whereCalls(issues: { createQueryBuilder: jest.Mock }): unknown[][] {
    const builder = issues.createQueryBuilder.mock.results.at(-1)?.value;
    return builder?.andWhere?.mock.calls ?? [];
  }

  it("filters by a card.moved into เสร็จสิ้น inside the window, not by created_at", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, {
      completedFrom: "2026-10-12",
      completedTo: "2026-10-18",
    });

    const clause = whereCalls(issues).find(([sql]) => String(sql).includes("activity_logs al"));
    expect(clause).toBeDefined();
    const [sql, params] = clause as [string, Record<string, unknown>];
    expect(sql).toContain("al.action = 'card.moved'");
    expect(sql).toContain("al.detail::json->>'toStatusId'");
    expect(sql).toContain("al.created_at >= :completedFrom");
    expect(sql).toContain("al.created_at <= :completedTo");
    expect(sql).not.toContain("issue.created_at >= :");
    expect(params.doneStatusId).toBe("4");
    expect(params.doneStatusNames).toEqual(expect.arrayContaining(["เสร็จสิ้น"]));
    expect(params.completedFrom).toBeInstanceOf(Date);
    expect(params.completedTo).toBeInstanceOf(Date);
  });

  it("emits no completion clause without the filter", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, {});

    expect(
      whereCalls(issues).some(([sql]) => String(sql).includes("activity_logs al")),
    ).toBe(false);
  });
});

describe("IssuesService.findAll — ?notDone=1 (the trend's pending bar)", () => {
  const PARAMS = { page: 1, limit: 20 };

  function whereCalls(issues: { createQueryBuilder: jest.Mock }): unknown[][] {
    const builder = issues.createQueryBuilder.mock.results.at(-1)?.value;
    return builder?.andWhere?.mock.calls ?? [];
  }

  it("narrows to every non-done status, including cards with no status", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, {
      notDone: true,
      createdFrom: "2026-10-19",
      createdTo: "2026-10-25",
    });

    const calls = whereCalls(issues);
    const clause = calls.find(([sql]) => String(sql).includes("issue.status_id <> :doneStatusId"));
    expect(clause).toBeDefined();
    expect(String(clause?.[0])).toContain("issue.status_id IS NULL");
    expect((clause?.[1] as { doneStatusId: number }).doneStatusId).toBe(4);
    // the same creation window as the bar it came from
    expect(calls.some(([sql]) => String(sql).includes("issue.created_at >= :createdFrom"))).toBe(true);
    expect(calls.some(([sql]) => String(sql).includes("issue.created_at <= :createdTo"))).toBe(true);
  });

  it("emits no clause without the flag — every other caller is unchanged", async () => {
    const { service, issues } = makeService();

    await service.findAll(PARAMS, [], null, undefined, {});

    expect(whereCalls(issues).some(([sql]) => String(sql).includes(":doneStatusId"))).toBe(false);
  });
});
