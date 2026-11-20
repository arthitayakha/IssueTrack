import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

/**
 * DTO ของ `POST /users` / `PATCH /users/:id` — **สำคัญกว่าความสวยงาม**:
 * เดิมทั้งสองเส้นรับ inline type (interface) ซึ่ง `ValidationPipe` ไม่ validate
 * (whitelist ทำงานเฉพาะ metatype เป็น class) และ `UsersService.create` spread
 * ร่าง body เข้า TypeORM ตรง ๆ → field ที่มีอยู่ใน entity เช่น `id` /
 * `isActive` หลุดเข้าไปได้ = **mass assignment** (ส่ง `{ id: 1, … }` ทับ row
 * เดิมได้) · DTO เหล่านี้ whitelist เอง: ไม่ประกาศ = ถูก strip ทิ้ง
 *
 * ความยาวผูกกับคอลัมน์จริง (`users.email` varchar 150, `users.name` varchar
 * 100) — เกิน = 400 ไม่ใช่ 500 จาก PG
 *
 * รหัสผ่านขั้นต่ำ 6 ตัว = เงื่อนไขเดียวกับ `LoginDto`
 */

export class CreateUserDto {
  @IsEmail()
  @MaxLength(150)
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(255)
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  /** เบอร์ติดต่อ — ไม่ส่ง/ส่ง `""` = ไม่เก็บ (เก็บเป็น NULL) */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  /** `null` = ไม่มีบทบาท — `@IsOptional()` ข้ามทั้ง `undefined` และ `null` */
  @IsOptional()
  @IsInt()
  roleId?: number | null;

  @IsOptional()
  @IsInt()
  positionId?: number | null;

  @IsOptional()
  @IsInt()
  companyId?: number | null;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  /** เบอร์ติดต่อ — ส่ง `""`/`null` = ล้างออก */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  /**
   * ⚠️ ฟอร์มแก้ไขส่ง `password: ""` เมื่อ**ไม่ตั้งใจเปลี่ยนรหัสผ่าน** —
   * `ValidateIf` ปิด validation ของช่องนี้ทั้งหมดเมื่อค่าว่าง/ไม่ส่งมา
   * (service ก็มอง `""` เป็น "ไม่เปลี่ยน" อยู่แล้ว) แต่รหัสที่กรอกจริง
   * ต้องเป็น string ≥ 6 ตัว — ค่าอื่นที่ไม่ใช่ string (number/object) จะ
   * ผ่าน condition แล้วโดน `@IsString` ตีทิ้งเป็น 400
   */
  @ValidateIf(
    (_obj, value) => value !== undefined && value !== null && value !== "",
  )
  @IsString()
  @MinLength(6)
  @MaxLength(255)
  password?: string;

  @IsOptional()
  @IsInt()
  roleId?: number | null;

  @IsOptional()
  @IsInt()
  positionId?: number | null;

  @IsOptional()
  @IsInt()
  companyId?: number | null;
}

/** `PATCH /users/:id/active` — เดิมรับอะไรก็ได้แล้วโยนเข้าคอลัมน์ boolean */
export class UpdateUserActiveDto {
  @IsBoolean()
  isActive!: boolean;
}
