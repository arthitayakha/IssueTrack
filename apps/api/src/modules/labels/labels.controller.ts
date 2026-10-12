import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { normalizePagination } from "../../common/pagination";
import { LabelsService } from "./labels.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { Public } from "../auth/public.decorator";

@Controller("labels")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  @Public()
  @Get()
  @Permissions("label.view")
  findAll(@Query() query: { page?: string; limit?: string }) {
    return this.labels.findAll(normalizePagination(query));
  }

  @Post()
  @Permissions("label.create")
  create(@Body() body: { name: string; color: string }) {
    return this.labels.create(body.name, body.color);
  }

  @Patch(":id")
  @Permissions("label.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { name?: string; color?: string },
  ) {
    return this.labels.update(id, body);
  }

  @Patch(":id/active")
  @Permissions("label.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
  ) {
    return this.labels.updateActive(id, body.isActive);
  }

  @Get(":id/check")
  @Permissions("label.delete")
  check(@Param("id", ParseIntPipe) id: number) {
    return this.labels.check(id);
  }

  @Delete(":id")
  @Permissions("label.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.labels.remove(id);
  }
}
