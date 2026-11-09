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
import { AppsService, AppRecordInput, AppWriteInput } from "./apps.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { AuthUser } from "../auth/auth-user";

@Controller("apps")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppsController {
  constructor(private readonly apps: AppsService) {}

  // No @Permissions on purpose: any authenticated user (customers included)
  // must be able to load the app list when reporting an issue. The rows now
  // also carry company names + expiry — both are master data the board shows.
  //
  // `?mine=1` = **แอปของบริษัทผู้เรียกเท่านั้น** — ฟอร์มรายงานปัญหาส่ง flag นี้
  // เพื่อให้ dropdown เหลือเฉพาะแอปที่บริษัทของผู้รายงานใช้จริง (ตาม
  // `users.company_id` → `app_companies`) ที่อื่น (แท็บแอปใน /master-data,
  // ฟอร์มแอป, รายงาน) ไม่ส่ง → ได้ทุกแอปตามเดิม และ fail-open เมื่อผู้เรียก
  // ไม่มีบริษัท (แอดมิน/โปรแกรมเมอร์) ก็ยังได้ทุกแอป
  @Get()
  findAll(
    @Query() query: { page?: string; limit?: string; mine?: string },
    @CurrentUser() user: AuthUser,
  ) {
    const mine = query.mine === "1" || query.mine === "true";
    return this.apps.findAll(normalizePagination(query), mine ? (user?.companyId ?? null) : null);
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
