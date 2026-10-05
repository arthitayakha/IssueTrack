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
import { RolesService } from "./roles.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("roles")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Permissions("role.view")
  findAll() {
    return this.roles.findAll();
  }

  @Post()
  @Permissions("role.create")
  create(@Body() body: { name: string; template?: string }) {
    return this.roles.create(body.name, body.template);
  }

  @Patch(":id")
  @Permissions("role.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { name?: string; isActive?: boolean },
  ) {
    return this.roles.update(id, body);
  }

  @Patch(":id/active")
  @Permissions("role.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
  ) {
    return this.roles.updateActive(id, body.isActive);
  }

  @Get(":id/check")
  @Permissions("role.delete")
  check(@Param("id", ParseIntPipe) id: number) {
    return this.roles.check(id);
  }

  @Delete(":id")
  @Permissions("role.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.roles.remove(id);
  }

  @Get(":id/users")
  @Permissions("role.view")
  findUsers(@Param("id", ParseIntPipe) id: number) {
    return this.roles.findUsersByRole(id);
  }

  @Put(":id/permissions")
  @Permissions("role.permission.update")
  updatePermissions(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { permissions: string[] },
  ) {
    return this.roles.updateRolePermissions(id, body.permissions);
  }
}
