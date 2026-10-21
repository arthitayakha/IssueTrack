import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { normalizePagination } from "../../common/pagination";
import { IssuesService } from "./issues.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser, actorInfo } from "../auth/auth-user";
import { ActorInfo, ActivityLogsService } from "../activity-logs/activity-logs.service";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class IssuesController {
  constructor(
    private readonly issues: IssuesService,
    private readonly activityLogs: ActivityLogsService,
  ) {}

  private actor(user: AuthUser): ActorInfo {
    return actorInfo(user);
  }

  @Get("issues")
  @Permissions("issue.own.view")
  findAll(
    @Query()
    query: { page?: string; limit?: string; statuses?: string; search?: string },
    @CurrentUser() user: AuthUser,
  ) {
    const statuses = (query.statuses ?? "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    return this.issues.findAll(normalizePagination(query), statuses, user, query.search);
  }

  @Get("issues/trash")
  @Permissions("issue.trash.view")
  findTrashed() {
    return this.issues.findAllDeleted();
  }

  @Get("issues/:id")
  @Permissions("issue.detail.view")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.issues.findOne(id);
  }

  @Post("issues")
  @Permissions("issue.create")
  create(
    @Body()
    body: {
      title: string;
      description: string;
      statusId: number;
      priorityId?: number;
      categoryId?: number;
      customCategory?: string;
      programmerId?: number;
      customerId?: number;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.issues.create(body, this.actor(user));
  }

  @Put("issues/:id")
  @Permissions("issue.all.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body()
    body: {
      title?: string;
      description?: string;
      priorityId?: number | null;
      categoryId?: number | null;
      labelId?: number | null;
      labelIds?: number[];
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.issues.update(id, body, this.actor(user));
  }

  @Put("issues/:id/move")
  @Permissions("issue.status.update")
  move(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { statusId: number },
    @CurrentUser() user: AuthUser,
  ) {
    return this.issues.move(id, body.statusId, this.actor(user));
  }

  @Put("issues/:id/assign")
  @Permissions("issue.assign")
  assign(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { programmerId: number | null },
    @CurrentUser() user: AuthUser,
  ) {
    return this.issues.assign(id, body.programmerId, this.actor(user));
  }

  @Put("issues/:id/time")
  @Permissions("time.actual.edit")
  setTime(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { actualFixDuration: number },
  ) {
    return this.issues.setActualFixDuration(id, body.actualFixDuration);
  }







  @Delete("issues/:id")
  @Permissions("issue.delete")
  remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.issues.remove(id, this.actor(user));
  }

  @Put("issues/:id/restore")
  @Permissions("issue.restore")
  restore(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.issues.restore(id, this.actor(user));
  }

  @Get("issues/:id/activity")
  @Permissions("issue.detail.view")
  findActivity(@Param("id", ParseIntPipe) id: number) {
    return this.activityLogs.findByIssue(id);
  }
}
