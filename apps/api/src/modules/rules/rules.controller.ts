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
  UseGuards,
} from "@nestjs/common";
import { RulesService, RuleInput } from "./rules.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth-user";

@Controller("rules")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  @Permissions("automation.view")
  findAll() {
    return this.rules.findAll();
  }

  @Get(":id")
  @Permissions("automation.view")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.rules.findOne(id);
  }

  @Post()
  @Permissions("automation.update")
  create(@Body() body: RuleInput, @CurrentUser() user: AuthUser) {
    return this.rules.create(body, Number(user.id));
  }

  @Put(":id")
  @Permissions("automation.update")
  update(@Param("id", ParseIntPipe) id: number, @Body() body: RuleInput) {
    return this.rules.update(id, body);
  }

  @Patch(":id/toggle")
  @Permissions("automation.update")
  toggle(@Param("id", ParseIntPipe) id: number, @Body() body: { isActive: boolean }) {
    return this.rules.toggle(id, Boolean(body?.isActive));
  }

  @Delete(":id")
  @Permissions("automation.update")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.rules.remove(id);
  }
}
