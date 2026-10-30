import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  DashboardService,
  type DashboardPeriod,
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
 * Dashboard aggregates for the `/` page. Behind `dashboard.own.view` (every
 * role has it); `scope=all` is downgraded server-side to the caller's own
 * cards unless they also hold `dashboard.overview.view`.
 */
@Controller("dashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** GET /dashboard/summary?scope=all|assigned|reported&period=day|week|month|year */
  @Get("summary")
  @Permissions("dashboard.own.view")
  summary(
    @Query("scope") scopeQuery: string | undefined,
    @Query("period") periodQuery: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.dashboard.summary(parseScope(scopeQuery), parsePeriod(periodQuery), user);
  }
}
