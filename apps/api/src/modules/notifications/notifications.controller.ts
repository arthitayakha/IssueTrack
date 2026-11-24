import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Param,
  ParseIntPipe,
  Query,
  Sse,
  UseGuards,
} from "@nestjs/common";
import { interval, merge } from "rxjs";
import { finalize, map } from "rxjs/operators";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth-user";
import { Permissions } from "../auth/permissions.decorator";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationStreamService } from "./notification-stream.service";
import { ContactMessageDto } from "../notifications/dto/contact-message.dto";

/** Each user only ever sees and mutates their own notifications — no extra permission needed. */
@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly stream: NotificationStreamService,
  ) {}

  /**
   * Real-time feed behind the Facebook-style toast. The global JwtAuthGuard
   * covers this route too — the browser reads it with `fetch()` + ReadableStream
   * so the JWT stays in the Authorization header (EventSource cannot set
   * headers). Nest unsubscribes when the request closes, which runs `finalize`
   * and drops this tab from the fan-out set.
   */
  @Sse("stream")
  streamEvents(@CurrentUser() user: AuthUser) {
    const userId = Number(user.id);
    const subject = this.stream.subscribe(userId);
    const cleanup = () => this.stream.unsubscribe(userId, subject);
    // keep idle sockets alive through proxies that would otherwise buffer them
    const heartbeat$ = interval(25_000).pipe(map(() => ({ type: "ping", data: "" })));
    return merge(subject.asObservable(), heartbeat$).pipe(finalize(cleanup));
  }

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

  /**
   * ลูกค้าทั้งหมด (active) — ให้แอดมินกด "ติดต่อลูกค้า" บน navbar (ไม่มีบริษัท
   * เป็นบริบทตรงนั้น) · กันด้วย `user.view`
   */
  @Get("customer-contacts")
  @Permissions("user.view")
  customerContacts() {
    return this.notifications.allCustomerContacts();
  }

  /**
   * ผู้ติดต่อของแอดมิน (ชื่อ/อีเมล/เบอร์) — ให้ลูกค้า/สตาฟฟ์กด "ติดต่อแอดมิน"
   * บนหน้า `/systems` (กล่องเข้าได้รายชื่อนี้แนบมาในแถวอยู่แล้ว ไม่ต้องยิงซ้ำ)
   * **ไม่ใส่ `@Permissions`** — ลูกค้าต้องเรียกได้ · ยังอยู่ใต้ `JwtAuthGuard`
   * ของ controller (คนที่ล็อกอินอยู่เท่านั้น)
   */
  @Get("admin-contacts")
  adminContacts() {
    return this.notifications.adminContacts();
  }

  /**
   * ผู้ติดต่อของบริษัท (ชื่อ/อีเมล/เบอร์) — ใช้ตอนกดปุ่ม "ติดต่อลูกค้า" ใน
   * ป๊อปอัพสัญญาบน `/systems` (กล่องเข้าได้ข้อมูลนี้แนบมาในแถวอยู่แล้ว) ·
   * กันด้วย `user.view` เพราะเป็นข้อมูลส่วนตัวของลูกค้า
   */
  @Get("contacts")
  @Permissions("user.view")
  contacts(@Query("companyId") companyId?: string) {
    const id = companyId ? parseInt(companyId, 10) : NaN;
    return this.notifications.contactsForCompany(Number.isInteger(id) && id > 0 ? id : 0);
  }

  /**
   * clamp **เท่ากับที่ service ทำ** (`Math.min(Math.max(…, 1), 200)`) ก่อน
   * คำนวณ offset — เดิม offset ใช้ `size` ดิบ: `?limit=500&page=2` → offset
   * 500 แต่ service คืน 200 แถว = เพจเพี้ยน (ข้าม/ซ้ำแถว)
   */
  private pageArgs(limit?: string, page?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : NaN;
    const parsedPage = page ? parseInt(page, 10) : NaN;
    const size = Math.min(
      Math.max(Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 5, 1),
      200,
    );
    const pageNum = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    return { limit: size, offset: (pageNum - 1) * size };
  }

  /** The single unread inbox — a row vanishes from here the moment it is read. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
  ) {
    return this.notifications.list(Number(user.id), this.pageArgs(limit, page));
  }

  /** The read archive — rows stay in the DB after reading and are retrievable here. */
  @Get("read")
  listRead(
    @CurrentUser() user: AuthUser,
    @Query("limit") limit?: string,
    @Query("page") page?: string,
  ) {
    return this.notifications.listRead(Number(user.id), this.pageArgs(limit, page));
  }

  /**
   * กด "แจ้งเตือน..." จากป๊อปอัพสัญญา — สร้างแถวในกล่องเข้า + ส่งอีเมลให้ฝ่ายตรงข้าม
   * (ในแอป + อีเมล) · ผู้รับถูกกำหนดที่ service เสมอ กันส่งข้อความข้ามบริษัท
   */
  @Post("contact")
  sendContact(
    @CurrentUser() user: AuthUser,
    @Body() dto: ContactMessageDto,
  ) {
    return this.notifications.notifyContactMessage({
      fromUserId: Number(user.id),
      message: dto.message,
      appId: dto.appId,
      companyId: dto.companyId,
      appName: dto.appName,
      companyName: dto.companyName,
    });
  }

  /**
   * Reading one notification marks it read in the DB — the row disappears
   * from the bell but is kept as a record (`is_read` / `read_at`).
   * Someone else's id → `null`, their row stays put.
   */
  @Patch(":id/read")
  markRead(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(Number(user.id), id);
  }

  /** The inbox header button — marks every unread row read, keeps every row. */
  @Patch("read-all")
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(Number(user.id));
  }

  /** Permanent deletion for cleanup — reading no longer calls these. */
  @Delete(":id")
  remove(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.notifications.remove(Number(user.id), id);
  }

  @Delete()
  removeAll(@CurrentUser() user: AuthUser) {
    return this.notifications.removeAll(Number(user.id));
  }
}
