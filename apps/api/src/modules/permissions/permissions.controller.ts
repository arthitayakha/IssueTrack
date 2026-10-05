import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { PermissionsService } from "./permissions.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("permissions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  @Permissions("permission.view")
  getMatrix() {
    return this.permissions.getMatrix();
  }

  @Put()
  @Permissions("permission.update")
  updateMatrix(@Body() body: { grants: Record<string, string[]> }) {
    return this.permissions.updateMatrix(body.grants);
  }
}
