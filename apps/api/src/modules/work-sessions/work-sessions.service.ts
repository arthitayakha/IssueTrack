import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { WorkSession } from "./entities/work-session.entity";
import { Issue } from "../issues/entities/issue.entity";
import { RulesEngineService } from "../rules/rules-engine.service";

@Injectable()
export class WorkSessionsService {
  constructor(
    @InjectRepository(WorkSession)
    private readonly workSessions: Repository<WorkSession>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    private readonly rulesEngine: RulesEngineService,
  ) {}

  async start(issueId: number, programmerId: number) {
    const existing = await this.workSessions.findOne({
      where: { issueId, endedAt: IsNull() },
    });
    if (existing) return existing;
    const saved = await this.workSessions.save(
      this.workSessions.create({
        issueId,
        programmerId,
        startedAt: new Date(),
        duration: 0,
      }),
    );
    // automation rules — timer just started for this assignee
    const issue = await this.issues.findOne({ where: { id: issueId } });
    await this.rulesEngine.evaluate("work_session.started", {
      issueId,
      actorId: programmerId,
      toStatusId: issue?.statusId ?? null,
    });
    return saved;
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
    // automation rules — duration is reported in minutes (registry: durationMinutes)
    const issue = await this.issues.findOne({ where: { id: issueId } });
    await this.rulesEngine.evaluate("work_session.stopped", {
      issueId,
      actorId: open.programmerId ?? null,
      fromStatusId: issue?.statusId ?? null,
      durationMinutes: Math.round((open.duration ?? 0) / 60),
    });
    return open;
  }

  async getOpen(issueId: number) {
    return this.workSessions.findOne({
      where: { issueId, endedAt: IsNull() },
    });
  }

  /** Every card with a running timer — one call feeds the whole board. */
  async findOpen() {
    return this.workSessions.find({ where: { endedAt: IsNull() } });
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
