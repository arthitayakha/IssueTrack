import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IssuePrioritiesController } from "./issue-priorities.controller";
import { IssuePrioritiesService } from "./issue-priorities.service";
import { IssuePriority } from "./entities/issue-priority.entity";
import { Issue } from "../issues/entities/issue.entity";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [TypeOrmModule.forFeature([IssuePriority, Issue]), PermissionsModule],
  controllers: [IssuePrioritiesController],
  providers: [IssuePrioritiesService],
  exports: [IssuePrioritiesService],
})
export class IssuePrioritiesModule {}
