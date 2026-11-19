import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Notification } from "./entities/notification.entity";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { User } from "../auth/entities/user.entity";
import { IssuePriority } from "../issue-priorities/entities/issue-priority.entity";
import { MailModule } from "../mail/mail.module";

@Module({
  // IssuePriority — ให้ notify() แปลงชื่อความสำคัญของบัตร (priorityForIssue)
  imports: [TypeOrmModule.forFeature([Notification, User, IssuePriority]), MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
