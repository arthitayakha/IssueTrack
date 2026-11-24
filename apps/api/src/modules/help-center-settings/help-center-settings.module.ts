import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "../auth/entities/user.entity";
import { HelpCenterSettings } from "./entities/help-center-settings.entity";
import { HelpCenterSettingsService } from "./help-center-settings.service";
import { HelpCenterSettingsController } from "./help-center-settings.controller";

@Module({
  imports: [TypeOrmModule.forFeature([HelpCenterSettings, User])],
  controllers: [HelpCenterSettingsController],
  providers: [HelpCenterSettingsService],
  exports: [HelpCenterSettingsService],
})
export class HelpCenterSettingsModule {}
