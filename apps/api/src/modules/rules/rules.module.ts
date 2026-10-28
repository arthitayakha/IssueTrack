import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RulesController } from "./rules.controller";
import { RulesService } from "./rules.service";
import { RulesEngineService } from "./rules-engine.service";
import { Rule } from "./entities/rule.entity";
import { Issue } from "../issues/entities/issue.entity";
import { Comment } from "../comments/entities/comment.entity";
import { User } from "../auth/entities/user.entity";
import { Label } from "../labels/entities/label.entity";
import { Position } from "../positions/position.entity";
import { IssueStatus } from "../issue-statuses/entities/issue-status.entity";
import { IssuePriority } from "../issue-priorities/entities/issue-priority.entity";
import { Category } from "../categories/entities/category.entity";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { WorkSession } from "../work-sessions/entities/work-session.entity";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Rule,
      Issue,
      Comment,
      User,
      Label,
      Position,
      IssueStatus,
      IssuePriority,
      Category,
      ActivityLog,
      WorkSession,
    ]),
    NotificationsModule,
  ],
  controllers: [RulesController],
  providers: [RulesService, RulesEngineService],
  exports: [RulesService, RulesEngineService],
})
export class RulesModule {}
