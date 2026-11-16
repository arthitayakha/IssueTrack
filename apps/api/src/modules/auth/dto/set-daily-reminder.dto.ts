import { IsBoolean } from "class-validator";

/**
 * `PATCH /auth/profile/reminder` — สวิตซ์ "แจ้งเตือนรายวัน" ใน popup โปรไฟล์
 * (self-service: ไม่ต้องมี permission — เหมือน `PATCH /auth/profile`)
 */
export class SetDailyReminderDto {
  @IsBoolean()
  enabled!: boolean;
}
