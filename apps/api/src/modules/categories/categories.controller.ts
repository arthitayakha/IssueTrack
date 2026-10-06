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
import { CategoriesService } from "./categories.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("categories")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Permissions("category.view")
  findAll() {
    return this.categories.findAll();
  }

  @Post()
  @Permissions("category.create")
  create(@Body() body: { name: string; position?: string }) {
    return this.categories.create(body.name, body.position);
  }

  @Patch(":id")
  @Permissions("category.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { name?: string; position?: string },
  ) {
    return this.categories.update(id, body);
  }

  @Patch(":id/active")
  @Permissions("category.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
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
