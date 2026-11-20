import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export const SYSTEM_REPORT_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type SystemReportStatus = (typeof SYSTEM_REPORT_STATUSES)[number];

/** Body ของ `POST /system-reports` (multipart — แนบไฟล์อยู่ใน `files`) */
export class CreateSystemReportDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(5000)
  description!: string;

  /** หน้าที่พบปัญหา (เช่น `/boards`) — ไม่บังคับ */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pageUrl?: string;
}

export class UpdateSystemReportStatusDto {
  @IsIn(SYSTEM_REPORT_STATUSES)
  status!: SystemReportStatus;
}
