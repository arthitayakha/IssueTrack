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
import { ColumnsService } from "./columns.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  @Get("boards/:boardId/columns")
  @Permissions("board.view")
  findByBoard(@Param("boardId", ParseIntPipe) boardId: number) {
    return this.columns.findByBoard(boardId);
  }

  @Post("boards/:boardId/columns")
  @Permissions("board.column.create")
  create(
    @Param("boardId", ParseIntPipe) boardId: number,
    @Body() body: { status: string; customName?: string },
  ) {
    return this.columns.create(boardId, body.status, body.customName);
  }

  @Patch("columns/:id")
  @Permissions("board.column.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { customName?: string; isHidden?: boolean; position?: number },
  ) {
    return this.columns.update(id, body);
  }

  @Delete("columns/:id")
  @Permissions("board.column.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.columns.remove(id);
  }
}
