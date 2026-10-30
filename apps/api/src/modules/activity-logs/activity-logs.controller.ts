import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ActivityLogsService, type ActivityLogFilters } from "./activity-logs.service";
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

/**
 * The system-wide feed behind the /logs page. Separate controller because the
 * issue-scoped one above is mounted under `issues/:id/activity`.
 */
@Controller("activity-logs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivityLogListController {
  constructor(private readonly activityLogs: ActivityLogsService) {}

  /** Every row in `activity_logs` — filters: actorId, type, search, dates. */
  @Get()
  @Permissions("log.view")
  findAll(@Query() query: Record<string, string | undefined>) {
    const filters: ActivityLogFilters = {
      page: query.page,
      limit: query.limit,
      actorId: query.actorId,
      type: query.type,
      search: query.search,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
    };
    return this.activityLogs.findAll(filters);
  }

  /** Distinct actors for the filter dropdown (no `user.view` needed). */
  @Get("actors")
  @Permissions("log.view")
  findActors() {
    return this.activityLogs.findActors();
  }
}
