import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ActivityLogListController,
  ActivityLogsController,
} from "./activity-logs.controller";
import { ActivityLogsService } from "./activity-logs.service";
import { ActivityLog } from "./entities/activity-log.entity";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [TypeOrmModule.forFeature([ActivityLog]), PermissionsModule],
  controllers: [ActivityLogsController, ActivityLogListController],
  providers: [ActivityLogsService],
  exports: [ActivityLogsService],
})
export class ActivityLogsModule {}
