import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { Issue } from "../issues/entities/issue.entity";
import { Comment } from "../comments/entities/comment.entity";
import { Attachment } from "../attachments/entities/attachment.entity";
import { App } from "../apps/entities/app.entity";

/**
 * Report aggregates/activity for the /reports page. PermissionsModule is
 * @Global, so PermissionsService resolves without an explicit import.
 * `App` is here so the "by app" summary can seed a row for every app —
 * even one with no issues (see `groupByApp()` in the service).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Issue, Comment, Attachment, App])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
