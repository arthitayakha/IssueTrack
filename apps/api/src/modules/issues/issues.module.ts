import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IssuesController } from "./issues.controller";
import { IssuesService } from "./issues.service";
import { Issue } from "./entities/issue.entity";
import { BoardColumn } from "../columns/entities/board-column.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { User } from "../auth/entities/user.entity";
import { IssueStatus } from "../issue-statuses/entities/issue-status.entity";
import { WorkSessionsModule } from "../work-sessions/work-sessions.module";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [TypeOrmModule.forFeature([Issue, BoardColumn, ActivityLog, User, IssueStatus]), WorkSessionsModule, PermissionsModule],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
