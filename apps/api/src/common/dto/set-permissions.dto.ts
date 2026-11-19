import { ArrayMaxSize, IsArray, IsString } from "class-validator";

/**
 * `PUT /roles/:id/permissions` และ `PUT /positions/:id/permissions` —
 * รายชื่อ permission code ที่จะบันทึก
 *
 * DTO เช็คเฉพาะรูปแบบ (array ของ string, เพดานกัน payload ยักษ์) —
 * **ตัวกรอง code จริงอยู่ใน service** (`ALL_PERMISSIONS.includes`) ตรงกับ
 * `permissions.updateMatrix` — เดิมสองเส้นนี้ insert string อะไรก็ได้ลง DB
 */
export class SetPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(600)
  permissions!: string[];
}
