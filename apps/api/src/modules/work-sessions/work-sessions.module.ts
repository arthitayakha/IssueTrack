import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WorkSession } from "./entities/work-session.entity";
import { WorkSessionsService } from "./work-sessions.service";
import { WorkSessionsController } from "./work-sessions.controller";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [TypeOrmModule.forFeature([WorkSession]), PermissionsModule],
  controllers: [WorkSessionsController],
  providers: [WorkSessionsService],
  exports: [WorkSessionsService],
})
export class WorkSessionsModule {}
