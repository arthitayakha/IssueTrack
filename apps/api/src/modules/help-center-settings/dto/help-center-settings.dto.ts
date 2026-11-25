import { IsObject, IsOptional } from "class-validator";

/**
 * อัปเดตรายชื่อผู้ติดต่อ **ต่อบริษัทเท่านั้น** — รายชื่อหลัก/ข้อมูลติดต่อกลางถูก
 * ถอดออกแล้ว (ไม่มี global fallback) · บริษัทที่ไม่มี key = ไม่มีผู้ติดต่อ
 * (ป๊อปอัพโชว์ข้อความ "ยังไม่มีข้อมูลติดต่อ")
 */
export class UpdateHelpCenterSettingsDto {
  @IsOptional()
  @IsObject()
  contactUsersByCompany?: Record<string, number[]>;
}
