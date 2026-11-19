import {
  Controller,
  Get,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ActivityLogsService, type ActivityLogFilters } from "./activity-logs.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

/**
 * ⚠️ เส้น `GET /issues/:id/activity` **ไม่ได้อยู่ที่นี่อีกแล้ว** — เดิม controller
 * ตัวนี้ (`@Controller("issues/:id/activity")`) ลงทะเบียนซ้ำกับ `IssuesController`
 * และตัวที่ "ชนะ" ขึ้นกับลำดับสำรวจ module (ซึ่งไม่ deterministic) ทำให้การ
 * เช็คขอบเขตที่เพิ่มใน `IssuesController.findActivity` อาจไม่เคยถูกเรียก —
 * จึงเหลือเส้นเดียวอยู่ใน `IssuesController` (เช็ค `issue-access.ts` แล้ว)
 * และลบตัวซ้ำทิ้ง กันบั๊กเงียบจากการ reorder import
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
