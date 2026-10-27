import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RulesController } from "./rules.controller";
import { RulesService } from "./rules.service";
import { RulesEngineService } from "./rules-engine.service";
import { Rule } from "./entities/rule.entity";
import { RuleCondition } from "./entities/rule-condition.entity";
import { Issue } from "../issues/entities/issue.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Rule, RuleCondition, Issue])],
  controllers: [RulesController],
  providers: [RulesService, RulesEngineService],
  exports: [RulesService, RulesEngineService],
})
export class RulesModule {}
