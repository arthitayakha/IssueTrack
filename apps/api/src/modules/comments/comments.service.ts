import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Comment } from "./entities/comment.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { Issue } from "../issues/entities/issue.entity";
import { ActorInfo } from "../activity-logs/activity-logs.service";
import { PermissionsService } from "../permissions/permissions.service";
import { NotificationsService } from "../notifications/notifications.service";
import { paginate, PaginationParams } from "../../common/pagination";
import type { AuthUser } from "../auth/auth-user";
import { loadVisibleIssue } from "../issues/issue-access";

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly comments: Repository<Comment>,
    @InjectRepository(ActivityLog)
    private readonly activityLogs: Repository<ActivityLog>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    private readonly permissions: PermissionsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * คอมเมนต์ของงาน — **เช็คขอบเขตของงานก่อน** (`issue-access.ts`): ผู้ไม่เกี่ยว
   * (ไม่ใช่ผู้รับผิดชอบ/ผู้แจ้ง และไม่มี `issue.all.view`) ได้ 404 ทั้งอ่านและเขียน
   * · งานไม่มีจริงก็ 404 (เดิม list คืนว่าง / insert แล้วชน FK = 500)
   */
  async findByIssue(issueId: number, params: PaginationParams, user: AuthUser) {
    await loadVisibleIssue(this.issues, this.permissions, issueId, user);
    const comments = await this.comments.find({
      where: { issueId },
      order: { createdAt: "ASC" },
      relations: ["user", "user.role"],
    });
    const mapped = comments.map((c) => this.toResponse(c));
    return paginate(mapped, params);
  }

  /**
   * **โหลดงาน + เช็คขอบรก่อน insert** — เดิมบันทึกคอมเมนต์ก่อนค่อยหางาน
   * (id ปลอม = FK error 500, งานคนอื่น = เขียนได้ = write-IDOR) — ตอนนี้ทั้งสอง
   * เป็น 404 ก่อนเขียนอะไรทั้งสิ้น และงานที่โหลดไว้ใช้ต่อทั้ง notify + rules
   * (ไม่ต้อง findOne รอบที่ 2)
   */
  async create(issueId: number, content: string, user: AuthUser, actor?: ActorInfo | null) {
    const userId = Number(user.id);
    const issue = await loadVisibleIssue(
      this.issues,
      this.permissions,
      issueId,
      user,
      ["category"],
    );
    const comment = this.comments.create({
      issueId,
      comment: content,
      userId,
    });
    const saved = await this.comments.save(comment);
    await this.logActivity({
      action: "comment.created",
      entityId: issueId,
      detail: JSON.stringify({ commentId: comment.id }),
      actor,
    });
    // notify assignee + reporter about the new comment (never the commenter);
    // on a card nobody has picked up yet the admins hear it too, or a customer
    // question would land in front of no one
    await this.notifications.notifyIssueEvent({
      issue,
      action: "commented",
      recipients: [issue.programmerId, issue.customerId],
      actor,
      alsoAdmins: !issue.programmerId,
    });
    const fresh = await this.loadWithUser(saved.id);
    return this.toResponse(fresh ?? saved);
  }

  async update(id: number, content: string, userId: number, actor?: ActorInfo | null) {
    const comment = await this.comments.findOne({ where: { id } });
    if (!comment) {
      throw new NotFoundException(`Comment ${id} not found`);
    }
    if (comment.userId !== userId) {
      throw new ForbiddenException("Cannot edit another user's comment");
    }
    comment.comment = content;
    const saved = await this.comments.save(comment);
    await this.logActivity({
      action: "comment.updated",
      entityId: comment.issueId,
      detail: JSON.stringify({ commentId: id }),
      actor,
    });
    const fresh = await this.loadWithUser(saved.id);
    return this.toResponse(fresh ?? saved);
  }

  async remove(
    id: number,
    userId: number,
    roleId: number | null,
    positionId: number | null,
    actor?: ActorInfo | null,
  ) {
    const comment = await this.comments.findOne({ where: { id } });
    if (!comment) {
      throw new NotFoundException(`Comment ${id} not found`);
    }
    const canDeleteAny = await this.permissions.hasPermission(
      roleId,
      "comment.all.delete",
      positionId,
    );
    if (comment.userId !== userId && !canDeleteAny) {
      throw new ForbiddenException("Cannot delete another user's comment");
    }
    await this.comments.delete(id);
    await this.logActivity({
      action: "comment.deleted",
      entityId: comment.issueId,
      detail: JSON.stringify({ commentId: id }),
      actor,
    });
    return { deleted: true };
  }

  private async logActivity(data: {
    action: string;
    entityId: number;
    detail: string;
    actor?: ActorInfo | null;
  }) {
    await this.activityLogs.save(
      this.activityLogs.create({
        action: data.action,
        entityId: data.entityId,
        detail: data.detail,
        // only the id is stored — name/role come off `users` at read time
        actorId: data.actor?.actorId ?? null,
      }),
    );
  }

  private loadWithUser(id: number): Promise<Comment | null> {
    return this.comments.findOne({ where: { id }, relations: ["user", "user.role"] });
  }

  private toResponse(comment: Comment) {
    return {
      id: comment.id,
      content: comment.comment,
      issueId: comment.issueId,
      authorId: comment.userId,
      authorName: comment.user?.name ?? null,
      authorRole: comment.user?.role?.name ?? null,
      createdAt: comment.createdAt,
    };
  }
}
