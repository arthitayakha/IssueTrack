import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { PermissionsService } from "./permissions.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

@Controller("permissions")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get("my")
  getMyPermissions(@CurrentUser() user: { roleId: number | null; positionId: number | null }) {
    return this.permissions.getUserPermissions(user.roleId, user.positionId);
  }

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

  @Post("reset")
  @Permissions("permission.update")
  resetToDefaults() {
    return this.permissions.resetToDefaults();
  }

  @Post("refresh")
  refreshCache() {
    return this.permissions.refreshCache();
  }
}
