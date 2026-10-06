import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IssuePrioritiesService } from "./issue-priorities.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("issue-priorities")
@UseGuards(JwtAuthGuard, RolesGuard)
export class IssuePrioritiesController {
  constructor(private readonly issuePriorities: IssuePrioritiesService) {}

  @Get()
  @Permissions("priority.view")
  findAll() {
    return this.issuePriorities.findAll();
  }

  @Post()
  @Permissions("priority.create")
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      sortOrder?: number;
    },
  ) {
    return this.issuePriorities.create(body);
  }

  @Patch(":id")
  @Permissions("priority.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      description?: string;
      sortOrder?: number;
    },
  ) {
    return this.issuePriorities.update(id, body);
  }

  @Patch(":id/active")
  @Permissions("priority.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
  ) {
    return this.issuePriorities.updateActive(id, body.isActive);
  }

  @Get(":id/check")
  @Permissions("priority.delete")
  check(@Param("id", ParseIntPipe) id: number) {
    return this.issuePriorities.check(id);
  }

  @Delete(":id")
  @Permissions("priority.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.issuePriorities.remove(id);
  }
}
