import { IsOptional, IsString, MaxLength } from "class-validator";

/** อัปเดตข้อมูลติดต่อกลางของศูนย์ช่วยเหลือ — ส่งช่องไหนก็ได้ (ช่องที่ไม่ส่ง = ไม่แตะ) */
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
}
