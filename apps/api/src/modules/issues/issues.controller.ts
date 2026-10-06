import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { IssuesService } from "./issues.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get("boards/:boardId/issues")
  @Permissions("board.view")
  findByBoard(@Param("boardId", ParseIntPipe) boardId: number) {
    return this.issues.findByBoard(boardId);
  }

  @Get("issues/:id")
  @Permissions("issue.detail.view")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.issues.findOne(id);
  }

  @Post("boards/:boardId/issues")
  @Permissions("issue.create")
  create(
    @Param("boardId", ParseIntPipe) boardId: number,
    @Body()
    body: {
      title: string;
      description: string;
      columnId: number;
      priorityId?: number;
      categoryId?: number;
      programmerId?: number;
      customerId?: number;
    },
  ) {
    return this.issues.create(boardId, body);
  }

  @Put("issues/:id")
  @Permissions("issue.all.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body()
    body: {
      title?: string;
      description?: string;
      priorityId?: number;
      categoryId?: number;
    },
  ) {
    return this.issues.update(id, body);
  }

  @Put("issues/:id/move")
  @Permissions("issue.status.update")
  move(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { columnId: number },
  ) {
    return this.issues.move(id, body.columnId);
  }

  @Put("issues/:id/assign")
  @Permissions("issue.assign")
  assign(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { programmerId: number | null },
  ) {
    return this.issues.assign(id, body.programmerId);
  }

  @Put("issues/:id/time")
  @Permissions("time.actual.view")
  setTime(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { actualFixDuration: number },
  ) {
    return this.issues.setActualFixDuration(id, body.actualFixDuration);
  }

  @Delete("issues/:id")
  @Permissions("issue.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.issues.remove(id);
  }
}
