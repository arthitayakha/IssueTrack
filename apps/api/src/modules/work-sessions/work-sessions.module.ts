import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WorkSession } from "./entities/work-session.entity";

@Module({
  imports: [TypeOrmModule.forFeature([WorkSession])],
  controllers: [],
  providers: [],
})
export class WorkSessionsModule {}
