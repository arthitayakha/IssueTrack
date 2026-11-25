import { IsObject, IsOptional } from "class-validator";

/**
 * อัปเดตรายชื่อผู้ติดต่อ 2 ชั้น:
 * - `contactUsersByCompany` — คนเริ่มต้นของบริษัท (fallback)
 * - `contactUsersByApp` — คนของคู่ **แอป × บริษัท** (key = `appId:companyId`, ทับค่าบริษัท)
 *   แอปเดียวผูกหลายบริษัทได้ จึงต้องแยกตามบริษัท · ไม่มี key = ใช้ค่าบริษัท
 *   · array ว่าง = ตั้งใจไม่มีคนสำหรับคู่นี้
 *
 * ส่ง field ไหนก็ได้ (ไม่ส่ง = ไม่แตะของเดิม) · รายชื่อหลัก/ข้อมูลกลาง
 * ถูกถอดออกแล้ว (ไม่มี global fallback)
 */
export class UpdateHelpCenterSettingsDto {
  @IsOptional()
  @IsObject()
  contactUsersByCompany?: Record<string, number[]>;

  @IsOptional()
  @IsObject()
  contactUsersByApp?: Record<string, number[]>;
}
