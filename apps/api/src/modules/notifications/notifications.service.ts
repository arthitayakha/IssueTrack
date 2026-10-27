import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Notification } from "./entities/notification.entity";

export type NotificationAction =
  | "created"
  | "assigned"
  | "commented"
  | "moved"
  | "edited"
  | "deleted"
  | "restored";

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
  ) {}

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
          link: input.link ?? "/issues",
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
   */
  async notifyIssueEvent(params: {
    issue: NotificationIssueTarget;
    action: NotificationAction;
    recipients: Array<number | null | undefined>;
    actor?: NotificationActor | null;
  }): Promise<void> {
    const { issue, action, recipients, actor } = params;
    const userIds = new Set<number>();
    for (const id of recipients) {
      if (typeof id === "number" && id > 0 && id !== actor?.actorId) {
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
        link: "/issues",
        actor,
      });
    }
  }

  /** Recent notifications for one user + unread badge count, in one call. */
  async list(userId: number, limit = 50) {
    const [data, unreadCount] = await Promise.all([
      this.notifications.find({
        where: { userId },
        order: { createdAt: "DESC", id: "DESC" },
        take: Math.min(Math.max(limit, 1), 200),
      }),
      this.notifications.count({
        where: { userId, isRead: false, isArchived: false },
      }),
    ]);
    return { data: data.map((n) => this.toResponse(n)), unreadCount };
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
      createdAt: n.createdAt,
      isRead: n.isRead,
      isArchived: n.isArchived,
    };
  }
}
