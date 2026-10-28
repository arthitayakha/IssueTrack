import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Like, Not, Repository } from "typeorm";
import { ActivityLog } from "./entities/activity-log.entity";

export interface ActorInfo {
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
}

@Injectable()
export class ActivityLogsService {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityLogs: Repository<ActivityLog>,
  ) {}

  async findByIssue(issueId: number) {
    const logs = await this.activityLogs.find({
      where: {
        entityId: issueId,
        // `rule.*` audit rows share the entityId column — a rule #5 must not
        // show up in issue #5's card history
        action: Not(Like("rule.%")),
      },
      order: { createdAt: "ASC" },
    });
    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      actorId: log.actorId,
      actorName: log.actorName,
      actorRole: log.actorRole,
      entityId: log.entityId,
      detail: log.detail,
      createdAt: log.createdAt,
    }));
  }
}
