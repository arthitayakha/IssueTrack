import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { normalizePagination } from "../../common/pagination";
import { IsActiveDto } from "../../common/dto/is-active.dto";
import { SetPermissionsDto } from "../../common/dto/set-permissions.dto";
import { PositionsService } from "./positions.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("positions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  @Permissions("position.view")
  findAll(@Query() query: { page?: string; limit?: string }) {
    return this.positions.findAll(normalizePagination(query));
  }

  @Post()
  @Permissions("position.create")
  create(@Body() body: { name: string; roleId?: number | null }) {
    return this.positions.create(body.name, body.roleId);
  }

  @Patch(":id")
  @Permissions("position.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { name: string; roleId?: number | null },
  ) {
    return this.positions.update(id, body.name, body.roleId);
  }

  @Patch(":id/active")
  @Permissions("position.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: IsActiveDto,
  ) {
    return this.positions.updateActive(id, body.isActive);
  }

  @Get(":id/users")
  @Permissions("position.view")
  findUsers(@Param("id", ParseIntPipe) id: number) {
    return this.positions.findUsersByPosition(id);
  }

  @Get(":id/permissions")
  @Permissions("position.view")
  getPermissions(@Param("id", ParseIntPipe) id: number) {
    return this.positions.getPermissions(id);
  }

  @Put(":id/permissions")
  @Permissions("position.update")
  updatePermissions(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: SetPermissionsDto,
  ) {
    return this.positions.updatePermissions(id, body.permissions);
  }

  @Get(":id/check")
  @Permissions("position.delete")
  check(@Param("id", ParseIntPipe) id: number) {
    return this.positions.check(id);
  }

  @Delete(":id")
  @Permissions("position.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.positions.remove(id);
  }
}
