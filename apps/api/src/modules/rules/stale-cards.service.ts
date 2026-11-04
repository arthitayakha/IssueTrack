import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThan, IsNull, Repository } from "typeorm";
import { Issue } from "../issues/entities/issue.entity";
import { NotificationsService } from "../notifications/notifications.service";
import { RulesEngineService } from "./rules-engine.service";

/**
 * The daily bell for stale cards — **the only caller** of
 * `NotificationsService.notifyStaleCard()`.
 *
 * Every day at 09:00 (Asia/Bangkok) it reads the active `issue.notify_stale`
 * rules (`staleRules()` — the sentence's status + days) and, for each rule,
 * finds the cards sitting in that status for longer than its day count that
 * have not rung yet (`stale_notified_at IS NULL`), notifies the assignee +
 * every admin, and stamps them. One bell per *sitting*: moving the card away
 * clears the stamp (wherever `status_changed_at` is written), so coming back
 * and sitting again rings again.
 *
 * Fail-open by design — no rules, a paused rule, an unreadable rules table or
 * a broken DB round are all no-ops; a sweep must never take the API down
 * (same contract as the app-expiry sweep).
 */
@Injectable()
export class StaleCardsService {
  private readonly logger = new Logger(StaleCardsService.name);

  constructor(
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    private readonly rulesEngine: RulesEngineService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every day, once — the window only moves when the calendar does. */
  @Cron("0 9 * * *", { name: "stale-cards-sweep", timeZone: "Asia/Bangkok" })
  async sweep(): Promise<void> {
    try {
      const rules = await this.rulesEngine.staleRules();
      if (rules.length === 0) return;
      for (const rule of rules) await this.sweepRule(rule);
    } catch (error) {
      this.logger.warn(`stale sweep failed: ${(error as Error).message}`);
    }
  }

  /** One rule's status — cards past the days that have not rung yet. */
  private async sweepRule(rule: { statusId: number; days: number }): Promise<void> {
    const cutoff = new Date(Date.now() - rule.days * 86_400_000);
    const cards = await this.issues.find({
      where: {
        statusId: rule.statusId,
        statusChangedAt: LessThan(cutoff),
        staleNotifiedAt: IsNull(),
        deletedAt: IsNull(),
      },
      relations: ["status"],
    });
    for (const issue of cards) {
      await this.notifications.notifyStaleCard({
        issue,
        statusName: issue.status?.name ?? null,
        days: rule.days,
      });
      // stamp after the bell: notify() is best-effort and never throws, so a
      // stamp failure only means a rare second ring next round — the reverse
      // order would lose the bell for good
      await this.issues.update(issue.id, { staleNotifiedAt: new Date() });
    }
    if (cards.length > 0) {
      this.logger.log(
        `rule ${rule.statusId}/${rule.days}d: flagged ${cards.length} stale card(s)`,
      );
    }
  }
}
