import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ActivityLog } from "./entities/activity-log.entity";

@Module({
  imports: [TypeOrmModule.forFeature([ActivityLog])],
  controllers: [],
  providers: [],
})
export class ActivityLogsModule {}
