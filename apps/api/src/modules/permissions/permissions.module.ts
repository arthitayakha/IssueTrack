import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PermissionsService } from "./permissions.service";
import { PermissionsController } from "./permissions.controller";
import { RolePermission } from "./entities/role-permission.entity";
import { Role } from "../roles/entities/role.entity";
import { RolesGuard } from "../auth/roles.guard";

@Module({
  imports: [TypeOrmModule.forFeature([RolePermission, Role])],
  controllers: [PermissionsController],
  providers: [PermissionsService, RolesGuard],
  exports: [PermissionsService, RolesGuard],
})
export class PermissionsModule {}
