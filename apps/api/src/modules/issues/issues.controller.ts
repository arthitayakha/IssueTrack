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
    query: {
      page?: string;
      limit?: string;
      statuses?: string;
      search?: string;
      mine?: string;
      priorityIds?: string;
      categoryIds?: string;
      appIds?: string;
      /** "ไม่มีหมวดหมู่" — the dashboard's NULL slice lands here (`?noCategory=1`). */
      noCategory?: string;
      /** "ไม่ระบุความสำคัญ" — the priority bar's NULL slice (`?noPriority=1`). */
      noPriority?: string;
      /** "ไม่มีแอป" — same deal, for cards with no app at all. */
      noApp?: string;
      companyIds?: string;
      assigneeIds?: string;
      reporterIds?: string;
      /**
       * ประเภทงาน (`bug,ma,requirement`) — whitelist ใน `common/task-types.ts`,
       * ชุดเดียวกับ `GET /reports/summary` ให้ทุกมุมมองของหน้ารายงานนับงาน
       * ชุดเดียวกัน
       */
      taskTypes?: string;
      /** "ไม่ระบุประเภทงาน" (`task_type IS NULL`) — OR-part ของ dimension เดียวกัน. */
      noTaskType?: string;
      createdFrom?: string;
      createdTo?: string;
      /** Completed bar's window — cards moved into เสร็จสิ้น in this range. */
      completedFrom?: string;
      completedTo?: string;
      sortBy?: string;
      sortOrder?: string;
      withTimeline?: string;
      hideStaleDone?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    const statuses = parseIdList(query.statuses);
    return this.issues.findAll(normalizePagination(query), statuses, user, query.search, {
      priorityIds: parseIdList(query.priorityIds),
      categoryIds: parseIdList(query.categoryIds),
      appIds: parseIdList(query.appIds),
      // "no app"/"no category" is an OR-part of the same dimension, so it rides
      // along with the id list instead of replacing it (see IssuesService)
      noCategory: query.noCategory === "1" || query.noCategory === "true",
      noPriority: query.noPriority === "1" || query.noPriority === "true",
      noApp: query.noApp === "1" || query.noApp === "true",
      companyIds: parseIdList(query.companyIds),
      assigneeIds: parseIdList(query.assigneeIds),
      reporterIds: parseIdList(query.reporterIds),
      // ประเภทงาน — whitelist กลาง + bucket NULL (ดู common/task-types.ts)
      taskTypes: parseTaskTypes(query.taskTypes),
      noTaskType: parseNoTaskType(query.noTaskType),
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      completedFrom: query.completedFrom,
      completedTo: query.completedTo,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      // only the board's per-column fetch sets it — the table never does, so
      // the hide policy can never leak into the list that must show everything
      hideStaleDone: query.hideStaleDone === "1" || query.hideStaleDone === "true",
    },
    query.withTimeline === "1" || query.withTimeline === "true");
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
