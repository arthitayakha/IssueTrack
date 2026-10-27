import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IssuesController } from "./issues.controller";
import { IssuesService } from "./issues.service";
import { Issue } from "./entities/issue.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { User } from "../auth/entities/user.entity";
import { IssueStatus } from "../issue-statuses/entities/issue-status.entity";
import { Category } from "../categories/entities/category.entity";
import { Label } from "../labels/entities/label.entity";
import { Position } from "../positions/position.entity";
import { WorkSessionsModule } from "../work-sessions/work-sessions.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { ActivityLogsModule } from "../activity-logs/activity-logs.module";
import { RulesModule } from "../rules/rules.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [TypeOrmModule.forFeature([Issue, ActivityLog, User, IssueStatus, Category, Label, Position]), WorkSessionsModule, PermissionsModule, ActivityLogsModule, RulesModule, NotificationsModule],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
