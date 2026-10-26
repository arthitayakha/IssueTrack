import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { normalizePagination } from "../../common/pagination";
import { AppsService } from "./apps.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("apps")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppsController {
  constructor(private readonly apps: AppsService) {}

  // No @Permissions on purpose: any authenticated user (customers included)
  // must be able to load the app list when reporting an issue.
  @Get()
  findAll(@Query() query: { page?: string; limit?: string }) {
    return this.apps.findAll(normalizePagination(query));
  }

  @Post()
  @Permissions("app.create")
  create(@Body() body: { name: string }) {
    return this.apps.create(body.name);
  }

  @Patch(":id")
  @Permissions("app.update")
  update(@Param("id", ParseIntPipe) id: number, @Body() body: { name?: string }) {
    return this.apps.update(id, body);
  }

  @Patch(":id/active")
  @Permissions("app.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
  ) {
    return this.apps.updateActive(id, body.isActive);
  }

  @Get(":id/check")
  @Permissions("app.delete")
  check(@Param("id", ParseIntPipe) id: number) {
    return this.apps.check(id);
  }

  @Delete(":id")
  @Permissions("app.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.apps.remove(id);
  }
}
