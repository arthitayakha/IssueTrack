import { CommentsService } from "../modules/comments/comments.service";

/**
 * A comment used to reach only the assignee + the reporter — on a card
 * nobody has picked up, that is the commenter and nobody else. Pinning the
 * fan-out: admins hear comments on unassigned cards, assigned cards stay
 * quiet for the admins.
 *
 * Stubbed repositories only — safe to run while `npm run dev` is up.
 */

interface Stub {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
  delete: jest.Mock;
}

function repo(overrides: Partial<Stub> = {}): Stub {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (value: Record<string, unknown>) => ({ ...value, id: 1 })),
    create: jest.fn((value: unknown) => value),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    ...overrides,
  };
}

type ServiceArgs = ConstructorParameters<typeof CommentsService>;

function makeService() {
  const comments = repo();
  const activityLogs = repo();
  const issues = repo();
  const permissions = { hasPermission: jest.fn().mockResolvedValue(false) };
  const rulesEngine = { evaluate: jest.fn().mockResolvedValue(undefined) };
  const notifications = { notifyIssueEvent: jest.fn().mockResolvedValue(undefined) };
  const service = new CommentsService(
    ...([
      comments,
      activityLogs,
      issues,
      permissions,
      rulesEngine,
      notifications,
    ] as unknown as ServiceArgs),
  );
  return { service, comments, issues, notifications };
}

const ACTOR = { actorId: 1, actorName: "aom", actorRole: "customer" };

describe("CommentsService.create — comment notifications", () => {
  it("fans out to the admins when the card has no assignee yet", async () => {
    const { service, issues, notifications } = makeService();
    issues.findOne.mockResolvedValue({
      id: 5,
      title: "POS error",
      statusId: 1,
      programmerId: null,
      customerId: 2,
      category: null,
    });

    await service.create(5, "any update?", 2, ACTOR);

    expect(notifications.notifyIssueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "commented",
        recipients: [null, 2],
        alsoAdmins: true,
      }),
    );
  });

  it("keeps the admins out once someone owns the card", async () => {
    const { service, issues, notifications } = makeService();
    issues.findOne.mockResolvedValue({
      id: 5,
      title: "POS error",
      statusId: 3,
      programmerId: 7,
      customerId: 2,
      category: null,
    });

    await service.create(5, "fixed in the next build", 7, ACTOR);

    expect(notifications.notifyIssueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "commented",
        recipients: [7, 2],
        alsoAdmins: false,
      }),
    );
  });

  it("skips the notification entirely when the card is gone", async () => {
    const { service, issues, notifications } = makeService();
    issues.findOne.mockResolvedValue(null);

    await service.create(999, "orphan comment", 2, ACTOR);

    expect(notifications.notifyIssueEvent).not.toHaveBeenCalled();
  });
});
