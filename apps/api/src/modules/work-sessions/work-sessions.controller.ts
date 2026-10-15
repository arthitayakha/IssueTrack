import { Controller, Get, Param, ParseIntPipe, Post, UseGuards } from "@nestjs/common";
import { WorkSessionsService } from "./work-sessions.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth-user";

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

  @Post("issue/:issueId/start")
  @Permissions("time.system.edit")
  start(
    @Param("issueId", ParseIntPipe) issueId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.workSessions.start(issueId, Number(user.id));
  }

  @Post("issue/:issueId/stop")
  @Permissions("time.system.edit")
  stop(@Param("issueId", ParseIntPipe) issueId: number) {
    return this.workSessions.stop(issueId);
  }
}
