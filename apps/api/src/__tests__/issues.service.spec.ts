import { BadRequestException } from "@nestjs/common";
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
    }),
    startTimerApplies: jest.fn().mockResolvedValue(new Set<number>()),
    // the step-only drag guard: off by default so every test opts in
    isStepOnlyMoveActive: jest.fn().mockResolvedValue(false),
  };
  const notifications = { notifyIssueEvent: jest.fn().mockResolvedValue(undefined) };
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
  return { service, issues, issueStatuses, rulesEngine, activityLogs, workSessions, notifications };
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

describe("IssuesService.move — admin fan-out (alsoAdmins)", () => {
  it("passes alsoAdmins: true so every admin sees card moves", async () => {
    const { service, issues, notifications } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1 }));

    await service.move(5, 2, ACTOR);

    expect(notifications.notifyIssueEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "moved", alsoAdmins: true }),
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

    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 2, timeEntryUnlocked: false });
  });

  it("allows one step backward (3 → 2)", async () => {
    const { service, issues } = guardOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 3 }));

    await service.move(5, 2, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 2, timeEntryUnlocked: false });
  });

  it("allows every jump again while the rule is paused", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1 }));

    await service.move(5, 3, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 3, timeEntryUnlocked: false });
  });

  it("lets a card with no status land in any column", async () => {
    const { service, issues } = guardOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: null }));

    await service.move(5, 3, ACTOR);

    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 3, timeEntryUnlocked: false });
  });

  it("fails open when the status order cannot be read", async () => {
    const { service, issues, issueStatuses } = guardOn();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 1 }));
    // an empty/unreadable list means adjacency cannot be measured → allowed
    issueStatuses.find.mockResolvedValue([]);

    await expect(service.move(5, 3, ACTOR)).resolves.toBeDefined();
    expect(issues.update).toHaveBeenCalledWith(5, { statusId: 3, timeEntryUnlocked: false });
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

describe("IssuesService.findOne — analysis/resolution field gate", () => {
  it("opens the analysis field for a card already sitting in the rule's status", async () => {
    // the card never moved after the rule was created, so its flag is still false
    const { service, issues, rulesEngine } = makeService();
    issues.findOne.mockResolvedValue(issueRow({ statusId: 9, isAnalysisOpen: false }));
    rulesEngine.statusGates.mockResolvedValue({
      timer: new Set<number>(),
      analysis: new Set<number>([9]),
      resolution: new Set<number>(),
    });

    const result = await service.findOne(5);

    expect(rulesEngine.statusGates).toHaveBeenCalledWith([9]);
    expect(result.isAnalysisOpen).toBe(true);
    expect(result.isResolutionOpen).toBe(false);
    expect(result.timerRuleApplies).toBe(false);
  });

  it("keeps the persisted flag when no active rule covers the status", async () => {
    const { service, issues } = makeService();
    issues.findOne.mockResolvedValue(
      issueRow({ statusId: 9, isAnalysisOpen: true, isResolutionOpen: true }),
    );

    const result = await service.findOne(5);

    expect(result.isAnalysisOpen).toBe(true);
    expect(result.isResolutionOpen).toBe(true);
  });
});
