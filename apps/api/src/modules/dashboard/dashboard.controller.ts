import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  DashboardService,
  type DashboardPeriod,
  type DashboardRange,
  type DashboardScope,
} from "./dashboard.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth-user";

/** Unknown scope → "all" (the service downgrades it when unpermitted). */
function parseScope(value?: string): DashboardScope {
  return value === "assigned" || value === "reported" || value === "all" ? value : "all";
}

/** Unknown period → "week" (the safest default: fits a 12-week window). */
function parsePeriod(value?: string): DashboardPeriod {
  return value === "day" || value === "week" || value === "month" || value === "year"
    ? value
    : "week";
}

/**
 * Custom trend window: only well-formed `yyyy-mm-dd` bounds survive (garbage
 * is dropped, never a 400 — a bad filter must not blank the dashboard), and a
 * reversed pair is swapped so `from <= to` always holds.
 */
function parseRange(from?: string, to?: string): DashboardRange {
  const bound = (value?: string): string | undefined =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
  let start = bound(from);
  let end = bound(to);
  if (start && end && start > end) [start, end] = [end, start];
  return { from: start, to: end };
}

/**
 * Optional status cross-filter. Absent = no filter; anything that is not a
 * positive integer is a 400 — a wrong id would silently show the wrong
 * numbers, and only the page's own state ever sends it.
 */
function parseStatusId(value?: string): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException("statusId must be a positive integer");
  }
  return n;
}

/**
 * Dashboard aggregates for the `/` page. Behind `dashboard.own.view` (every
 * role has it); `scope=all` is downgraded server-side to the caller's own
 * cards unless they also hold `dashboard.overview.view`.
 */
@Controller("dashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * GET /dashboard/summary?scope=all|assigned|reported&period=day|week|month|year
   *                     &from=yyyy-mm-dd&to=yyyy-mm-dd   (custom trend window)
   *                     &statusId=<id>                   (status cross-filter)
   */
  @Get("summary")
  @Permissions("dashboard.own.view")
  summary(
    @Query("scope") scopeQuery: string | undefined,
    @Query("period") periodQuery: string | undefined,
    @Query("from") fromQuery: string | undefined,
    @Query("to") toQuery: string | undefined,
    @Query("statusId") statusIdQuery: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dashboard.summary(
      parseScope(scopeQuery),
      parsePeriod(periodQuery),
      user,
      parseRange(fromQuery, toQuery),
      parseStatusId(statusIdQuery),
    );
  }

  /**
   * GET /dashboard/trend-issues?bucket=yyyy-mm-dd&period=day|week|month|year
   *
   * The issues behind one bar — same scope + the same Bangkok `date_trunc` as
   * the count that bar shows, so the list always matches the number. While the
   * page is cross-filtered the bar shows filtered counts, so `statusId` rides
   * along here too.
   */
  @Get("trend-issues")
  @Permissions("dashboard.own.view")
  trendIssues(
    @Query("bucket") bucketQuery: string | undefined,
    @Query("period") periodQuery: string | undefined,
    @Query("scope") scopeQuery: string | undefined,
    @Query("statusId") statusIdQuery: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dashboard.trendIssues(
      parseScope(scopeQuery),
      parsePeriod(periodQuery),
      bucketQuery ?? "",
      user,
      parseStatusId(statusIdQuery),
    );
  }

  /**
   * GET /dashboard/drilldown?dim=app|category&app=<id>&scope=...
   *
   * Counts inside one donut slice — the categories that still have cards once
   * the clicked app's filter is applied (level 2 of the usage card). `dim` and
   * `app` are validated in the service (400 on garbage, never a fallback).
   * `statusId` keeps the level-2 ring agreeing with its filtered parent slice.
   */
  @Get("drilldown")
  @Permissions("dashboard.own.view")
  drilldown(
    @Query("dim") dimQuery: string | undefined,
    @Query("app") appQuery: string | undefined,
    @Query("scope") scopeQuery: string | undefined,
    @Query("statusId") statusIdQuery: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dashboard.drilldown(
      parseScope(scopeQuery),
      dimQuery ?? "",
      appQuery ?? "",
      user,
      parseStatusId(statusIdQuery),
    );
  }

  /**
   * GET /dashboard/dimension-issues?dim=app|category|status&id=<id>&app=<id>&scope=...
   *
   * The issues behind one donut slice — `app` is the app the caller drilled
   * through first (level 2), so the list always adds up to the slice's number.
   */
  @Get("dimension-issues")
  @Permissions("dashboard.own.view")
  dimensionIssues(
    @Query("dim") dimQuery: string | undefined,
    @Query("id") idQuery: string | undefined,
    @Query("app") appQuery: string | undefined,
    @Query("scope") scopeQuery: string | undefined,
    @Query("statusId") statusIdQuery: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dashboard.dimensionIssues(
      parseScope(scopeQuery),
      dimQuery ?? "",
      idQuery ?? "",
      appQuery,
      user,
      parseStatusId(statusIdQuery),
    );
  }
}
