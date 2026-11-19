import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";
import type { IssueTaskType } from "@kanban/shared";

/**
 * DTO ของเส้นงาน (`POST /issues`, `PUT /issues/:id`, move, assign) —
 * เดิมเป็น inline type/interface ซึ่ง `ValidationPipe` **ไม่ validate เลย**
 * (whitelist ทำงานเฉพาะ metatype เป็น class) → ค่าผิดรูปแบบหลุดเข้า service
 * แล้วกลายเป็น **500 จาก PG** หรือผลลัพธ์แปลก ๆ เช่น:
 *
 * - `POST /issues` ไม่ส่ง `statusId` → `findOne({ id: undefined })` แมตช์แถว
 *   **แรก**ของตารางสถานะแบบสุ่ม (เช็คสถานะไร้ความหมาย)
 * - `PUT /issues/:id/move` ส่ง `statusId` เป็น string → cast error = 500
 *
 * ความยาวผูกกับคอลัมน์จริง (`issues.title` varchar 300, `custom_category`
 * varchar 500) — เกิน = 400 ไม่ใช่ 500
 */

export class CreateIssueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  /** `text NOT NULL` — ว่าง "" ได้ แต่ไม่ส่งมาเลย = 400 (เดิม 500) */
  @IsString()
  description!: string;

  /** บังคับส่ง — ไม่งั้นค่าหายไปทำให้เช็คสถานะแมตช์แถวแรกแบบสุ่ม */
  @IsInt()
  statusId!: number;

  @IsOptional()
  @IsInt()
  priorityId?: number;

  @IsOptional()
  @IsInt()
  categoryId?: number;

  @IsOptional()
  @IsInt()
  appId?: number;

  /**
   * มอบหมายตอนสร้าง — **เช็คสิทธิ์ `issue.assign` ซ้ำใน service** (เส้นนี้
   * guard แค่ `issue.create`) ดู `IssuesService.create`
   */
  @IsOptional()
  @IsInt()
  programmerId?: number;

  @IsOptional()
  @IsInt()
  customerId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  customCategory?: string;

  /** รับไว้เท่ากับพฤติกรรมเดิม (service รองรับอยู่แล้ว) — web ไม่ได้ส่ง */
  @IsOptional()
  @IsInt()
  labelId?: number;
}

export class UpdateIssueDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** `null` = ล้างค่า — `@IsOptional()` ข้ามทั้ง `undefined` และ `null` */
  @IsOptional()
  @IsInt()
  priorityId?: number | null;

  @IsOptional()
  @IsInt()
  categoryId?: number | null;

  @IsOptional()
  @IsInt()
  labelId?: number | null;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  labelIds?: number[];

  @IsOptional()
  @IsString()
  analysisCause?: string | null;

  @IsOptional()
  @IsString()
  resolution?: string | null;

  /**
   * ค่าจริง (`bug`/`ma`/`requirement`) หรือ `null` (ล้าง) — `@IsOptional()`
   * ข้ามทั้ง `undefined` และ `null` · `IsIn` ตรงกับ whitelist ใน service
   * (ค่าแปลก = 400 ที่ pipe ก่อนถึง service)
   */
  @IsOptional()
  @IsIn(["bug", "ma", "requirement"])
  taskType?: IssueTaskType | null;
}

export class MoveIssueDto {
  @IsInt()
  statusId!: number;
}

export class AssignIssueDto {
  /**
   * ⚠️ **ต้องส่งคีย์นี้เสมอ** (ค่า `null` = ล้างผู้รับผิดชอบ) — ถ้าไม่ส่งมา
   * เลย (`undefined`) จะโดน `@ValidateIf` ปล่อยเข้า service แล้ว
   * `findOne({ id: undefined })` แมตช์ user **แถวแรกแบบสุ่ม** (เดิมเป็นบั๊ก
   * เงียบที่อยู่ก่อนหน้าด้วย) — condition นี้รัน `IsInt` เมื่อค่าไม่ใช่
   * `null` เท่านั้น: `undefined` → 400, `null` → ผ่าน, `"x"` → 400
   */
  @ValidateIf((_obj, value) => value !== null)
  @IsInt()
  programmerId!: number | null;
}
