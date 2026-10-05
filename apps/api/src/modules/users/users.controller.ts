import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { UsersService } from "./users.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions("user.view")
  findAll() {
    return this.users.findAll();
  }

  @Post()
  @Permissions("user.create")
  create(
    @Body() body: { email: string; password: string; name: string; roleId?: number | null; positionId?: number | null },
  ) {
    return this.users.create(body);
  }

  @Patch(":id")
  @Permissions("user.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { email?: string; name?: string; roleId?: number | null; password?: string; positionId?: number | null },
  ) {
    return this.users.update(id, body);
  }

  @Patch(":id/active")
  @Permissions("user.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
  ) {
    return this.users.updateActive(id, body.isActive);
  }

  @Delete(":id")
  @Permissions("user.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.users.remove(id);
  }
}
