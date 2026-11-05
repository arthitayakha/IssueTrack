import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { normalizePagination } from "../../common/pagination";
import { AppsService } from "../apps/apps.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

/**
 * The `/systems` page's own read API — gated by `system.view` so the page can
 * be granted independently of the apps tab in `/master-data` (which keeps
 * reading the intentionally-open `GET /apps`).
 *
 * Same payload as `GET /apps`: only the guard differs.
 */
@Controller("systems")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemsController {
  constructor(private readonly apps: AppsService) {}

  @Get()
  @Permissions("system.view")
  findAll(@Query() query: { page?: string; limit?: string }) {
    return this.apps.findAll(normalizePagination(query));
  }
}
