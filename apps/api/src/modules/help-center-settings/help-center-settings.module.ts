import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppCompany } from "../apps/entities/app-company.entity";
import { User } from "../auth/entities/user.entity";
import { HelpCenterSettings } from "./entities/help-center-settings.entity";
import { HelpCenterSettingsService } from "./help-center-settings.service";
import { HelpCenterSettingsController } from "./help-center-settings.controller";

@Module({
  imports: [TypeOrmModule.forFeature([HelpCenterSettings, User, AppCompany])],
  controllers: [HelpCenterSettingsController],
  providers: [HelpCenterSettingsService],
  exports: [HelpCenterSettingsService],
})
export class HelpCenterSettingsModule {}
