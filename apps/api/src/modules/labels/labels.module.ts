import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Label } from "./entities/label.entity";
import { LabelsController } from "./labels.controller";
import { LabelsService } from "./labels.service";
import { Issue } from "../issues/entities/issue.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Label, Issue])],
  controllers: [LabelsController],
  providers: [LabelsService],
})
export class LabelsModule {}
