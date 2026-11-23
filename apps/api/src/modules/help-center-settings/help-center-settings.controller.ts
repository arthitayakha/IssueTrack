import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { HelpCenterSettingsService } from "./help-center-settings.service";
import { UpdateHelpCenterSettingsDto } from "./dto/help-center-settings.dto";

/**
 * ข้อมูลติดต่อกลางของศูนย์ช่วยเหลือ
 * - `GET` เปิดให้คนที่ล็อกอินอยู่ (ลูกค้าต้องเห็นช่องทางติดต่อ)
 * - `PATCH` กันด้วย `system_report.update` (แอดมินเท่านั้น)
 *
 * ปุ่ม "ส่งอีเมล" เป็น `mailto:` ฝั่งเว็บ — ไม่มี endpoint ส่งเมลฝั่งเซิร์ฟเวอร์
 */
@Controller("help-center")
@UseGuards(JwtAuthGuard, RolesGuard)
export class HelpCenterSettingsController {
  constructor(private readonly service: HelpCenterSettingsService) {}

  @Get("contact")
  contact() {
    return this.service.get();
  }

  @Patch("contact")
  @Permissions("system_report.update")
  update(@Body() dto: UpdateHelpCenterSettingsDto) {
    return this.service.update(dto);
  }
}
