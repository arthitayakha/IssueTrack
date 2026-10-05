import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { User } from "../auth/entities/user.entity";
import { Position } from "../positions/position.entity";
import { Role } from "../roles/entities/role.entity";
import { PermissionsModule } from "../permissions/permissions.module";
import { RolesModule } from "../roles/roles.module";

@Module({
  imports: [TypeOrmModule.forFeature([User, Position, Role]), PermissionsModule, RolesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
