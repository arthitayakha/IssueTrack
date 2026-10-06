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
import { BoardsService } from "./boards.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("boards")
@UseGuards(JwtAuthGuard, RolesGuard)
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  @Permissions("board.view")
  findAll() {
    return this.boards.findAll();
  }

  @Post()
  @Permissions("board.view")
  create(@Body() body: { name: string; description?: string }) {
    return this.boards.create(body.name, body.description);
  }

  @Get(":id")
  @Permissions("board.view")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.boards.findOne(id);
  }

  @Patch(":id")
  @Permissions("board.view")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.boards.update(id, body);
  }

  @Delete(":id")
  @Permissions("board.view")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.boards.remove(id);
  }
}
