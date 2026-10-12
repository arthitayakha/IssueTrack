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
import { ColumnsService } from "./columns.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { Public } from "../auth/public.decorator";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  @Public()
  @Get("columns")
  @Permissions("board.view")
  findAll(@Query() query: { page?: string; limit?: string }) {
    return this.columns.findAll(normalizePagination(query));
  }

  @Post("columns")
  @Permissions("board.column.create")
  create(
    @Body() body: { statusId: number },
  ) {
    return this.columns.create(body.statusId);
  }

  @Patch("columns/:id")
  @Permissions("board.column.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { customName?: string; isHidden?: boolean; isLocked?: boolean; position?: number },
  ) {
    return this.columns.update(id, body);
  }

  @Patch("columns/:id/unlock")
  @Permissions("board.column.unlock")
  unlock(@Param("id", ParseIntPipe) id: number) {
    return this.columns.update(id, { isLocked: false });
  }

  @Patch("columns/reorder")
  @Permissions("board.column.update")
  reorder(
    @Body() body: { items: Array<{ id: number; position: number }> },
  ) {
    return this.columns.reorder(body.items);
  }

  @Delete("columns/:id")
  @Permissions("board.column.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.columns.remove(id);
  }
}
