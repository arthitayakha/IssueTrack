import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { Issue } from "../issues/entities/issue.entity";
import { Comment } from "../comments/entities/comment.entity";
import { Attachment } from "../attachments/entities/attachment.entity";

/**
 * Report aggregates/activity for the /reports page. PermissionsModule is
 * @Global, so PermissionsService resolves without an explicit import.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Issue, Comment, Attachment])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
