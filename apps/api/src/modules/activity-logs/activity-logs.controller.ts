import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from "@nestjs/common";
import { ActivityLogsService } from "./activity-logs.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("issues/:id/activity")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityLogsController {
  constructor(private readonly activityLogs: ActivityLogsService) {}

  @Get()
  @Permissions("issue.detail.view")
  findByIssue(@Param("id", ParseIntPipe) id: number) {
    return this.activityLogs.findByIssue(id);
  }
}
