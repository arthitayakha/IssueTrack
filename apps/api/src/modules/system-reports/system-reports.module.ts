import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SystemReport } from "./entities/system-report.entity";
import { Attachment } from "../attachments/entities/attachment.entity";
import { SystemReportsService } from "./system-reports.service";
import { SystemReportsController } from "./system-reports.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemReport, Attachment]),
    NotificationsModule,
  ],
  controllers: [SystemReportsController],
  providers: [SystemReportsService],
  exports: [SystemReportsService],
})
export class SystemReportsModule {}
