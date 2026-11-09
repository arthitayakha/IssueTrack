import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { User } from "../auth/entities/user.entity";
import { Position } from "../positions/position.entity";
import { Role } from "../roles/entities/role.entity";
import { Company } from "../companies/entities/company.entity";
import { PermissionsModule } from "../permissions/permissions.module";
import { RolesModule } from "../roles/roles.module";

@Module({
  // Company is here so `create`/`update` can verify a submitted `company_id`
  // actually exists (a stale id would otherwise reach the FK and explode as a 500)
  imports: [TypeOrmModule.forFeature([User, Position, Role, Company]), PermissionsModule, RolesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
