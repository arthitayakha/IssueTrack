import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PositionsController } from "./positions.controller";
import { PositionsService } from "./positions.service";
import { Position } from "./position.entity";
import { PositionPermission } from "./entities/position-permission.entity";
import { User } from "../auth/entities/user.entity";
import { Role } from "../roles/entities/role.entity";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [TypeOrmModule.forFeature([Position, PositionPermission, User, Role]), PermissionsModule],
  controllers: [PositionsController],
  providers: [PositionsService],
  exports: [PositionsService],
})
export class PositionsModule {}
