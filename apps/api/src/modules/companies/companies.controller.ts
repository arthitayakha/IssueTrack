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
import { CompaniesService } from "./companies.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

/**
 * บริษัท master data — same routes as `AppsController`.
 *
 * `GET /companies` is deliberately open to any authenticated user (no
 * `@Permissions`), the same deal as `GET /apps`: the app form needs the list to
 * build its company picker, and company names already travel with every row of
 * `GET /apps`, so guarding this one would only lock out an admin's app editor.
 * Creating/updating/deleting stay behind `company.*`.
 */
@Controller("companies")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  findAll(@Query() query: { page?: string; limit?: string }) {
    return this.companies.findAll(normalizePagination(query));
  }

  @Post()
  @Permissions("company.create")
  create(@Body() body: { name: string }) {
    return this.companies.create(body.name);
  }

  @Patch(":id")
  @Permissions("company.update")
  update(@Param("id", ParseIntPipe) id: number, @Body() body: { name?: string }) {
    return this.companies.update(id, body);
  }

  @Patch(":id/active")
  @Permissions("company.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
  ) {
    return this.companies.updateActive(id, body.isActive);
  }

  // apps reference companies now, so deletion needs the same pre-flight
  // check the apps tab already runs before it opens the confirm dialog
  @Get(":id/check")
  @Permissions("company.delete")
  check(@Param("id", ParseIntPipe) id: number) {
    return this.companies.check(id);
  }

  @Delete(":id")
  @Permissions("company.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.companies.remove(id);
  }
}
