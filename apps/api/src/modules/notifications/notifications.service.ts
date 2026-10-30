import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Notification } from "./entities/notification.entity";
import { User } from "../auth/entities/user.entity";

export type NotificationAction =
  | "created"
  | "assigned"
  // clearing the assignee — the person who lost the card + every admin
  | "unassigned"
  | "commented"
  | "moved"
  // milestone columns get their own wording so the inbox says WHY it matters
  // ("moved" stays for every routine drag)
  | "needs_assignment" // รอรับเรื่อง + nobody on the card → admins come assign it
  | "status_pending" // รอดำเนินการ — "your report is in the queue"
  | "in_progress" // กำลังดำเนินการ — work has started
  | "completed" // เสร็จสิ้น — done, the whole team sees it
  | "edited"
  | "deleted"
  | "restored"
  // automation-rule changes — shown as "created rule X" / "updated rule X"
  | "rule_created"
  | "rule_updated"
  | "rule_deleted";

/**
 * Milestone columns, keyed by id — the names get renamed by hand
 * (Backlog/Todo → รอรับเรื่อง/รอดำเนินการ) but the ids never move, the same
 * deal as RECEIVED_STATUS_ID in issues.service.ts. Anything that is not one
 * of these (Review, custom columns) is a routine drag.
 */
const WAITING_ASSIGNMENT_STATUS_ID = 1; // รอรับเรื่อง
const PENDING_STATUS_ID = 2; // รอดำเนินการ
const IN_PROGRESS_STATUS_ID = 3; // กำลังดำเนินการ
const DONE_STATUS_ID = 4; // เสร็จสิ้น

/** Structural subset of ActivityLogsService's ActorInfo (avoids a circular import). */
export interface NotificationActor {
  actorId?: number | null;
}

export interface NotifyInput {
  userId: number;
  action: NotificationAction;
  title: string;
  context?: string | null;
  issueId?: number | null;
  link?: string | null;
  actor?: NotificationActor | null;
}

export interface NotificationIssueTarget {
  id: number;
  title: string;
  programmerId?: number | null;
  customerId?: number | null;
  category?: { name?: string } | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /** Deep link straight to the card's detail dialog; the plain board when there is no issue. */
  private issueLink(issueId?: number | null): string {
    return issueId ? `/boards?issue=${issueId}` : "/boards";
  }

  /**
   * Ids of every active admin — the fan-out target for board-wide events
   * (new card, card moved, rule changed). Empty when nobody holds the role.
   */
  private async adminIds(): Promise<number[]> {
    const admins = await this.users.find({
      where: { isActive: true, role: { name: "admin" } },
      relations: ["role"],
    });
    return admins.map((u) => u.id);
  }

  /**
   * One notification per active admin, skipping the actor (never notify
   * yourself). Best-effort like `notify()` — a failure never breaks the
   * request that triggered it.
   */
  async notifyAdmins(input: Omit<NotifyInput, "userId">): Promise<void> {
    try {
      const ids = await this.adminIds();
      for (const userId of ids) {
        await this.notify({ ...input, userId });
      }
    } catch (error) {
      this.logger.warn(`failed to notify admins: ${(error as Error).message}`);
    }
  }

  /**
   * Best-effort create — never throws, so a notification bug can never break
   * the issue/comment action that triggered it.
   */
  async notify(input: NotifyInput): Promise<void> {
    try {
      if (!input.userId || input.userId === input.actor?.actorId) return;
      await this.notifications.save(
        this.notifications.create({
          userId: input.userId,
          issueId: input.issueId ?? null,
          // who caused it — the name is read off `users` when the list is built
          actorId: input.actor?.actorId ?? null,
          context: input.context ?? null,
          link: input.link ?? this.issueLink(input.issueId),
          type: input.action,
          title: input.title.slice(0, 200),
        }),
      );
    } catch (error) {
      this.logger.warn(`failed to create notification: ${(error as Error).message}`);
    }
  }

  /**
   * Shared rule for issue events: notify the given recipients (assignee /
   * reporter), deduplicated, skipping the actor (never notify yourself).
   * `alsoAdmins: true` fans the same event out to every active admin —
   * used for new cards and moves so the team sees board traffic.
   */
  async notifyIssueEvent(params: {
    issue: NotificationIssueTarget;
    action: NotificationAction;
    recipients: Array<number | null | undefined>;
    actor?: NotificationActor | null;
    alsoAdmins?: boolean;
  }): Promise<void> {
    const { issue, action, recipients, actor, alsoAdmins } = params;
    const ids = new Set<number>(recipients.filter((id): id is number => typeof id === "number" && id > 0));
    if (alsoAdmins) {
      // fan-out is a bonus — if the admin list cannot be read, still notify
      // the regular recipients rather than failing the whole event
      try {
        for (const id of await this.adminIds()) ids.add(id);
      } catch (error) {
        this.logger.warn(`could not load admins for fan-out: ${(error as Error).message}`);
      }
    }
    const userIds = new Set<number>();
    for (const id of ids) {
      if (id !== actor?.actorId) {
        userIds.add(id);
      }
    }
    for (const userId of userIds) {
      await this.notify({
        userId,
        action,
        title: issue.title,
        context: issue.category?.name ?? null,
        issueId: issue.id,
        // a deleted card lives in the recycle bin — nothing to open, so it
        // only points at the board
        link: action === "deleted" ? "/boards" : this.issueLink(issue.id),
        actor,
      });
    }
  }

  /**
   * The recipient policy for a status change — ONE place, so a manual drag
   * and a rules-engine `issue.move_status` notify identically:
   *
   * - รอรับเรื่อง + nobody on the card → `needs_assignment` to the admins
   *   (+ the reporter): someone must pick it up
   * - รอดำเนินการ / กำลังดำเนินการ → `status_pending` / `in_progress` to the
   *   reporter + the assignee: the customer hears their report is moving
   * - เสร็จสิ้น → `completed` to the reporter + assignee + every admin
   * - every other column → plain `moved` to the two people on the card only
   *   (routine drags no longer flood the admin inbox)
   */
  async notifyStatusChange(params: {
    issue: NotificationIssueTarget;
    statusId: number | null;
    actor?: NotificationActor | null;
  }): Promise<void> {
    const { issue, statusId, actor } = params;
    const people: Array<number | null | undefined> = [issue.programmerId, issue.customerId];
    switch (statusId) {
      case WAITING_ASSIGNMENT_STATUS_ID:
        // a card with an assignee back at intake is just a routine drag
        if (issue.programmerId) {
          break;
        }
        return this.notifyIssueEvent({
          issue,
          action: "needs_assignment",
          recipients: [issue.customerId],
          actor,
          alsoAdmins: true,
        });
      case PENDING_STATUS_ID:
        return this.notifyIssueEvent({
          issue,
          action: "status_pending",
          recipients: people,
          actor,
        });
      case IN_PROGRESS_STATUS_ID:
        return this.notifyIssueEvent({
          issue,
          action: "in_progress",
          recipients: people,
          actor,
        });
      case DONE_STATUS_ID:
        return this.notifyIssueEvent({
          issue,
          action: "completed",
          recipients: people,
          actor,
          alsoAdmins: true,
        });
      default:
        break;
    }
    return this.notifyIssueEvent({ issue, action: "moved", recipients: people, actor });
  }

  /**
   * The recipient policy for an assignment change — `assigned` goes to the
   * new assignee + the reporter; clearing the field becomes `unassigned`,
   * which tells the person who lost the card and every admin (someone must
   * pick it up). Same helper for the manual endpoint and the engine.
   */
  async notifyAssignmentChange(params: {
    issue: NotificationIssueTarget;
    assigneeId: number | null;
    previousAssigneeId?: number | null;
    actor?: NotificationActor | null;
  }): Promise<void> {
    const { issue, assigneeId, previousAssigneeId, actor } = params;
    if (assigneeId !== null) {
      return this.notifyIssueEvent({
        issue,
        action: "assigned",
        recipients: [assigneeId, issue.customerId],
        actor,
      });
    }
    if (!previousAssigneeId) return; // was already unassigned — nothing to say
    return this.notifyIssueEvent({
      issue,
      action: "unassigned",
      recipients: [previousAssigneeId],
      actor,
      alsoAdmins: true,
    });
  }

  /**
   * One page of a user's inbox — there are no tabs any more: every stored row
   * is unread (reading one deletes it), so `unreadCount` is simply the total.
   * The popover scroll-loads 5 rows at a time (like the board columns) and the
   * badge keeps counting the whole account, never just the loaded rows.
   */
  async list(userId: number, options: { limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);
    const [data, total] = await Promise.all([
      this.notifications.find({
        where: { userId },
        order: { createdAt: "DESC", id: "DESC" },
        take: limit,
        skip: offset,
        // the actor's name comes off `users` — nothing is stored per row
        relations: ["actor"],
      }),
      this.notifications.count({ where: { userId } }),
    ]);
    return {
      data: data.map((n) => this.toResponse(n)),
      page: Math.floor(offset / limit) + 1,
      limit,
      total,
      unreadCount: total,
    };
  }

  /**
   * Just the badge number — one COUNT over the caller's own rows, no rows and
   * no actor join. The navbar polls this every 30s instead of pulling the
   * inbox list, which is only fetched when the bell is opened.
   */
  async count(userId: number): Promise<{ count: number }> {
    return { count: await this.notifications.count({ where: { userId } }) };
  }

  /**
   * Reading one = it is gone. A non-owner's id matches nothing, so they get
   * `null` back and the row stays put (the old mark-read shape).
   */
  async remove(userId: number, id: number) {
    const result = await this.notifications.delete({ id, userId });
    return result.affected ? { deleted: true } : null;
  }

  /** The inbox header button — clears every unread row of this account. */
  async removeAll(userId: number) {
    const result = await this.notifications.delete({ userId });
    return { deleted: result.affected ?? 0 };
  }

  private toResponse(n: Notification) {
    return {
      id: n.id,
      // the name is joined in at read time (the actor may be gone → null)
      actorName: n.actor?.name ?? null,
      action: n.type,
      target: n.title,
      context: n.context,
      link: n.link,
      // lets the popover rebuild a deep link for old rows whose stored link
      // still points at the removed "/issues" page
      issueId: n.issueId,
      createdAt: n.createdAt,
    };
  }
}
