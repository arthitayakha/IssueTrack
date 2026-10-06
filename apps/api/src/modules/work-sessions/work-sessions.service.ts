import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { WorkSession } from "./entities/work-session.entity";

@Injectable()
export class WorkSessionsService {
  constructor(
    @InjectRepository(WorkSession)
    private readonly workSessions: Repository<WorkSession>,
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
}
