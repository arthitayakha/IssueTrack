import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Notification,
  type NotificationPriority,
} from "./entities/notification.entity";
import { User } from "../auth/entities/user.entity";
import { IssuePriority } from "../issue-priorities/entities/issue-priority.entity";
import { MailService } from "../mail/mail.service";
import { PermissionsService } from "../permissions/permissions.service";

export type { NotificationPriority };

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
  | "ma_depleted"
  // confirmation rows after renew / buying hours — in-app only, no mail,
  // no "ติดต่อ..." hint (the customer just did the thing the hint asks for)
  | "app_renewed"
  | "app_hours_purchased";

/**
 * ระดับความสำคัญของ**ชนิดที่ไม่ผูกการ์ด** — hardcode ที่นี่ที่เดียว (ข้อตกลง:
 * ไม่มีตาราง config ไม่มี UI ตั้งค่า — แก้ภายหลังก็แก้โค้ดเท่านั้น)
 *
 * การ์ดที่ผูก `issue_id` **ไม่ได้ map จากตรงนี้** — ยืม `issues.priority_id`
 * ผ่าน `priorityForIssue()` แทน (Critical/High → สูง, Medium → กลาง, Low → ต่ำ,
 * ไม่ได้ตั้งค่า → กลาง), และ `notify()` ให้ `input.priority` มาก่อนเสมอ
 */
const FIXED_PRIORITY: Partial<Record<NotificationAction, NotificationPriority>> = {
  // สองอันนี้คือ "ต้องจัดการเดี๋ยวนี้" — เตือนซ้ำ 7 วัน + อีเมลวันแรก
  ma_depleted: "high",
  app_expired: "high",
  app_expiring: "medium",
  // เสียงของการแก้กฎทุกวัน — 483/921 แถวเป็น rule_updated, เตือนวันเดียวจบ
  rule_created: "low",
  rule_updated: "low",
  rule_deleted: "low",
  // confirmations sort below the warnings they resolve
  app_renewed: "low",
  app_hours_purchased: "low",
};

/**
 * ชื่อความสำคัญ → ระดับการแจ้งเตือน — **match แบบ exact ตามชื่อที่แก้ได้เอง**,
 * เหมือน `PRIORITY_COLORS` ฝั่งบอร์ด (board ใช้ `name.toLowerCase()` lookup เดียวกัน)
 * · ชื่อที่ไม่รู้จัก → `medium` (fail-open กลาง ไม่ใช่เงียบ ไม่ใช่กรี๊ด)
 */
const ISSUE_PRIORITY_LEVELS: Record<string, NotificationPriority> = {
  critical: "high",
  urgent: "high",
  high: "high",
  สูง: "high",
  วิกฤต: "high",
  ด่วน: "high",
  low: "low",
  ต่ำ: "low",
  medium: "medium",
  กลาง: "medium",
};

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
  /**
   * ข้ามการแปลงอัตโนมัติ — ผู้ช่วยที่ถือ `issue` อยู่แล้วส่งค่าที่แปลงจาก
   * `issues.priority_id` มาให้ (แปลงครั้งเดียวต่อ event ไม่ใช่ต่อผู้รับ)
   */
  priority?: NotificationPriority;
}

export interface NotificationIssueTarget {
  id: number;
  title: string;
  programmerId?: number | null;
  customerId?: number | null;
  category?: { name?: string } | null;
  /** ใช้แปลงความสำคัญของการ์ด → ของแจ้งเตือน (optional: ไม่ส่งก็ fail-open กลาง) */
  priorityId?: number | null;
}

/** A contract event's audience — customers of the pair + every admin. */
interface ContractRecipient {
  user: User;
  kind: "admin" | "customer";
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
    @InjectRepository(IssuePriority)
    private readonly priorities: Repository<IssuePriority>,
    private readonly permissions: PermissionsService,
  ) {}

  /** Deep link straight to the card's detail dialog; the plain board when there is no issue. */
  private issueLink(issueId?: number | null): string {
    return issueId ? `/boards?issue=${issueId}` : "/boards";
  }

  /**
   * ความสำคัญของบัตร → ของแจ้งเตือน — แปลง **ครั้งเดียวต่อ event** (ก่อนวนหาผู้รับ)
   * · `priorityId` ว่าง = `undefined` → `notify()` ใช้ FIXED_PRIORITY/กลางตามเดิม
   * · โหลดชื่อพัง/ชื่อไม่รู้จัก = fail-open `medium` — การแจ้งเตือนห้ามหายเพราะ lookup
   */
  private async priorityForIssue(
    priorityId?: number | null,
  ): Promise<NotificationPriority | undefined> {
    if (!priorityId) return undefined;
    try {
      const priority = await this.priorities.findOne({ where: { id: priorityId } });
      if (!priority) return undefined;
      return ISSUE_PRIORITY_LEVELS[priority.name.trim().toLowerCase()] ?? "medium";
    } catch (error) {
      this.logger.warn(
        `could not resolve issue priority ${priorityId}: ${(error as Error).message}`,
      );
      return undefined;
    }
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
   * **One audience for every contract event** — expiry (30/7/expired), MA
   * depletion and the renew / buy-hours confirmations all read from here so
   * "who hears about a company's contract" can never drift between them:
   * active customers of `companyId` + every active admin, deduped (admin wins
   * if someone somehow holds both), ordered by id so the contact hint is
   * deterministic. Fail-open: a broken customer lookup still leaves admins in
   * the list, and vice versa.
   */
  private async contractRecipients(companyId: number): Promise<ContractRecipient[]> {
    let customers: User[] = [];
    try {
      customers = await this.users.find({
        where: { isActive: true, companyId, role: { name: "customer" } },
        relations: ["role"],
        order: { id: "ASC" },
      });
    } catch (error) {
      this.logger.warn(`could not load company customers: ${(error as Error).message}`);
    }
    let admins: User[] = [];
    try {
      admins = await this.users.find({
        where: { isActive: true, role: { name: "admin" } },
        relations: ["role"],
        order: { id: "ASC" },
      });
    } catch (error) {
      this.logger.warn(`could not load admins: ${(error as Error).message}`);
    }
    const byId = new Map<number, ContractRecipient>();
    for (const user of customers) byId.set(user.id, { user, kind: "customer" });
    for (const user of admins) byId.set(user.id, { user, kind: "admin" });
    return [...byId.values()];
  }

  /**
   * `/systems` is the contract's home for everyone who can see it (a customer
   * with a position that lacks `system.view` would hit a permission wall
   * there, so they fall back to `/boards`). Admins always go straight there.
   */
  private async contractLink(user: User, kind: "admin" | "customer"): Promise<string> {
    if (kind === "admin") return "/systems";
    try {
      if (
        await this.permissions.hasPermission(
          user.roleId ?? null,
          "system.view",
          user.positionId ?? null,
        )
      ) {
        return "/systems";
      }
    } catch (error) {
      this.logger.warn(`could not check system.view for contract link: ${(error as Error).message}`);
    }
    return "/boards";
  }

  /**
   * The "ติดต่อ..." line for customer copies — admin e-mail(s) from the DB for
   * now (the senior may supply an official address later; change it here and
   * every contract event follows). The short version uses the first admin so
   * the inbox's one-line context stays readable; the mail lists them all.
   */
  private contactHint(
    admins: User[],
    purpose: string,
  ): { inApp: string; full: string } {
    const emails = admins
      .map((u) => u.email)
      .filter((email): email is string => Boolean(email));
    if (emails.length === 0) {
      const fallback = `ติดต่อผู้ดูแลระบบเพื่อ${purpose}`;
      return { inApp: fallback, full: fallback };
    }
    return {
      inApp: `ติดต่อ: ${emails[0]}`,
      full: `ติดต่อผู้ดูแลระบบ: ${emails.join(", ")}`,
    };
  }

  /** Customer rows get the contact hint appended; admin rows stay as they were. */
  private withContact(context: string, kind: "admin" | "customer", hint: string): string {
    return kind === "customer" ? `${context} • ${hint}` : context;
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
          // `notifications.context` is varchar(100) — the contract hints append
          // to it, so trim here rather than risk a DB error on a long title
          context: input.context?.slice(0, 100) ?? null,
          link: input.link ?? this.issueLink(input.issueId),
          type: input.action,
          title: input.title.slice(0, 200),
          // explicit (from the card) → hardcoded system map → medium
          priority: input.priority ?? FIXED_PRIORITY[input.action] ?? "medium",
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
    // ครั้งเดียวต่อ event — ทุกผู้รับของ event นี้ได้ระดับเดียวกันเป๊ะ
    const priority = userIds.size > 0 ? await this.priorityForIssue(issue.priorityId) : undefined;
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
        priority,
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
    // same rule as every card-linked event: resolved once, applied to the fan-out
    const priority = await this.priorityForIssue(issue.priorityId);
    for (const userId of ids) {
      await this.notify({
        userId,
        action: "stale",
        title: issue.title,
        context,
        issueId: issue.id,
        link: this.issueLink(issue.id),
        priority,
      });
    }
  }

  /**
   * **วันหมดอายุของสัญญา → ลูกค้าของคู่นั้น + แอดมินทุกคน** — เดิมส่งแค่แอดมิน
   * (`notifyAdmins`) ทำให้ลูกค้าไม่มีทางรู้ว่าสัญญาของตัวเองใกล้/หมดอายุ · คง
   * latch `expiry_notified` เดิม (ครั้งเดียวต่อ 30/7/expired ต่อคู่) ที่
   * `AppExpiryService` เป็นคนคุม — ตรงนี้ไม่ยิงซ้ำเอง
   *
   * แถวของลูกค้าต่อ "ติดต่อ..." ด้วยอีเมลแอดมิน (ดู `contactHint`) ส่วนแอดมิน
   * เห็นข้อความเดิม · ส่งอีเมลภาษาไทยด้วย (`sendAppExpiry`) แบบ fire-and-forget
   */
  async notifyAppExpiry(params: {
    companyId: number;
    appName: string;
    companyName: string;
    action: "app_expiring" | "app_expired";
    title: string;
    context: string;
    daysLeft: number | null;
  }): Promise<void> {
    try {
      const recipients = await this.contractRecipients(params.companyId);
      if (recipients.length === 0) return;
      const contact = this.contactHint(
        recipients.filter((r) => r.kind === "admin").map((r) => r.user),
        "ต่ออายุ",
      );

      for (const { user, kind } of recipients) {
        const link = await this.contractLink(user, kind);
        await this.notify({
          userId: user.id,
          action: params.action,
          title: params.title,
          context: this.withContact(params.context, kind, contact.inApp).slice(0, 100),
          link,
        });
        if (!user.email) continue;
        void this.mail
          .sendAppExpiry({
            to: user.email,
            name: user.name,
            appName: params.appName,
            companyName: params.companyName,
            stage: params.action === "app_expired" ? "expired" : "expiring",
            daysLeft: params.daysLeft,
            contact: kind === "customer" ? contact.full : null,
            url: `${this.webBase()}${link}`,
          })
          .catch((error) => this.logger.warn(`app expiry mail failed: ${(error as Error).message}`));
      }
    } catch (error) {
      this.logger.warn(`app expiry notification failed: ${(error as Error).message}`);
    }
  }

  /**
   * **"ชั่วโมง MA หมดแล้ว"** — audience เดียวกับวันหมดอายุ (ลูกค้าบริษัทคู่นั้น
   * + แอดมิน) ผ่าน `contractRecipients` · เรียกโดย `MaUsageService` หลังกรอก
   * เวลาจริงทำให้ ใช้ไป ≥ `ma_hours` — **ครั้งเดียวต่อรอบ** (latch
   * `ma_notified_at` อยู่ที่แถวล่าสุดของคู่)
   *
   * แถวลูกค้าต่อ "ติดต่อ..." (อีเมลแอดมิน) ทั้งในกล่องเข้าและในอีเมล; ลิงก์
   * ทุกคนไป `/systems` (ลูกค้าเป็น read-only และเห็นเฉพาะสัญญาตัวเอง) ·
   * in-app + mail เป็น best-effort — SMTP พังไม่กระทบ request ที่กรอกเวลา
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
      const recipients = await this.contractRecipients(companyId);
      if (recipients.length === 0) return;
      const contact = this.contactHint(
        recipients.filter((r) => r.kind === "admin").map((r) => r.user),
        "ซื้อชั่วโมงเพิ่ม",
      );
      const title = [appName, companyName].filter(Boolean).join(" ");
      const used = Math.round(usedHours * 10) / 10;
      const context = `ใช้ไป ${used} / ${maHours} ชม.`;

      for (const { user, kind } of recipients) {
        const link = await this.contractLink(user, kind);
        await this.notify({
          userId: user.id,
          action: "ma_depleted",
          title,
          context: this.withContact(context, kind, contact.inApp).slice(0, 100),
          link,
        });
        if (!user.email) continue;
        void this.mail
          .sendMaDepleted({
            to: user.email,
            name: user.name,
            appName,
            companyName,
            maHours,
            usedHours: used,
            contact: kind === "customer" ? contact.full : null,
            url: `${this.webBase()}${link}`,
          })
          .catch((error) => this.logger.warn(`ma depleted mail failed: ${(error as Error).message}`));
      }
    } catch (error) {
      this.logger.warn(`ma depletion notification failed: ${(error as Error).message}`);
    }
  }

  /**
   * **ต่ออายุ / ซื้อชั่วโมงสำเร็จ** — แถวแจ้งเตือนในกล่องเข้าให้ลูกค้าบริษัทนั้น
   * + แอดมินเหมือนเหตุการณ์อื่นของสัญญา แต่**ไม่ส่งอีเมล** (ผู้ใช้เพิ่งกดทำ
   * รายการนั้นเอง ไม่ต้องให้ "ติดต่อ..." ตามไปด้วย) · priority `low` อยู่ใต้
   * แถวเตือนที่มันไปแก้ · best-effort เหมือน `notify()`
   */
  async notifyContractChange(params: {
    companyId: number;
    appName: string;
    companyName: string;
    action: "app_renewed" | "app_hours_purchased";
    context: string;
  }): Promise<void> {
    try {
      const recipients = await this.contractRecipients(params.companyId);
      const title = [params.appName, params.companyName].filter(Boolean).join(" ");
      for (const { user, kind } of recipients) {
        const link = await this.contractLink(user, kind);
        await this.notify({
          userId: user.id,
          action: params.action,
          title,
          context: params.context.slice(0, 100),
          link,
        });
      }
    } catch (error) {
      this.logger.warn(`contract change notification failed: ${(error as Error).message}`);
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
    // สูง → กลาง → ต่ำ แล้วค่อยใหม่สุดก่อน — `priority` เป็น varchar ซึ่งเรียง
    // alphabetical ได้ `high < low < medium` (ผิดทิศ) จึงต้อง CASE กำหนด rank เอง;
    // ทำที่ server เพราะหน้าจอโหลดทีละ 20 แถว (client sort จะขัด pagination)
    //
    // ⚠️ ใช้ `.limit/.offset` — **ไม่ใช่ `.take/.skip`**: take/skip + join จะสลับไป
    // ใช้กลยุทธ์ "ดึง id ก่อน 2 รอบ" ของ TypeORM ซึ่งแปลงนิพจน์ ORDER BY ทุกตัว
    // โดยตัดข้อความก่อนจุดแรกเป็น alias → `CASE n.priority` ถูกอ่านเป็น alias
    // "CASE n" แล้วโยน "alias was not found" — กับ join ฝั่ง to-one (actor) LIMIT
    // ตรง ๆ ถูกต้องอยู่แล้ว ไม่มีทางคูงแถว
    const [data, total] = await this.notifications
      .createQueryBuilder("n")
      .leftJoinAndSelect("n.actor", "actor")
      .where("n.user_id = :userId", { userId })
      .orderBy("CASE n.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END", "ASC")
      .addOrderBy("n.created_at", "DESC")
      .addOrderBy("n.id", "DESC")
      .offset(offset)
      .limit(limit)
      .getManyAndCount();
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
      // chip colour + the 7/3/1-day reminder window are both keyed off this
      priority: n.priority ?? "medium",
    };
  }
}
