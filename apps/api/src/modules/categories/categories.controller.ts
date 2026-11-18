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
import { IsActiveDto } from "../../common/dto/is-active.dto";
import { CategoriesService } from "./categories.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("categories")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findAll(@Query() query: { page?: string; limit?: string }) {
    return this.categories.findAll(normalizePagination(query));
  }

  @Post()
  @Permissions("category.create")
  create(@Body() body: { name: string }) {
    return this.categories.create(body.name);
  }

  @Patch(":id")
  @Permissions("category.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { name?: string },
  ) {
    return this.categories.update(id, body);
  }

  @Patch(":id/active")
  @Permissions("category.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: IsActiveDto,
  ) {
    return this.categories.updateActive(id, body.isActive);
  }

  @Get(":id/check")
  @Permissions("category.delete")
  check(@Param("id", ParseIntPipe) id: number) {
    return this.categories.check(id);
  }

  @Delete(":id")
  @Permissions("category.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.categories.remove(id);
  }
}
