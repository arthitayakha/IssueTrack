import { IsNotEmpty, IsString } from "class-validator";

/**
 * `POST /issues/:id/comments` / `PUT /comments/:id` — เดิมเป็น inline type
 * ไม่ผ่าน `ValidationPipe`: non-string ถึง service = 500, empty string ก็ผ่าน
 * (คอมเมนต์ว่างไร้ความหมาย) · คอลัมน์เป็น `text` ไม่จำกัดความยาวจึงไม่
 * บังคับ MaxLength — กันแค่ "ต้องเป็นข้อความที่มีเนื้อหา"
 */
export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class UpdateCommentDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}
