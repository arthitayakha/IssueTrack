import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PositionsController } from "./positions.controller";
import { PositionsService } from "./positions.service";
import { Position } from "./position.entity";
import { User } from "../auth/entities/user.entity";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [TypeOrmModule.forFeature([Position, User]), PermissionsModule],
  controllers: [PositionsController],
  providers: [PositionsService],
  exports: [PositionsService],
})
export class PositionsModule {}
