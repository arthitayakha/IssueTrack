import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppsController } from "./apps.controller";
import { AppsService } from "./apps.service";
import { AppExpiryService } from "./app-expiry.service";
import { App } from "./entities/app.entity";
import { AppCompany } from "./entities/app-company.entity";
import { Company } from "../companies/entities/company.entity";
import { Issue } from "../issues/entities/issue.entity";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  // NotificationsModule: the expiry sweep rings the admin bell
  // AppCompany: the join rows carry the per-company dates the form posts
  // Company: `resolveCompanyId()` has to verify the id the form posts
  imports: [TypeOrmModule.forFeature([App, AppCompany, Issue, Company]), NotificationsModule],
  controllers: [AppsController],
  providers: [AppsService, AppExpiryService],
  exports: [AppsService],
})
export class AppsModule {}
