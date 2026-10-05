import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { Role } from "./entities/role.entity";
import { User } from "../auth/entities/user.entity";
import { RolePermission } from "../permissions/entities/role-permission.entity";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [TypeOrmModule.forFeature([Role, User, RolePermission]), PermissionsModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
