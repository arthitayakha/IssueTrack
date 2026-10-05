import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IssuePriority } from "./entities/issue-priority.entity";

@Module({
  imports: [TypeOrmModule.forFeature([IssuePriority])],
  controllers: [],
  providers: [],
})
export class IssuePrioritiesModule {}
