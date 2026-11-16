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
import {
  AppsService,
  AppBuyInput,
  AppRecordInput,
  AppRenewInput,
  AppWriteInput,
} from "./apps.service";
import { MaUsageService } from "./ma-usage.service";
import { viewerScope } from "./viewer-scope";
import { AuthUser } from "../auth/auth-user";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("apps")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppsController {
  constructor(
    private readonly apps: AppsService,
    private readonly maUsage: MaUsageService,
  ) {}

  // No @Permissions on purpose: any authenticated user (customers included)
  // must be able to load the app list when reporting an issue. The rows now
  // also carry company names + expiry — both are master data the board shows.
  //
  // `?visible=1` = **รายการแอปที่ฟอร์มรายงานปัญหาใช้** — คืนเฉพาะแอปที่เปิดใช้
  // งาน (`is_visible = true`)
  //
  // `?mine=1` (ฟอร์มส่งคู่กับ `visible=1`) = **กรองเหลือเฉพาะแอปที่ผูกกับ
  // บริษัทของผู้เรียก** — fail-open ทุกทาง (ไม่มีบริษัท / ไม่มีแถวผูก / สตาฟฟ์ /
  // แอปที่ผูกถูกปิดหมด) = คืนรายการเต็มเหมือนไม่ได้กรอง ดูเงื่อนไขเต็มใน
  // `AppsService.findAll` · ไม่ส่ง `mine` = เหมือนเดิมทุกประการ (ข้อสรุปเก่า
  // "เชื่อมหรือไม่เชื่อม ลูกค้าก็เห็นแอปทุกตัว" ยังใช้ได้กับ path ที่ไม่ส่ง flag)
  // ที่อื่น (แท็บแอปใน /master-data, /systems, /reports, ชิปบนบอร์ด) ไม่ส่ง flag
  // → ได้ทุกแอปรวมที่ปิดสถานะ เพราะหน้าเหล่านั้นต้องเห็นแอปที่ปิดเพื่อเปิดกลับได้
  //
  // ⚠️ นี่คือ**การแสดงผลเท่านั้น** — `IssuesService.create` ยังไม่มี guard
  // cross-company (400 ตัวเดิมถูกถอดออกไปพร้อมกัน) อย่าเพิ่มกลับโดยไม่ถามก่อน
  //
  // **แถวด้านใน (`companies`) ถูกตัดออกจากลูกค้า** (`viewer-scope.ts` →
  // `mode: "none"`): รายชื่อแอปยังครบ**ทุกตัว**ตามข้อสรุปด้านบน แต่วันที่สัญญา +
  // ชั่วโมง MA ของบริษัท**ไหนก็ตาม**อ่านไม่ได้จาก route นี้อีก — เดิมมันเป็นประตู
  // ที่สองที่ลูกค้าขุด API แล้วเห็นสัญญาของบริษัทอื่นได้ (ของตัวเองดูที่ `/systems`)
  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: { page?: string; limit?: string; visible?: string; mine?: string },
  ) {
    const visible = query.visible === "1" || query.visible === "true";
    const mine = query.mine === "1" || query.mine === "true";
    // `maExpired` (boolean) — **ธงเดียว**ที่ route นี้คืนให้ลูกค้าเพิ่มจากชื่อแอป:
    // ฟอร์มแจ้งปัญหาใช้บล็อกเมื่อ "คู่ของผู้เรียก" หมดอายุ (`/issues/new` →
    // `isMaExpired()`) คำนวณใน `AppsService.findAll` จาก `expiresAt` ของ**ช่วง
    // ล่าสุด**ของคู่ตัวเอง แล้วคืนแค่ true/false — ไม่เปิดวันที่/ชั่วโมงกลับมา
    // (แถว `companies` ยังถูกตัดตาม `viewer-scope.ts`) · สตาฟฟ์/ไม่มีบริษัท/
    // ไม่มีแถวคู่ = `false` (fail-open) · route นี้ไม่เรียก `reconcile()` เลย
    return this.apps.findAll(normalizePagination(query), {
      visible,
      mine,
      contract: viewerScope(user, "none"),
    });
  }

  /**
   * **จำนวนรายการที่ถูกตัดจากแต่ละช่วง MA** (`?recordIds=24,25,26`)
   *
   * เติมคอลัมน์ "รายการที่ตัด" ในรายงาน/แท็บประวัติ — ยิง **ครั้งเดียวต่อหน้า**
   * แทนการยิงต่อแถว (รายการจริงค่อยโหลดตอนกดเปิดด้วย route ด้านล่าง)
   *
   * guard เป็น ANY-of: หน้า `/systems` มาด้วย `system.view` หน้ารายงานมาด้วย
   * `report.view` — สอง surface คนละ permission card จึงแชร์ endpoint เดียว
   *
   * **ลูกค้าถูกจำกัดให้เหลือเฉพาะ recordId ของบริษัทตัวเอง** (`viewer-scope.ts`)
   * — ไม่งั้น route นี้จะเป็นช่องทางอ่าน "กี่งาน/ใช้ไปกี่ชม." ของคู่บริษัทอื่นได้
   * ถึงจะไม่มีชื่องานก็ตาม (id แปลกหน้าถูกตัดทิ้ง = ไม่คืนแถว)
   */
  @Get("usage-counts")
  @Permissions("system.view", "report.view")
  usageCounts(
    @CurrentUser() user: AuthUser,
    @Query("recordIds") recordIds?: string,
  ) {
    const ids = (recordIds ?? "")
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value));
    return this.maUsage.usageCounts(ids, viewerScope(user, "own"));
  }

  // The CRUD below serves TWO surfaces with separate permission cards:
  // the apps tab in `/master-data` (`app.*`) and the `/systems` page
  // (`system.*`). Same endpoint, either permission opens it (guard is OR).
  //
  // **ชื่ออย่างเดียว** — ข้อมูลระบบ (บริษัท/วันที่/MA) ไม่ได้ผ่านสอง route
  // นี้แล้ว แต่ไปที่ `/apps/:id/companies` ด้านล่าง (แท็บแอปจึงสร้าง/แก้ไข
  // แอปได้โดยไม่ไปเขียนข้อมูลของหน้า `/systems`)
  @Post()
  @Permissions("app.create", "system.create")
  create(@Body() body: AppWriteInput) {
    return this.apps.create(body);
  }

  @Patch(":id")
  @Permissions("app.update", "system.update")
  update(@Param("id", ParseIntPipe) id: number, @Body() body: AppWriteInput) {
    return this.apps.update(id, body);
  }

  /* --- รายการข้อมูลระบบ: 1 แถวต่อ 1 ช่วงเวลา (append / patch / delete) --- */

  @Post(":id/companies")
  @Permissions("app.create", "system.create")
  addRecord(@Param("id", ParseIntPipe) id: number, @Body() body: AppRecordInput) {
    return this.apps.addRecord(id, body);
  }

  @Patch(":id/companies/:recordId")
  @Permissions("app.update", "system.update")
  updateRecord(
    @Param("id", ParseIntPipe) id: number,
    @Param("recordId", ParseIntPipe) recordId: number,
    @Body() body: AppRecordInput,
  ) {
    return this.apps.updateRecord(id, recordId, body);
  }

  /** ลบได้เฉพาะรายการ — ตัวแอปใช้ `DELETE /apps/:id` ด้านล่าง */
  @Delete(":id/companies/:recordId")
  @Permissions("app.delete", "system.delete")
  removeRecord(
    @Param("id", ParseIntPipe) id: number,
    @Param("recordId", ParseIntPipe) recordId: number,
  ) {
    return this.apps.removeRecord(id, recordId);
  }

  /**
   * **ย้อนกลับการต่ออายุ/ซื้อชั่วโมง** — ลบ **ช่วงเดียว** (แถวล่าสุดของคู่)
   * ต่างจาก route ด้านบนที่ลบทั้งคู่ · กฎ 3 ข้ออยู่ใน `removePeriod()`
   *
   * guard เป็น **OR** (`system.update` | `system.delete`): คนที่กดต่ออายุ/ซื้อ
   * ชม. ได้ต้องย้อนได้ด้วย ไม่งั้นแก้ความผิดของตัวเองไม่ได้ (สองปุ่มนั้นรับ
   * `system.update` อย่างเดียว)
   */
  @Delete(":id/companies/:recordId/period")
  @Permissions("system.update", "system.delete")
  removePeriod(
    @Param("id", ParseIntPipe) id: number,
    @Param("recordId", ParseIntPipe) recordId: number,
  ) {
    return this.apps.removePeriod(id, recordId);
  }

  /**
   * **ต่ออายุ** — ปิดช่วงเก่าแล้ว append ช่วงใหม่ให้คู่เดิม (`company_id`
   * ยืมจากแถวตั้งต้น ฟอร์มส่งมาแค่วันที่ 2 + จำนวน MA)
   *
   * route นี้**มีที่หน้า `/systems` ที่เดียว** (แท็บแอปใน `/master-data` ไม่มี
   * ปุ่มต่ออายุ) จึงรับ permission เดียวคือ `system.update` — ต่างจาก CRUD
   * ด้านบนที่เปิดสอง surface ด้วย OR
   */
  @Post(":id/companies/:recordId/renew")
  @Permissions("system.update")
  renewRecord(
    @Param("id", ParseIntPipe) id: number,
    @Param("recordId", ParseIntPipe) recordId: number,
    @Body() body: AppRenewInput,
  ) {
    return this.apps.renewRecord(id, recordId, body);
  }

  /**
   * **ซื้อชั่วโมง MA เพิ่ม** — append แถบใหม่ให้คู่เดิม (วันที่คงเดิม, `maHours`
   * มากขึ้น, `kind = 'buy'`) ต่างจาก renew ตรงที่กรอกมา**แค่จำนวนชั่วโมง**
   *
   * route นี้อยู่ที่ `/systems` ที่เดียวเหมือน renew จึงรับ `system.update`
   * เดียว — ปุ่ม "ซื้อชั่วโมง" โชว์เฉพาะแถวที่คงเหลือ ≤ 0 (ดู `canBuyHours()`)
   */
  @Post(":id/companies/:recordId/buy-hours")
  @Permissions("system.update")
  buyHours(
    @Param("id", ParseIntPipe) id: number,
    @Param("recordId", ParseIntPipe) recordId: number,
    @Body() body: AppBuyInput,
  ) {
    return this.apps.buyHours(id, recordId, body);
  }

  /**
   * **รายการที่ถูกตัดจากช่วง MA นี้** — นับ + รายการจริงของ `recordId`
   *
   * "ชั่วโมงของงานนี้เป็นของรอบไหน" คำนวณจาก `issues.actual_fix_at` (เวลาที่กรอก)
   * กับกติกาใน `ma-attribution.ts`: รอบที่มีผลอยู่ ณ ตอนกรอก · **ไม่เปลี่ยน**
   * ตัวเลข "ใช้ไป/คงเหลือ" เดิม — `pairUsedHours` ยังเป็นคู่เดียวกับที่จอโชว์อยู่
   * และ `Σ ทุกรอบ + unattributedHours` จะเท่ากับมันเสมอ (มีเทสต์คุม)
   *
   * ANY-of guard เหมือน `usage-counts`: `/systems` → `system.view`, รายงาน → `report.view`
   *
   * **ลูกค้าอ่านของบริษัทตัวเองไม่ได้** (`viewer-scope.ts`) — คืน 404 เหมือน
   * recordId ที่ไม่มีจริง เพราะ payload มี**ชื่อ/เลขงาน**ของคู่นั้นอยู่
   */
  @Get(":id/companies/:recordId/usage")
  @Permissions("system.view", "report.view")
  periodUsage(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Param("recordId", ParseIntPipe) recordId: number,
  ) {
    return this.maUsage.periodUsage(id, recordId, viewerScope(user, "own"));
  }

  @Patch(":id/active")
  @Permissions("app.update", "system.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
  ) {
    return this.apps.updateActive(id, body.isActive);
  }

  @Get(":id/check")
  @Permissions("app.delete", "system.delete")
  check(@Param("id", ParseIntPipe) id: number) {
    return this.apps.check(id);
  }

  @Delete(":id")
  @Permissions("app.delete", "system.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.apps.remove(id);
  }
}
