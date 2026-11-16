import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { normalizePagination } from "../../common/pagination";
import { AppsService } from "../apps/apps.service";
import { viewerScope } from "../apps/viewer-scope";
import { AuthUser } from "../auth/auth-user";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

/**
 * The `/systems` page's own read API — gated by `system.view` so the page can
 * be granted independently of the apps tab in `/master-data` (which keeps
 * reading the intentionally-open `GET /apps`).
 *
 * Same payload as `GET /apps`: only the guard differs — **and the scope**:
 * a `customer` sees only the pairs of their own `users.company_id`
 * (`viewer-scope.ts`, `mode: "own"`), so handing `system.view` to the customer
 * role cannot leak another company's contract rows through this route. A
 * customer with no company gets an empty page instead of everything.
 */
@Controller("systems")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemsController {
  constructor(private readonly apps: AppsService) {}

  @Get()
  @Permissions("system.view")
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: { page?: string; limit?: string },
  ) {
    return this.apps.findAll(normalizePagination(query), {
      contract: viewerScope(user, "own"),
    });
  }
}
