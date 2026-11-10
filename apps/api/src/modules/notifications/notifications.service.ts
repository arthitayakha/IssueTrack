import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Notification } from "./entities/notification.entity";
import { User } from "../auth/entities/user.entity";
import { MailService } from "../mail/mail.service";

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
  | "rule_deleted"
  // a card sat past a board-policy rule's days — the 09:00 sweep rings this
  // once per sitting (assignee + every admin)
  | "stale"
  // app expiry — not an issue at all, so it points at the apps tab
  | "app_expiring" // ใกล้หมดอายุ (≤30 วัน)
  | "app_expired" // หมดอายุแล้ว
  // MA quota ran out (used ≥ ma_hours of the pair) — rings once per episode
  // from the time-entry hook, to the company's customers + every admin
  | "ma_depleted";

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

/**
 * The two milestone columns that also e-mail the reporter (รับเรื่องแล้ว /
 * เสร็จสิ้น) — ids only, names may be renamed by hand. A caller that knows
 * the live column name passes it; these are the fallback copy.
 */
const STATUS_EMAIL_IDS = new Set<number>([PENDING_STATUS_ID, DONE_STATUS_ID]);
const STATUS_EMAIL_DEFAULT_NAMES: Record<number, string> = {
  [PENDING_STATUS_ID]: "รอดำเนินการ",
  [DONE_STATUS_ID]: "เสร็จสิ้น",
};

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
  /** `ISS-001`-style number — only used in the milestone e-mail copy. */
  issueNumber?: string | null;
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
    private readonly mail: MailService,
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
   *
   * The two milestone columns (รับเรื่อง = id 2, เสร็จสิ้น = id 4) also e-mail
   * the reporter — same trigger, same recipient policy, see `emailMilestone`.
   */
  async notifyStatusChange(params: {
    issue: NotificationIssueTarget;
    statusId: number | null;
    /** The live column name for the e-mail copy (admins may rename columns). */
    statusName?: string | null;
    actor?: NotificationActor | null;
  }): Promise<void> {
    const { issue, statusId, statusName, actor } = params;
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
        await this.notifyIssueEvent({
          issue,
          action: "status_pending",
          recipients: people,
          actor,
        });
        return this.emailMilestone(issue, statusId, statusName, actor);
      case IN_PROGRESS_STATUS_ID:
        return this.notifyIssueEvent({
          issue,
          action: "in_progress",
          recipients: people,
          actor,
        });
      case DONE_STATUS_ID:
        await this.notifyIssueEvent({
          issue,
          action: "completed",
          recipients: people,
          actor,
          alsoAdmins: true,
        });
        return this.emailMilestone(issue, statusId, statusName, actor);
      default:
        break;
    }
    return this.notifyIssueEvent({ issue, action: "moved", recipients: people, actor });
  }

  /**
   * The e-mail twin of a milestone move — to the reporter only, best-effort
   * like `notify()`: a missing reporter/address is a no-op, a broken lookup
   * only logs, and the SMTP send itself is fire-and-forget so a slow or dead
   * server can never stall the drag that triggered it (the in-app row above
   * is already written by then).
   */
  private async emailMilestone(
    issue: NotificationIssueTarget,
    statusId: number,
    statusName?: string | null,
    actor?: NotificationActor | null,
  ): Promise<void> {
    if (!STATUS_EMAIL_IDS.has(statusId)) return;
    const customerId = issue.customerId;
    // no reporter on the card, or the reporter is the actor → nothing to say
    // (same "never notify yourself" rule the in-app rows follow)
    if (!customerId || customerId === actor?.actorId) return;
    try {
      const customer = await this.users.findOne({ where: { id: customerId } });
      if (!customer?.email) return;
      void this.mail
        .sendIssueStatusUpdate({
          to: customer.email,
          name: customer.name,
          title: issue.title,
          issueNumber: issue.issueNumber ?? null,
          statusName: statusName?.trim() || STATUS_EMAIL_DEFAULT_NAMES[statusId],
          url: `${this.webBase()}${this.issueLink(issue.id)}`,
        })
        .catch((error) => this.logger.warn(`issue status mail failed: ${(error as Error).message}`));
    } catch (error) {
      this.logger.warn(`could not load reporter for status mail: ${(error as Error).message}`);
    }
  }

  /** Absolute base for links inside e-mails — same env the reset mail uses. */
  private webBase(): string {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
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
   * The bell for a card that sat past an `issue.notify_stale` rule's day
   * count — to the assignee (the person who can clear it) and every active
   * admin, deduplicated. Called by the 09:00 sweep only, which stamps
   * `stale_notified_at` right after, so a sitting rings exactly once.
   * No actor: the system is the sender, so nobody is skipped.
   */
  async notifyStaleCard(params: {
    issue: NotificationIssueTarget;
    statusName: string | null;
    days: number;
  }): Promise<void> {
    const { issue, statusName, days } = params;
    const ids = new Set<number>();
    if (issue.programmerId && issue.programmerId > 0) ids.add(issue.programmerId);
    // fan-out is a bonus — if the admin list cannot be read, the assignee
    // still hears about it rather than losing the bell entirely
    try {
      for (const id of await this.adminIds()) ids.add(id);
    } catch (error) {
      this.logger.warn(`could not load admins for stale fan-out: ${(error as Error).message}`);
    }
    const context = `${statusName ?? "?"} · ${days} วัน`;
    for (const userId of ids) {
      await this.notify({
        userId,
        action: "stale",
        title: issue.title,
        context,
        issueId: issue.id,
        link: this.issueLink(issue.id),
      });
    }
  }

  /**
   * **"ชั่วโมง MA หมดแล้ว"** — ผู้รับ = ลูกค้า active ของบริษัทคู่นั้น
   * (`users.company_id` = คู่, บทบาท `customer`) **+ แอดมินทุกคน** (dedupe,
   * แอดมินชนะถ้าซ้ำ), ไม่มี actor (ระบบเป็นคนส่ง) · เรียกโดย `MaUsageService`
   * หลังกรอกเวลาจริงทำให้ ใช้ไป ≥ `ma_hours` — **ครั้งเดียวต่อรอบ** (latch
   * `ma_notified_at` อยู่ที่แถวล่าสุดของคู่)
   *
   * สองช่องทางพร้อมกัน: in-app (`notify()`) + อีเมล (`sendMaDepleted`) ทั้งคู่
   * best-effort — รายชื่อผู้รับพัง/SMTP พัง ไม่กระทบ request ที่กรอกเวลา
   *
   * **ลิงก์ต่างกันตามคน**: แอดมิน → `/systems` (ไปต่ออายุ/ซื้อชม. ได้) ·
   * ลูกค้า → `/boards` เพราะไม่มี `system.view` — ชี้ไป `/systems` เท่ากับ
   * พาไปกำแพง permission
   */
  async notifyMaDepleted(params: {
    companyId: number;
    appName: string;
    companyName: string;
    maHours: number;
    /** ใช้ไป (ชม.) — ปัด 1 ตำแหน่งตอนแสดงเท่านั้น */
    usedHours: number;
  }): Promise<void> {
    try {
      const { companyId, appName, companyName, maHours, usedHours } = params;
      const title = [appName, companyName].filter(Boolean).join(" ");
      const used = Math.round(usedHours * 10) / 10;
      const context = `ใช้ไป ${used} / ${maHours} ชม.`;

      // ลูกค้าของบริษัทคู่นั้น — ถ้าอ่านไม่ได้ แอดมินยังได้ยิน (best-effort)
      let customers: User[] = [];
      try {
        customers = await this.users.find({
          where: { isActive: true, companyId, role: { name: "customer" } },
          relations: ["role"],
        });
      } catch (error) {
        this.logger.warn(`could not load company customers for MA bell: ${(error as Error).message}`);
      }

      // `kind` = จะชี้ลิงก์ไปไหน — แอดมินทับลูกค้าถ้าใครเป็นทั้งคู่
      const recipients = new Map<number, "admin" | "customer">();
      for (const u of customers) recipients.set(u.id, "customer");
      try {
        for (const u of await this.users.find({
          where: { isActive: true, role: { name: "admin" } },
          relations: ["role"],
        })) {
          recipients.set(u.id, "admin");
        }
      } catch (error) {
        this.logger.warn(`could not load admins for MA bell: ${(error as Error).message}`);
      }
      if (recipients.size === 0) return;

      // อีเมลต้องการ address/ชื่อ — โหลดเฉพาะผู้รับที่มีในลิสต์ (best-effort)
      const withEmail = await this.users.find({
        where: { id: In([...recipients.keys()]) },
      });
      const people = new Map(withEmail.map((u) => [u.id, u]));

      for (const [userId, kind] of recipients) {
        const link = kind === "admin" ? "/systems" : "/boards";
        await this.notify({ userId, action: "ma_depleted", title, context, link });

        const person = people.get(userId);
        if (!person?.email) continue;
        void this.mail
          .sendMaDepleted({
            to: person.email,
            name: person.name,
            appName,
            companyName,
            maHours,
            usedHours: used,
            url: `${this.webBase()}${link}`,
          })
          .catch((error) => this.logger.warn(`ma depleted mail failed: ${(error as Error).message}`));
      }
    } catch (error) {
      this.logger.warn(`ma depletion notification failed: ${(error as Error).message}`);
    }
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
