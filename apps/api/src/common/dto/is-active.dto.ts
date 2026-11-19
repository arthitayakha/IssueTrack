import { IsBoolean } from "class-validator";

/**
 * `PATCH <master>/:id/active` — สวิตซ์เปิด/ปิดแถว master data (statuses,
 * priorities, labels, companies, categories, roles, positions, apps)
 *
 * เดิมทุกเส้นรับ `{ isActive: boolean }` เป็น inline type → ไม่ผ่าน
 * `ValidationPipe` → ส่ง `"false"` (string) คือก็จะถูกโยนเข้าคอลัมน์
 * boolean ของ PG ตรง ๆ — DTO นี้บังคับ boolean จริง: ไม่ใช่ = 400
 * (เส้น `/users/:id/active` มี DTO ของตัวเองใน `users/dto/user.dto.ts`)
 */
export class IsActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
