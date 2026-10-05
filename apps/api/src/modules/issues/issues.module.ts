import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Issue } from "./entities/issue.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Issue])],
  controllers: [],
  providers: [],
})
export class IssuesModule {}
