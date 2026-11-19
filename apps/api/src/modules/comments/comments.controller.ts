import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { normalizePagination } from "../../common/pagination";
import { CommentsService } from "./comments.service";
import { CreateCommentDto, UpdateCommentDto } from "./dto/comment.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser, actorInfo } from "../auth/auth-user";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get("issues/:id/comments")
  @Permissions("comment.view")
  findByIssue(
    @Param("id", ParseIntPipe) id: number,
    @Query() query: { page?: string; limit?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.comments.findByIssue(id, normalizePagination(query), user);
  }

  @Post("issues/:id/comments")
  @Permissions("comment.create")
  create(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    // service เช็คขอบเขตงานก่อน insert (404 = งานไม่มี/ไม่ใช่ของเรา)
    return this.comments.create(id, body.content, user, actorInfo(user));
  }

  @Put("comments/:id")
  @Permissions("comment.own.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.comments.update(id, body.content, Number(user.id), actorInfo(user));
  }

  @Delete("comments/:id")
  @Permissions("comment.own.delete")
  remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.comments.remove(id, Number(user.id), user.roleId, user.positionId, actorInfo(user));
  }
}
