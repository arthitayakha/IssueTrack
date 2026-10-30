import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ReportsService, type ReportIssueFilters } from "./reports.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth-user";
import { normalizePagination } from "../../common/pagination";

function parseIdList(value?: string): number[] {
  return (value ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function isDay(value?: string): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Raw query → the shared filter shape (id lists parsed, bad dates dropped). */
function parseFilters(query: Record<string, string | undefined>): ReportIssueFilters {
  return {
    createdFrom: isDay(query.createdFrom) ? query.createdFrom : undefined,
    createdTo: isDay(query.createdTo) ? query.createdTo : undefined,
    search: query.search,
    assigneeIds: parseIdList(query.assigneeIds),
    reporterIds: parseIdList(query.reporterIds),
    categoryIds: parseIdList(query.categoryIds),
    statuses: parseIdList(query.statuses),
    priorityIds: parseIdList(query.priorityIds),
    appIds: parseIdList(query.appIds),
  };
}

/**
 * Reports endpoints behind `report.view` (the /reports page permission).
 * Filters mirror GET /issues so one filter set drives every report view.
 */
@Controller("reports")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Grouped aggregates: ?groupBy=person|category|app (+ the shared filters). */
  @Get("summary")
  @Permissions("report.view")
  summary(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() user: AuthUser,
  ) {
    const groupBy =
      query.groupBy === "category" || query.groupBy === "app" ? query.groupBy : "person";
    return this.reports.summary(groupBy, parseFilters(query), user);
  }

  /** Distinct assignees / reporters for the filter panel's people lists. */
  @Get("people")
  @Permissions("report.view")
  people(@CurrentUser() user: AuthUser) {
    return this.reports.people(user);
  }

  /** Comments + attachments merged: shared filters + sortBy/sortOrder/page. */
  @Get("activity")
  @Permissions("report.view")
  activity(
    @Query()
    query: Record<string, string | undefined>,
    @CurrentUser() user: AuthUser,
  ) {
    const sortBy = query.sortBy === "actorName" ? "actorName" : "createdAt";
    const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";
    return this.reports.activity(
      parseFilters(query),
      sortBy,
      sortOrder,
      normalizePagination(query),
      user,
    );
  }
}
