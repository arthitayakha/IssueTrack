import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ColumnsController } from "./columns.controller";
import { ColumnsService } from "./columns.service";
import { BoardColumn } from "./entities/board-column.entity";
import { Issue } from "../issues/entities/issue.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [TypeOrmModule.forFeature([BoardColumn, Issue, ActivityLog]), PermissionsModule],
  controllers: [ColumnsController],
  providers: [ColumnsService],
  exports: [ColumnsService],
})
export class ColumnsModule {}
