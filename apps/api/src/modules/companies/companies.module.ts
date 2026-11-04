import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { Company } from "./entities/company.entity";
import { AppCompany } from "../apps/entities/app-company.entity";

@Module({
  // AppCompany is here so `appCount` can count the join rows directly —
  // `AppCompany` maps no relation on purpose (composite PK), so there is no
  // `App.companies` left for the service to filter on
  imports: [TypeOrmModule.forFeature([Company, AppCompany])],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
