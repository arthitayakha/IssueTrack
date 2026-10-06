import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ActivityLog } from "./entities/activity-log.entity";

@Injectable()
export class ActivityLogsService {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityLogs: Repository<ActivityLog>,
  ) {}

  async findByIssue(issueId: number) {
    const logs = await this.activityLogs.find({
      where: { entityId: issueId },
      order: { createdAt: "ASC" },
    });
    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      actorId: log.actorId,
      actorName: log.actorName,
      actorRole: log.actorRole,
      boardId: log.boardId,
      entityId: log.entityId,
      detail: log.detail,
      createdAt: log.createdAt,
    }));
  }
}
