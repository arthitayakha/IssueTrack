import {
  BadRequestException,
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
import { parseNoTaskType, parseTaskTypes } from "../../common/task-types";
import {
  AssignIssueDto,
  CreateIssueDto,
  MoveIssueDto,
  UpdateIssueDto,
} from "./dto/issue.dto";

function parseIdList(value?: string): number[] {
  return (value ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function parseStringList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Every query param the board's paged list and its grouped counts share. */
interface IssueListQuery {
  page?: string;
  limit?: string;
  statuses?: string;
  notDone?: string;
  search?: string;
  mine?: string;
  priorityIds?: string;
  categoryIds?: string;
  appIds?: string;
  noCategory?: string;
  noPriority?: string;
  noApp?: string;
  noStatus?: string;
  customCategories?: string;
  companyIds?: string;
  assigneeIds?: string;
  reporterIds?: string;
  taskTypes?: string;
  noTaskType?: string;
  createdFrom?: string;
  createdTo?: string;
  completedFrom?: string;
  completedTo?: string;
  sortBy?: string;
  sortOrder?: string;
  withTimeline?: string;
  hideStaleDone?: string;
  groupBy?: string;
}

const flag = (value?: string) => value === "1" || value === "true";

/** ONE parser for both endpoints — a filter can never differ between them. */
function parseIssueListQuery(query: IssueListQuery) {
  return {
    statuses: parseIdList(query.statuses),
    search: query.search,
    filters: {
      priorityIds: parseIdList(query.priorityIds),
      categoryIds: parseIdList(query.categoryIds),
      appIds: parseIdList(query.appIds),
      // "no app"/"no category" is an OR-part of the same dimension, so it
      // rides along with the id list instead of replacing it (see IssuesService)
      noCategory: flag(query.noCategory),
      noPriority: flag(query.noPriority),
      noApp: flag(query.noApp),
      noStatus: flag(query.noStatus),
      customCategories: parseStringList(query.customCategories),
      companyIds: parseIdList(query.companyIds),
      assigneeIds: parseIdList(query.assigneeIds),
      reporterIds: parseIdList(query.reporterIds),
      // ประเภทงาน — whitelist กลาง + bucket NULL (ดู common/task-types.ts)
      taskTypes: parseTaskTypes(query.taskTypes),
      noTaskType: parseNoTaskType(query.noTaskType),
      notDone: flag(query.notDone),
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      completedFrom: query.completedFrom,
      completedTo: query.completedTo,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      // only the board/folder fetches set it — the table never does, so the
      // hide policy can never leak into the list that must show everything
      hideStaleDone: flag(query.hideStaleDone),
    },
  };
}

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
  findAll(@Query() query: IssueListQuery, @CurrentUser() user: AuthUser) {
    const { statuses, search, filters } = parseIssueListQuery(query);
    return this.issues.findAll(
      normalizePagination(query),
      statuses,
      user,
      search,
      filters,
      flag(query.withTimeline),
    );
  }

  /**
   * One request for the folder view's tiles. Registered before `issues/:id`
   * so "counts" is never eaten by `ParseIntPipe` as an issue id.
   */
  @Get("issues/counts")
  @Permissions("issue.own.view")
  groupCounts(@Query() query: IssueListQuery, @CurrentUser() user: AuthUser) {
    const groupBy = query.groupBy;
    if (
      groupBy !== "app" &&
      groupBy !== "category" &&
      groupBy !== "priority" &&
      groupBy !== "status" &&
      groupBy !== "assignee" &&
      groupBy !== "reporter" &&
      groupBy !== "company"
    ) {
      throw new BadRequestException(
        "groupBy must be app | category | priority | status | assignee | reporter | company",
      );
    }
    const { statuses, search, filters } = parseIssueListQuery(query);
    return this.issues.groupCounts(groupBy, statuses, user, search, filters);
  }

  @Get("issues/trash")
  @Permissions("issue.trash.view")
  findTrashed(@CurrentUser() user: AuthUser) {
    // scope = เดียวกับ list — ไม่งั้นรายการโชว์ทุกใบแต่เปิดดูไม่ได้ (ดู findAllDeleted)
    return this.issues.findAllDeleted(user);
  }

  // before `issues/:id` — otherwise `move-policy` would be parsed as an id
  @Get("issues/move-policy")
  @Permissions("issue.own.view")
  movePolicy() {
    return this.issues.movePolicy();
  }

  // one-shot release from a status lock (the lock icon on a locked card)
  @Put("issues/:id/unlock")
  @Permissions("issue.all.update")
  unlock(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.issues.unlock(id, this.actor(user));
  }

  @Get("issues/:id")
  @Permissions("issue.detail.view")
  findOne(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    // scope = เดียวกับ list (issue-access.ts) — กัน customer เดา id อ่านงานคนอื่น
    return this.issues.findOne(id, user);
  }

  @Post("issues")
  @Permissions("issue.create")
  create(@Body() body: CreateIssueDto, @CurrentUser() user: AuthUser) {
    // `user` ส่งต่อให้ service เช็ค `issue.assign` เมื่อส่ง `programmerId`
    // (เส้นนี้ guard แค่ `issue.create`)
    return this.issues.create(body, this.actor(user), user);
  }

  @Put("issues/:id")
  @Permissions("issue.all.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateIssueDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.issues.update(id, body, this.actor(user));
  }

  @Put("issues/:id/move")
  @Permissions("issue.status.update")
  move(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: MoveIssueDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.issues.move(id, body.statusId, this.actor(user));
  }

  @Put("issues/:id/assign")
  @Permissions("issue.assign")
  assign(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: AssignIssueDto,
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
  async findActivity(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    // เช็คขอบเขตของงานก่อนคืน timeline (เดิมโหลดด้วย id ล้วน = IDOR)
    await this.issues.assertVisible(id, user);
    return this.activityLogs.findByIssue(id);
  }
}
