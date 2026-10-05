import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IssueStatus } from "./entities/issue-status.entity";

@Module({
  imports: [TypeOrmModule.forFeature([IssueStatus])],
  controllers: [],
  providers: [],
})
export class IssueStatusesModule {}
