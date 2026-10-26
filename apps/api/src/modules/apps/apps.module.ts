import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AppsController } from "./apps.controller";
import { AppsService } from "./apps.service";
import { App } from "./entities/app.entity";
import { Issue } from "../issues/entities/issue.entity";

@Module({
  imports: [TypeOrmModule.forFeature([App, Issue])],
  controllers: [AppsController],
  providers: [AppsService],
  exports: [AppsService],
})
export class AppsModule {}
