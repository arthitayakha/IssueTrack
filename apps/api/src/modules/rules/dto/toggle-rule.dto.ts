import { IsBoolean } from "class-validator";

/**
 * `PATCH /rules/:id/toggle` — เดิมเป็น inline type ซึ่ง `ValidationPipe` ไม่
 * validate แล้ว controller ห่อด้วย `Boolean(body?.isActive)` → ส่ง `"false"`
 * (string จาก caller ฝั่งอื่น) จะกลายเป็น **`true`** (toggle สลับค่าผิด) —
 * DTO นี้บังคับ boolean จริง: ไม่ใช่ boolean = 400
 */
export class ToggleRuleDto {
  @IsBoolean()
  isActive!: boolean;
}
