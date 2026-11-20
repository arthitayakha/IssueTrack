import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

/** Self-service rename + phone (e-mail/password have their own DTOs). */
export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  /** ไม่ส่ง = ไม่เปลี่ยน; ส่ง `""` หรือ `null` = ล้างเบอร์ออก */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;
}
