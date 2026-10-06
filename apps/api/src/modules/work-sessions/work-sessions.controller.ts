import { Controller, Get, Param, ParseIntPipe, UseGuards } from "@nestjs/common";
import { WorkSessionsService } from "./work-sessions.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("work-sessions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkSessionsController {
  constructor(private readonly workSessions: WorkSessionsService) {}

  @Get("issue/:issueId")
  @Permissions("time.system.view")
  getByIssue(@Param("issueId", ParseIntPipe) issueId: number) {
    return this.workSessions.getByIssue(issueId);
  }

  @Get("issue/:issueId/open")
  @Permissions("time.system.view")
  getOpen(@Param("issueId", ParseIntPipe) issueId: number) {
    return this.workSessions.getOpen(issueId);
  }
}
