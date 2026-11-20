import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from "class-validator";

/**
 * Body ของ `POST /notifications/contact` — client ส่งแค่ข้อความ + คู่สัญญา
 * (ผู้รับถูกกำหนดที่เซิร์ฟเวอร์เสมอ ห้ามส่ง userId มาเอง) · ValidationPipe
 * (`whitelist: true`) จะทิ้ง field อื่นที่ไม่ได้ประกาศไว้ที่นี่
 */
export class ContactMessageDto {
  /** ข้อความที่พิมพ์/เลือกจากปุ่มสำเร็จรูป — 1–200 ตัวอักษร */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  message!: string;

  @IsInt()
  @Min(1)
  appId!: number;

  @IsInt()
  @Min(1)
  companyId!: number;

  /** ชื่อสำหรับหัวข้ออีเมล/แถวแจ้งเตือน — ไม่ใช้กรองข้อมูล */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  appName!: string;

  @IsString()
  @MaxLength(200)
  companyName!: string;
}
