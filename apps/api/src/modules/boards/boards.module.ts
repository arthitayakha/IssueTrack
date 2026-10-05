import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Board } from "./entities/board.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Board])],
  controllers: [],
  providers: [],
})
export class BoardsModule {}
