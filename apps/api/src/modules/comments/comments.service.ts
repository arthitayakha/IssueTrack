import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Comment } from "./entities/comment.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { ActorInfo } from "../activity-logs/activity-logs.service";
import { PermissionsService } from "../permissions/permissions.service";
import { paginate, PaginationParams } from "../../common/pagination";

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly comments: Repository<Comment>,
    @InjectRepository(ActivityLog)
    private readonly activityLogs: Repository<ActivityLog>,
    private readonly permissions: PermissionsService,
  ) {}

  async findByIssue(issueId: number, params: PaginationParams) {
    const comments = await this.comments.find({
      where: { issueId },
      order: { createdAt: "ASC" },
      relations: ["user"],
    });
    const mapped = comments.map((c) => this.toResponse(c));
    return paginate(mapped, params);
  }

  async create(issueId: number, content: string, userId: number, actor?: ActorInfo | null) {
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
        actorId: data.actor?.actorId ?? null,
        actorName: data.actor?.actorName ?? null,
        actorRole: data.actor?.actorRole ?? null,
      }),
    );
  }

  private loadWithUser(id: number): Promise<Comment | null> {
    return this.comments.findOne({ where: { id }, relations: ["user"] });
  }

  private toResponse(comment: Comment) {
    return {
      id: comment.id,
      content: comment.comment,
      issueId: comment.issueId,
      authorId: comment.userId,
      authorName: comment.user?.name ?? null,
      createdAt: comment.createdAt,
    };
  }
}
