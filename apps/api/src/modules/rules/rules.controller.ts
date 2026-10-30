import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { RulesService, RuleInput } from "./rules.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser, actorInfo } from "../auth/auth-user";

@Controller("rules")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  @Permissions("automation.view")
  findAll() {
    return this.rules.findAll();
  }

  // audit trail (who created/edited/deleted rules) — optional date range for /reports
  @Get("activity")
  @Permissions("automation.view")
  findActivity(
    @Query()
    query: { ruleId?: string; page?: string; limit?: string; createdFrom?: string; createdTo?: string },
  ) {
    return this.rules.findActivity(query);
  }

  @Get(":id")
  @Permissions("automation.view")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.rules.findOne(id);
  }

  @Post()
  @Permissions("automation.update")
  create(@Body() body: RuleInput, @CurrentUser() user: AuthUser) {
    return this.rules.create(body, actorInfo(user));
  }

  @Put(":id")
  @Permissions("automation.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RuleInput,
    @CurrentUser() user: AuthUser,
  ) {
    return this.rules.update(id, body, actorInfo(user));
  }

  @Patch(":id/toggle")
  @Permissions("automation.update")
  toggle(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
    @CurrentUser() user: AuthUser,
  ) {
    return this.rules.toggle(id, Boolean(body?.isActive), actorInfo(user));
  }

  @Delete(":id")
  @Permissions("automation.update")
  remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.rules.remove(id, actorInfo(user));
  }
}
