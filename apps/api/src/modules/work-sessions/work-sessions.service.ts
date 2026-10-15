import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { WorkSession } from "./entities/work-session.entity";
import { Issue } from "../issues/entities/issue.entity";

@Injectable()
export class WorkSessionsService {
  constructor(
    @InjectRepository(WorkSession)
    private readonly workSessions: Repository<WorkSession>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
  ) {}

  async start(issueId: number, programmerId: number) {
    const existing = await this.workSessions.findOne({
      where: { issueId, endedAt: IsNull() },
    });
    if (existing) return existing;
    return this.workSessions.save(
      this.workSessions.create({
        issueId,
        programmerId,
        startedAt: new Date(),
        duration: 0,
      }),
    );
  }

  async stop(issueId: number) {
    const open = await this.workSessions.findOne({
      where: { issueId, endedAt: IsNull() },
    });
    if (!open) return null;
    open.endedAt = new Date();
    open.duration = Math.floor(
      (open.endedAt.getTime() - open.startedAt.getTime()) / 1000,
    );
    await this.workSessions.save(open);
    await this.recalculateTrackedDuration(issueId);
    return open;
  }

  async getOpen(issueId: number) {
    return this.workSessions.findOne({
      where: { issueId, endedAt: IsNull() },
    });
  }

  async getByIssue(issueId: number) {
    return this.workSessions.find({
      where: { issueId },
      order: { startedAt: "ASC" },
    });
  }

  private async recalculateTrackedDuration(issueId: number) {
    const sessions = await this.getByIssue(issueId);
    const total = sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0);
    await this.issues.update(issueId, { trackedDuration: total });
  }
}
