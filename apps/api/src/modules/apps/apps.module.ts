import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppsController } from "./apps.controller";
import { AppsService } from "./apps.service";
import { AppExpiryService } from "./app-expiry.service";
import { MaUsageService } from "./ma-usage.service";
import { App } from "./entities/app.entity";
import { AppCompany } from "./entities/app-company.entity";
import { Company } from "../companies/entities/company.entity";
import { Issue } from "../issues/entities/issue.entity";
import { User } from "../auth/entities/user.entity";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  // NotificationsModule: the expiry sweep rings the admin bell, and
  // `MaUsageService` rings the company's customers when MA runs out
  // AppCompany: the join rows carry the per-company dates the form posts
  // Company: `resolveCompanyId()` has to verify the id the form posts
  // Issue/User: `MaUsageService` sums entered hours per pair (usage rule)
  imports: [
    TypeOrmModule.forFeature([App, AppCompany, Issue, Company, User]),
    NotificationsModule,
  ],
  controllers: [AppsController],
  providers: [AppsService, AppExpiryService, MaUsageService],
  // MaUsageService: IssuesService calls it after a time entry is written
  exports: [AppsService, MaUsageService],
})
export class AppsModule {}
