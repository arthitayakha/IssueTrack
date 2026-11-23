import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

/** `closed` is a legacy value kept so old rows still load/save; the UI offers 3. */
export const SYSTEM_REPORT_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type SystemReportStatus = (typeof SYSTEM_REPORT_STATUSES)[number];

export const SYSTEM_REPORT_PROBLEM_TYPES = ["bug", "improvement", "other"] as const;
export type SystemReportProblemType = (typeof SYSTEM_REPORT_PROBLEM_TYPES)[number];

/** Body ของ `POST /system-reports` (multipart — แนบไฟล์อยู่ใน `files`) */
export class CreateSystemReportDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(5000)
  description!: string;

  /** ประเภทปัญหาที่ผู้แจ้งเลือก — bug / improvement / other */
  @IsIn(SYSTEM_REPORT_PROBLEM_TYPES)
  problemType!: SystemReportProblemType;

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
