import { of, throwError, firstValueFrom } from "rxjs";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { ActivityLogInterceptor } from "../modules/activity-logs/activity-log.interceptor";

/**
 * The interceptor is tested against a stub repository and hand-built
 * ExecutionContext/CallHandler — no Nest testing module, no database. What is
 * worth pinning down here is the *contract*, not the plumbing:
 *
 * - it records mutating requests and ignores reads
 * - it never records the routes a service already logs (double rows) or the
 *   two that are not auditable actions (inbox delete, public password flow)
 * - secret-looking body keys never reach `detail`
 * - a failing write must not fail the request (fail-open)
 * - a route nobody tabled still gets a readable action (future endpoints)
 */

interface SavedRow {
  action: string;
  entityId: number | null;
  detail: string | null;
  actorId: number | null;
}

function makeInterceptor(): {
  interceptor: ActivityLogInterceptor;
  saved: SavedRow[];
  failWrites: () => void;
} {
  const saved: SavedRow[] = [];
  let shouldFail = false;
  const repo = {
    create: (row: SavedRow) => row,
    save: jest.fn(async (row: SavedRow) => {
      if (shouldFail) throw new Error("db down");
      saved.push(row);
      return row;
    }),
  };
  return {
    interceptor: new ActivityLogInterceptor(repo as unknown as never),
    saved,
    failWrites: () => {
      shouldFail = true;
    },
  };
}

function contextFor(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/** A handler that emits `value` — i.e. a request that succeeded. */
function okHandler(value: unknown = { ok: true }): CallHandler {
  return { handle: () => of(value) } as CallHandler;
}

/** A handler that errors — i.e. a 4xx/5xx response. */
function failingHandler(message = "boom"): CallHandler {
  return { handle: () => throwError(() => new Error(message)) } as CallHandler;
}

async function run(
  interceptor: ActivityLogInterceptor,
  request: unknown,
  handler: CallHandler = okHandler(),
): Promise<unknown> {
  return firstValueFrom(interceptor.intercept(contextFor(request), handler));
}

describe("ActivityLogInterceptor", () => {
  describe("what it records", () => {
    it("ignores reads entirely", async () => {
      const { interceptor, saved } = makeInterceptor();

      await run(interceptor, { method: "GET", path: "/issues", params: {}, user: { id: 1 } });

      expect(saved).toHaveLength(0);
    });

    it("records a tabled route with its action, actor and entity", async () => {
      const { interceptor, saved } = makeInterceptor();

      await run(
        interceptor,
        {
          method: "PATCH",
          path: "/users/5/active",
          params: { id: "5" },
          user: { id: "7" },
          body: { isActive: false },
        },
      );

      expect(saved).toEqual([
        {
          action: "user.toggled",
          entityId: 5,
          detail: JSON.stringify({ isActive: false }),
          actorId: 7,
        },
      ]);
    });

    it("takes the actor from the login response when there is no token", async () => {
      const { interceptor, saved } = makeInterceptor();

      // POST /auth/login is @Public() → request.user is undefined; the id
      // only exists in the response body, and it is a string (toPublicUser)
      await run(
        interceptor,
        { method: "POST", path: "/auth/login", params: {}, body: { email: "a@b.c" } },
        okHandler({ accessToken: "…", user: { id: "13" } }),
      );

      expect(saved).toHaveLength(1);
      expect(saved[0].actorId).toBe(13);
      expect(saved[0].action).toBe("auth.login");
    });

    it("prefers issueId over id when picking the entity", async () => {
      const { interceptor, saved } = makeInterceptor();

      await run(interceptor, {
        method: "POST",
        path: "/work-sessions/issue/42/start",
        params: { issueId: "42" },
        user: { id: 1 },
        body: {},
      });

      expect(saved[0].entityId).toBe(42);
      expect(saved[0].action).toBe("workSession.started");
    });

    it("stores an upload's name and size, never the bytes", async () => {
      const { interceptor, saved } = makeInterceptor();

      await run(interceptor, {
        method: "POST",
        path: "/issues/9/attachments",
        params: { id: "9" },
        user: { id: 1 },
        // multer has already run by the time the handler resolves
        file: { originalname: "spec.pdf", size: 2048 },
      });

      expect(JSON.parse(saved[0].detail ?? "{}")).toEqual({
        filename: "spec.pdf",
        fileSize: 2048,
      });
      expect(saved[0].action).toBe("attachment.added");
    });
  });

  describe("routes it must not touch", () => {
    it.each([
      // already written by a service — an interceptor row would double it
      ["POST", "/issues"],
      ["PUT", "/issues/5/move"],
      ["POST", "/issues/5/comments"],
      ["PATCH", "/rules/3/toggle"],
      ["DELETE", "/comments/2"],
      // not an auditable action
      ["DELETE", "/notifications/5"],
      ["DELETE", "/notifications"],
      ["POST", "/auth/forgot-password"],
      ["POST", "/auth/reset-password"],
    ])("skips %s %s", async (method, path) => {
      const { interceptor, saved } = makeInterceptor();

      await run(interceptor, { method, path, params: {}, user: { id: 1 }, body: {} });

      expect(saved).toHaveLength(0);
    });
  });

  describe("secret redaction", () => {
    it("keeps every password-shaped key out of detail", async () => {
      const { interceptor, saved } = makeInterceptor();

      await run(interceptor, {
        method: "PATCH",
        path: "/auth/profile/password",
        params: {},
        user: { id: 4 },
        body: { currentPassword: "old-secret", newPassword: "new-secret" },
      });

      const detail = saved[0].detail ?? "";
      expect(detail).not.toContain("old-secret");
      expect(detail).not.toContain("new-secret");
      // the names survive, so the row still shows a password field was sent
      expect(JSON.parse(detail)).toEqual({
        redacted: ["currentPassword", "newPassword"],
      });
      expect(saved[0].action).toBe("auth.passwordChanged");
    });

    it("keeps non-secret fields, including e-mail (not a secret by design)", async () => {
      const { interceptor, saved } = makeInterceptor();

      await run(interceptor, {
        method: "PATCH",
        path: "/auth/profile/email",
        params: {},
        user: { id: 4 },
        body: { email: "new@example.com", currentPassword: "shhh" },
      });

      expect(JSON.parse(saved[0].detail ?? "{}")).toEqual({
        email: "new@example.com",
        redacted: ["currentPassword"],
      });
    });

    it("collapses an oversized body so the JSON stays parseable", async () => {
      const { interceptor, saved } = makeInterceptor();

      await run(interceptor, {
        method: "PUT",
        path: "/permissions",
        params: {},
        user: { id: 1 },
        body: { grants: "x".repeat(5000) },
      });

      const detail = JSON.parse(saved[0].detail ?? "{}") as Record<string, unknown>;
      expect(detail._truncated).toBe(true);
      expect(detail._fields).toEqual(["grants"]);
    });

    it("writes no detail at all when there is nothing to record", async () => {
      const { interceptor, saved } = makeInterceptor();

      await run(interceptor, {
        method: "POST",
        path: "/permissions/refresh",
        params: {},
        user: { id: 1 },
      });

      expect(saved[0].detail).toBeNull();
      expect(saved[0].action).toBe("permission.refreshed");
    });
  });

  describe("future routes", () => {
    it("derives a readable action from a route nobody tabled", async () => {
      const { interceptor, saved } = makeInterceptor();

      await run(interceptor, {
        method: "PATCH",
        path: "/widgets/12/active",
        params: { id: "12" },
        user: { id: 1 },
        body: {},
      });

      expect(saved[0].action).toBe("widgets.active");
    });

    it("falls back to the method verb when there is no trailing word", async () => {
      const { interceptor, saved } = makeInterceptor();

      await run(interceptor, {
        method: "POST",
        path: "/frobs",
        params: {},
        user: { id: 1 },
        body: {},
      });

      // single segment: the noun must not be reused as the verb
      expect(saved[0].action).toBe("frobs.created");
    });

    it("collapses numeric segments so one table key covers every id", async () => {
      const { interceptor, saved } = makeInterceptor();

      await run(interceptor, {
        method: "PATCH",
        path: "/users/99/active",
        params: { id: "99" },
        user: { id: 1 },
        body: {},
      });

      expect(saved[0].action).toBe("user.toggled");
      expect(saved[0].entityId).toBe(99);
    });
  });

  describe("fail-open", () => {
    it("still resolves the response when the write throws", async () => {
      const { interceptor, saved, failWrites } = makeInterceptor();
      failWrites();

      await expect(
        run(interceptor, {
          method: "POST",
          path: "/labels",
          params: {},
          user: { id: 1 },
          body: { name: "bug" },
        }),
      ).resolves.toEqual({ ok: true });
      expect(saved).toHaveLength(0);
    });

    it("propagates a failing handler instead of logging it", async () => {
      const { interceptor, saved } = makeInterceptor();

      await expect(
        run(
          interceptor,
          { method: "POST", path: "/labels", params: {}, user: { id: 1 }, body: {} },
          failingHandler(),
        ),
      ).rejects.toThrow("boom");
      // a rejected request changed nothing — there is nothing to audit
      expect(saved).toHaveLength(0);
    });
  });
});
