import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth-user";
import { NotificationsService } from "./notifications.service";

/** Each user only ever sees and mutates their own notifications — no extra permission needed. */
@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
    @Query("tab") tab?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : NaN;
    const parsedPage = page ? parseInt(page, 10) : NaN;
    const size = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;
    const pageNum = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    return this.notifications.list(Number(user.id), {
      limit: size,
      offset: (pageNum - 1) * size,
      // anything unknown falls back to the full (unfiltered) list
      tab: tab === "inbox" || tab === "general" || tab === "archived" ? tab : undefined,
    });
  }

  @Patch(":id/read")
  markRead(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(Number(user.id), id);
  }

  @Post("read-all")
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(Number(user.id));
  }

  @Patch(":id/archive")
  archive(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.notifications.archive(Number(user.id), id);
  }
}
