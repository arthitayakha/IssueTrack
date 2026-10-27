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
  list(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : NaN;
    return this.notifications.list(
      Number(user.id),
      Number.isInteger(parsed) && parsed > 0 ? parsed : 50,
    );
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
