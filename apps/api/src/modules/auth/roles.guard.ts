import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Permission } from "@kanban/shared";
import { PERMISSIONS_KEY } from "./permissions.decorator";
import { PermissionsService } from "../permissions/permissions.service";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException("Unauthorized");

    for (const permission of required) {
      const allowed = await this.permissions.hasPermission(
        user.roleId,
        permission,
        user.positionId,
      );
      if (!allowed) {
        throw new ForbiddenException("Insufficient permissions");
      }
    }
    return true;
  }
}
