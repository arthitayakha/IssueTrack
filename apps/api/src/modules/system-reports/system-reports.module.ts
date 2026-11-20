import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SystemReport } from "./entities/system-report.entity";
import { SystemReportAttachment } from "./entities/system-report-attachment.entity";
import { SystemReportsService } from "./system-reports.service";
import { SystemReportsController } from "./system-reports.controller";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([SystemReport, SystemReportAttachment]),
    NotificationsModule,
  ],
  controllers: [SystemReportsController],
  providers: [SystemReportsService],
  exports: [SystemReportsService],
})
export class SystemReportsModule {}
