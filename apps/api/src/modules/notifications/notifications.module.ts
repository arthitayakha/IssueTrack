import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Notification } from "./entities/notification.entity";
import { NotificationRepeat } from "./entities/notification-repeat.entity";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationRepeatsService } from "./notification-repeats.service";
import { NotificationStreamService } from "./notification-stream.service";
import { User } from "../auth/entities/user.entity";
import { IssuePriority } from "../issue-priorities/entities/issue-priority.entity";
import { AppCompany } from "../apps/entities/app-company.entity";
import { Issue } from "../issues/entities/issue.entity";
import { MailModule } from "../mail/mail.module";

@Module({
  // IssuePriority — ให้ notify() แปลงชื่อความสำคัญของบัตร (priorityForIssue)
  // NotificationRepeat / AppCompany / Issue — สายเตือนซ้ำ 09:00 เช็คสถานะว่าจัดการแล้วหรือยัง
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationRepeat,
      User,
      IssuePriority,
      AppCompany,
      Issue,
    ]),
    MailModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationRepeatsService, NotificationStreamService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
