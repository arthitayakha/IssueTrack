import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth-user";
import { HelpCenterSettingsService } from "./help-center-settings.service";
import { UpdateHelpCenterSettingsDto } from "./dto/help-center-settings.dto";

/**
 * ช่องทางติดต่อที่ลูกค้าเห็น
 * - `GET contact` เปิดให้คนที่ล็อกอินอยู่ — resolve ตาม `users.company_id` ของคนเรียก
 *   (บริษัทที่มี mapping เองเห็นชุดนั้น, ที่เหลือเห็น global fallback)
 * - `GET contact/config` / `GET programmers` / `PATCH contact` กันด้วย `system.update`
 *   (แอดมิน editing mapping ของทุกบริษัทได้ใน dialog เดียว)
 *
 * หน้าติดต่อใน `/systems`: ถ้ามีโปรแกรมเมอร์ที่แอดมินเลือก → โชว์การ์ดรายคน
 * ถ้าไม่มี → โชว์ข้อมูลติดต่อกลาง (อีเมล/เบอร์/เวลาทำการ) จากแถวเดียวกัน
 * ปุ่ม "ส่งอีเมล" เป็น `mailto:` ฝั่งเว็บ — ไม่มี endpoint ส่งเมลฝั่งเซิร์ฟเวอร์
 */
@Controller("help-center")
@UseGuards(JwtAuthGuard, RolesGuard)
export class HelpCenterSettingsController {
  constructor(private readonly service: HelpCenterSettingsService) {}

  /** รายชื่อที่คนนี้เห็นจริง (บริษัทของเขา → override, ไม่มี → global) */
  @Get("contact")
  contact(@CurrentUser() user: AuthUser) {
    return this.service.get(user.companyId ?? null);
  }

  /** config ดิบสำหรับ dialog "จัดการผู้ติดต่อ" บน /systems */
  @Get("contact/config")
  @Permissions("system.update")
  config() {
    return this.service.config();
  }

  /** ตัวเลือกโปรแกรมเมอร์สำหรับ dialog "จัดการผู้ติดต่อ" บน /systems */
  @Get("programmers")
  @Permissions("system.update")
  programmers() {
    return this.service.programmers();
  }

  @Patch("contact")
  @Permissions("system.update")
  update(@Body() dto: UpdateHelpCenterSettingsDto) {
    return this.service.update(dto);
  }
}
