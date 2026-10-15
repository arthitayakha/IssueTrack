import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IssueStatusesController } from "./issue-statuses.controller";
import { IssueStatusesService } from "./issue-statuses.service";
import { IssueStatus } from "./entities/issue-status.entity";
import { Issue } from "../issues/entities/issue.entity";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [TypeOrmModule.forFeature([IssueStatus, Issue]), PermissionsModule],
  controllers: [IssueStatusesController],
  providers: [IssueStatusesService],
  exports: [IssueStatusesService],
})
export class IssueStatusesModule {}
