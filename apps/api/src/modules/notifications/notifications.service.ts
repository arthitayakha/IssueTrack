import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, Repository } from "typeorm";
import { Notification } from "./entities/notification.entity";
import { User } from "../auth/entities/user.entity";

export type NotificationAction =
  | "created"
  | "assigned"
  | "commented"
  | "moved"
  | "edited"
  | "deleted"
  | "restored"
  // automation-rule changes — shown as "created rule X" / "updated rule X"
  | "rule_created"
  | "rule_updated";

/** Popover tabs — inbox = unread, general = read, archived = archived. */
export type NotificationTab = "inbox" | "general" | "archived";

/** Structural subset of ActivityLogsService's ActorInfo (avoids a circular import). */
export interface NotificationActor {
  actorId?: number | null;
  actorName?: string | null;
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
          actorId: input.actor?.actorId ?? null,
          actorName: input.actor?.actorName ?? null,
          context: input.context ?? null,
          link: input.link ?? this.issueLink(input.issueId),
          type: input.action,
          title: input.title.slice(0, 200),
          message: `${input.actor?.actorName ?? "System"}: ${input.action} ${input.title}`,
          isRead: false,
          isArchived: false,
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

  /** Rows for one tab (or every row when `tab` is omitted — the legacy shape). */
  private tabWhere(userId: number, tab?: NotificationTab): FindOptionsWhere<Notification> {
    const base: FindOptionsWhere<Notification> = { userId };
    if (tab === "inbox") return { ...base, isRead: false, isArchived: false };
    if (tab === "general") return { ...base, isRead: true, isArchived: false };
    if (tab === "archived") return { ...base, isArchived: true };
    return base;
  }

  /**
   * One page of notifications for one user, filtered on the server per tab so
   * the popover can scroll-load 5 rows at a time (like the board columns).
   * `unreadCount` / `counts` are always totals over the whole account — never
   * derived from the loaded rows — so the badges stay correct while paginating.
   */
  async list(
    userId: number,
    options: { limit?: number; offset?: number; tab?: NotificationTab } = {},
  ) {
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);
    const [data, total, inboxCount, generalCount, archivedCount] = await Promise.all([
      this.notifications.find({
        where: this.tabWhere(userId, options.tab),
        order: { createdAt: "DESC", id: "DESC" },
        take: limit,
        skip: offset,
      }),
      this.notifications.count({ where: this.tabWhere(userId, options.tab) }),
      this.notifications.count({ where: this.tabWhere(userId, "inbox") }),
      this.notifications.count({ where: this.tabWhere(userId, "general") }),
      this.notifications.count({ where: this.tabWhere(userId, "archived") }),
    ]);
    return {
      data: data.map((n) => this.toResponse(n)),
      page: Math.floor(offset / limit) + 1,
      limit,
      total,
      unreadCount: inboxCount,
      counts: { inbox: inboxCount, general: generalCount, archived: archivedCount },
    };
  }

  async markRead(userId: number, id: number) {
    await this.notifications.update(
      { id, userId },
      { isRead: true, readAt: new Date() },
    );
    const updated = await this.notifications.findOne({ where: { id, userId } });
    return updated ? this.toResponse(updated) : null;
  }

  async markAllRead(userId: number) {
    const result = await this.notifications.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }

  async archive(userId: number, id: number) {
    await this.notifications.update({ id, userId }, { isArchived: true });
    const updated = await this.notifications.findOne({ where: { id, userId } });
    return updated ? this.toResponse(updated) : null;
  }

  private toResponse(n: Notification) {
    return {
      id: n.id,
      actorName: n.actorName,
      action: n.type,
      target: n.title,
      context: n.context,
      link: n.link,
      // lets the popover rebuild a deep link for old rows whose stored link
      // still points at the removed "/issues" page
      issueId: n.issueId,
      createdAt: n.createdAt,
      isRead: n.isRead,
      isArchived: n.isArchived,
    };
  }
}
