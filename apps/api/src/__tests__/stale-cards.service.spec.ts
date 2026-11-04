import { StaleCardsService } from "../modules/rules/stale-cards.service";

/**
 * The 09:00 stale sweep — the only caller of `notifyStaleCard()`:
 *
 *   - rings once per *sitting*: only rows with `stale_notified_at IS NULL`
 *     are picked up, and each one is stamped right after the bell;
 *   - never rings for a trashed card or a card that is not past the days;
 *   - no active rule (or an unreadable rules table) = the sweep does
 *     nothing at all (fail open, same contract as the app-expiry sweep);
 *   - a broken round is swallowed — the cron must never take the API down.
 *
 * Stubbed repositories only — safe to run while `npm run dev` is up.
 */

interface Stubs {
  issues: { find: jest.Mock; update: jest.Mock };
  rulesEngine: { staleRules: jest.Mock };
  notifications: { notifyStaleCard: jest.Mock };
}

function makeSweep(): Stubs & { service: StaleCardsService } {
  const issues = {
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const rulesEngine = { staleRules: jest.fn().mockResolvedValue([]) };
  const notifications = { notifyStaleCard: jest.fn().mockResolvedValue(undefined) };
  const service = new StaleCardsService(
    issues as never,
    rulesEngine as never,
    notifications as never,
  );
  return { service, issues, rulesEngine, notifications };
}

const OLD_STAMP = new Date(Date.now() - 10 * 86_400_000); // 10 days ago

describe("StaleCardsService.sweep — the daily stale bell", () => {
  it("does nothing at all when no rule is active (fail open)", async () => {
    const { service, issues, notifications } = makeSweep();

    await service.sweep();

    expect(issues.find).not.toHaveBeenCalled();
    expect(issues.update).not.toHaveBeenCalled();
    expect(notifications.notifyStaleCard).not.toHaveBeenCalled();
  });

  it("asks only for un-notified, non-trashed cards past the cutoff", async () => {
    const { service, issues, rulesEngine } = makeSweep();
    rulesEngine.staleRules.mockResolvedValue([{ statusId: 4, days: 7 }]);
    const before = Date.now();

    await service.sweep();

    expect(issues.find).toHaveBeenCalledTimes(1);
    const { where, relations } = issues.find.mock.calls[0][0];
    expect(where.statusId).toBe(4);
    expect(where.staleNotifiedAt).toEqual(expect.anything()); // IS NULL
    expect(where.deletedAt).toEqual(expect.anything()); // IS NULL
    expect(where.statusChangedAt).toEqual(expect.anything()); // < cutoff
    // cutoff ≈ now − 7 days (a second of slack either way)
    const cutoff: Date = where.statusChangedAt.value;
    expect(Math.abs(cutoff.getTime() - (before - 7 * 86_400_000))).toBeLessThan(5_000);
    expect(relations).toContain("status");
  });

  it("notifies with the status + day count and stamps the card", async () => {
    const { service, issues, notifications, rulesEngine } = makeSweep();
    rulesEngine.staleRules.mockResolvedValue([{ statusId: 4, days: 7 }]);
    issues.find.mockResolvedValue([
      { id: 42, title: "POS error", status: { name: "เสร็จสิ้น" }, statusChangedAt: OLD_STAMP },
    ]);

    await service.sweep();

    expect(notifications.notifyStaleCard).toHaveBeenCalledWith({
      issue: expect.objectContaining({ id: 42 }),
      statusName: "เสร็จสิ้น",
      days: 7,
    });
    // the stamp lands after the bell — a lost stamp only means a rare
    // second ring, a lost bell would be silent forever
    expect(issues.update).toHaveBeenCalledWith(42, {
      staleNotifiedAt: expect.any(Date),
    });
  });

  it("rings every card the rule covers, stamping each one", async () => {
    const { service, issues, notifications, rulesEngine } = makeSweep();
    rulesEngine.staleRules.mockResolvedValue([{ statusId: 4, days: 3 }]);
    issues.find.mockResolvedValue([
      { id: 1, title: "a", status: { name: "เสร็จสิ้น" } },
      { id: 2, title: "b", status: { name: "เสร็จสิ้น" } },
    ]);

    await service.sweep();
    expect(notifications.notifyStaleCard).toHaveBeenCalledTimes(2);
    expect(issues.update).toHaveBeenCalledTimes(2);
    expect(issues.update).toHaveBeenNthCalledWith(1, 1, { staleNotifiedAt: expect.any(Date) });
    expect(issues.update).toHaveBeenNthCalledWith(2, 2, { staleNotifiedAt: expect.any(Date) });
  });

  it("one round per rule — several rules each get their own query", async () => {
    const { service, issues, rulesEngine } = makeSweep();
    rulesEngine.staleRules.mockResolvedValue([
      { statusId: 4, days: 3 },
      { statusId: 7, days: 14 },
    ]);

    await service.sweep();

    expect(issues.find).toHaveBeenCalledTimes(2);
    expect(issues.find.mock.calls[0][0].where.statusId).toBe(4);
    expect(issues.find.mock.calls[1][0].where.statusId).toBe(7);
  });

  it("swallows a broken round — the cron must never take the API down", async () => {
    const { service, rulesEngine } = makeSweep();
    rulesEngine.staleRules.mockRejectedValue(new Error("connection lost"));

    await expect(service.sweep()).resolves.toBeUndefined();
  });

  it("a failed lookup mid-round stops that round without throwing", async () => {
    const { service, issues, rulesEngine } = makeSweep();
    rulesEngine.staleRules.mockResolvedValue([{ statusId: 4, days: 7 }]);
    issues.find.mockRejectedValue(new Error("connection refused"));

    await expect(service.sweep()).resolves.toBeUndefined();
    expect(issues.update).not.toHaveBeenCalled();
  });
});
