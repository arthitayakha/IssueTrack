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
  UseGuards,
} from "@nestjs/common";
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
  findAll() {
    return this.positions.findAll();
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
    @Body() body: { isActive: boolean },
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
    @Body() body: { permissions: string[] },
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
