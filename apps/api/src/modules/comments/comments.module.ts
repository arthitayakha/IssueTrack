import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Comment } from "./entities/comment.entity";
import { CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";
import { Issue } from "../issues/entities/issue.entity";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [TypeOrmModule.forFeature([Comment, ActivityLog, Issue]), NotificationsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
