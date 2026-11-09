import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { Company } from "./entities/company.entity";
import { AppCompany } from "../apps/entities/app-company.entity";
import { User } from "../auth/entities/user.entity";

@Module({
  // AppCompany is here so `appCount` can count the join rows directly —
  // `AppCompany` maps no relation on purpose (composite PK), so there is no
  // `App.companies` left for the service to filter on.
  // `User` joins it for `userCount()`: a company is also deletable only while
  // no customer row points at it (`users.company_id`, migration 1816).
  imports: [TypeOrmModule.forFeature([Company, AppCompany, User])],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
