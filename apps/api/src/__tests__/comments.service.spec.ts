import { NotFoundException } from "@nestjs/common";
import { CommentsService } from "../modules/comments/comments.service";
import type { AuthUser } from "../modules/auth/auth-user";

/**
 * A comment used to reach only the assignee + the reporter — on a card
 * nobody has picked up, that is the commenter and nobody else. Pinning the
 * fan-out: admins hear comments on unassigned cards, assigned cards stay
 * quiet for the admins.
 *
 * `create()` now loads the issue **before** inserting (the IDOR guard in
 * `issue-access.ts`): a missing/out-of-scope card is a 404 and no comment is
 * ever written — the stubbed `permissions.getUserPermissions` answers "no
 * `issue.all.view`" so the scope really runs (owner/reporter ids pass).
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
  const permissions = {
    hasPermission: jest.fn().mockResolvedValue(false),
    // ไม่มี `issue.all.view` → การเช็คขอบเขตเดินจริง (ผู้รับ/ผู้แจ้งผ่าน)
    getUserPermissions: jest.fn().mockResolvedValue([]),
  };
  const notifications = { notifyIssueEvent: jest.fn().mockResolvedValue(undefined) };
  const service = new CommentsService(
    ...([comments, activityLogs, issues, permissions, notifications] as unknown as ServiceArgs),
  );
  return { service, comments, issues, notifications };
}

const ACTOR = { actorId: 1, actorName: "aom", actorRole: "customer" };

/** `AuthUser` ของคนที่พิมพ์คอมเมนต์ — id ต้องเป็นผู้รับ/ผู้แจ้งของใบนั้น */
function userOf(id: number): AuthUser {
  return {
    id: String(id),
    email: `${id}@example.com`,
    name: `user ${id}`,
    roleId: 3,
    roleName: "customer",
    positionId: null,
    companyId: null,
  };
}

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

    await service.create(5, "any update?", userOf(2), ACTOR);

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

    await service.create(5, "fixed in the next build", userOf(7), ACTOR);

    expect(notifications.notifyIssueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "commented",
        recipients: [7, 2],
        alsoAdmins: false,
      }),
    );
  });

  it("404s when the card is gone — nothing is written, nothing notifies", async () => {
    const { service, comments, issues, notifications } = makeService();
    issues.findOne.mockResolvedValue(null);

    await expect(service.create(999, "orphan comment", userOf(2), ACTOR)).rejects.toThrow(
      NotFoundException,
    );

    expect(comments.save).not.toHaveBeenCalled();
    expect(notifications.notifyIssueEvent).not.toHaveBeenCalled();
  });

  it("refuses to comment on someone else's card (IDOR guard)", async () => {
    const { service, comments, issues, notifications } = makeService();
    issues.findOne.mockResolvedValue({
      id: 5,
      title: "POS error",
      statusId: 3,
      programmerId: 7,
      customerId: 2,
      category: null,
    });

    // user 99 ไม่ใช่ผู้รับผิดชอบ/ผู้แจ้ง และไม่มี `issue.all.view`
    await expect(service.create(5, "hello?", userOf(99), ACTOR)).rejects.toThrow(
      NotFoundException,
    );

    expect(comments.save).not.toHaveBeenCalled();
    expect(notifications.notifyIssueEvent).not.toHaveBeenCalled();
  });
});
