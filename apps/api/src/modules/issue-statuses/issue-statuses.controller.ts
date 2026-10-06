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
import { IssueStatusesService } from "./issue-statuses.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("issue-statuses")
@UseGuards(JwtAuthGuard, RolesGuard)
export class IssueStatusesController {
  constructor(private readonly issueStatuses: IssueStatusesService) {}

  @Get()
  @Permissions("status.view")
  findAll() {
    return this.issueStatuses.findAll();
  }

  @Post()
  @Permissions("status.create")
  create(
    @Body()
    body: {
      name: string;
      description?: string;
      sortOrder?: number;
      isTimerRunning?: boolean;
      isEndStatus?: boolean;
    },
  ) {
    return this.issueStatuses.create(body);
  }

  @Patch(":id")
  @Permissions("status.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      description?: string;
      sortOrder?: number;
      isTimerRunning?: boolean;
      isEndStatus?: boolean;
    },
  ) {
    return this.issueStatuses.update(id, body);
  }

  @Patch(":id/active")
  @Permissions("status.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
  ) {
    return this.issueStatuses.updateActive(id, body.isActive);
  }

  @Get(":id/check")
  @Permissions("status.delete")
  check(@Param("id", ParseIntPipe) id: number) {
    return this.issueStatuses.check(id);
  }

  @Delete(":id")
  @Permissions("status.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.issueStatuses.remove(id);
  }
}
