import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Category } from "../categories/entities/category.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Category])],
  controllers: [],
  providers: [],
})
export class LabelsModule {}
