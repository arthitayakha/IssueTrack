import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

/** อัปเดตข้อมูลติดต่อกลาง — ส่งช่องไหนก็ได้ (ช่องที่ไม่ส่ง = ไม่แตะ) */
export class UpdateHelpCenterSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  supportPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  workingHours?: string;

  /** โปรแกรมเมอร์ที่ให้ลูกค้าติดต่อได้ — ส่ง array ว่าง = ล้างทั้งหมด */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(1, { each: true })
  contactUserIds?: number[];

  /**
   * map `company_id` → ผู้ติดต่อของบริษัทนั้น · ไม่ส่ง key = ใช้ `contactUserIds`
   * เป็น fallback; ส่ง array ว่าง = บริษัทนั้นตกไปใช้ข้อมูลติดต่อกลาง
   * (รายละเอียด/ขอบเขตตรวจเพิ่มใน service)
   */
  @IsOptional()
  @IsObject()
  contactUsersByCompany?: Record<string, number[]>;
}
