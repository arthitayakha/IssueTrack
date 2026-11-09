import { MigrationInterface, QueryRunner } from "typeorm";
import { existsSync, readFileSync } from "fs";
import { basename, extname, join } from "path";
import { UPLOADS_DIR } from "../lib/uploads-path";

/** MIME per extension, for the files the old disk-based avatar flow wrote. */
const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * ย้ายรูปโปรไฟล์จากไฟล์ใน `uploads/` เข้าไปเก็บในแถว `users` (bytea)
 *
 *   users.avatar (varchar, ชื่อไฟล์) → users.avatar_data (bytea) + avatar_mime
 *
 * เหตุผล: ไฟล์อยู่ที่ `process.cwd()/uploads` — เริ่ม API จากโฟลเดอร์อื่น =
 * คนละโฟลเดอร์กัน เขียนรูปวันนี้ อ่านวันพรุ่งนี้ได้ 404 (รูป "หาย" ทั้งที่
 * ชื่อไฟล์ยังอยู่ใน DB)  เก็บเป็น bytes ในแถวจึงไม่มีวันหลุดอีกเลย
 *
 * backfill: ไฟล์ที่ยังอยู่ → ยัดเข้าคอลัมน์; ไฟล์ที่หายไปแล้ว → โยนชื่อทิ้ง
 * (มันคือ dangling reference ที่ทำให้รูปดูหายอยู่ดี) แล้วค่อย drop คอลัมน์เก่า
 */
export class MoveAvatarIntoColumn1815000000000 implements MigrationInterface {
    name = "MoveAvatarIntoColumn1815000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data bytea NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_mime varchar(50) NULL`,
        );

        const rows: { id: number; avatar: string }[] = await queryRunner.query(
            `SELECT id, avatar FROM users WHERE avatar IS NOT NULL`,
        );
        for (const row of rows) {
            // basename() — a stored value must never be able to escape the folder
            const file = join(UPLOADS_DIR, basename(row.avatar));
            if (existsSync(file)) {
                const mime = MIME_BY_EXT[extname(file).toLowerCase()] ?? "image/jpeg";
                await queryRunner.query(
                    `UPDATE users SET avatar_data = $1, avatar_mime = $2 WHERE id = $3`,
                    [readFileSync(file), mime, row.id],
                );
            } else {
                await queryRunner.query(`UPDATE users SET avatar = NULL WHERE id = $1`, [
                    row.id,
                ]);
            }
        }

        await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS avatar`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar varchar(255) NULL`,
        );
        // `up()` dropped the column with the filenames inside it — only the
        // names are lost; re-uploading a picture is how a row gets filled again
        await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS avatar_mime`);
        await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS avatar_data`);
    }
}
