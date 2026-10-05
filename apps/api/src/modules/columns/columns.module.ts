import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BoardColumn } from "./entities/board-column.entity";

@Module({
  imports: [TypeOrmModule.forFeature([BoardColumn])],
  controllers: [],
  providers: [],
})
export class ColumnsModule {}
