import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { Issue } from "../issues/entities/issue.entity";
import { IssueStatus } from "../issue-statuses/entities/issue-status.entity";

/**
 * Dashboard aggregates for the `/` page (GET /dashboard/summary).
 * PermissionsModule is @Global, so PermissionsService resolves without an
 * explicit import (same as ReportsModule).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Issue, IssueStatus])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
