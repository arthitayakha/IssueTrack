import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth-user";
import { NotificationsService } from "../notifications/notifications.service";

/** Each user only ever sees and mutates their own notifications — no extra permission needed. */
@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * The badge number alone — polled by the navbar every 30s. The full list
   * stays on `GET /notifications` below, fetched only when the bell opens.
   * Declared before the list route for readability; `count` is a static path,
   * so it can never be mistaken for a page/limit query.
   */
  @Get("count")
  count(@CurrentUser() user: AuthUser) {
    return this.notifications.count(Number(user.id));
  }

  /** The single inbox — every row is unread, so there is no `tab` filter any more. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : NaN;
    const parsedPage = page ? parseInt(page, 10) : NaN;
    const size = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5;
    const pageNum = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    return this.notifications.list(Number(user.id), {
      limit: size,
      offset: (pageNum - 1) * size,
    });
  }

  /** Reading one notification = it is deleted (someone else's id → `null`). */
  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.notifications.remove(Number(user.id), id);
  }

  /** The inbox header button — clears every unread row of this account. */
  @Delete()
  removeAll(@CurrentUser() user: AuthUser) {
    return this.notifications.removeAll(Number(user.id));
  }
}
