import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `app_companies.carried_hours` — **ชั่วโมงที่ "ทบมาจากช่วงแรก" ตอนต่ออายุ**
 *
 * ฟอร์มต่ออายุ (`renew-form-dialog.tsx`) ทบชั่วโมงคงเหลือเข้า `ma_hours` ของ
 * แถวใหม่ **แล้วทิ้งค่าทบทิ้งไป** — ทำให้ย้อนกลับมาดูทีหลังไม่ได้ว่า "MA 80 นี้
 * มาจากที่พิมพ์ 40 + ทบมา 40 หรือยังไง" · คอลัมน์นี้เก็บ *ตัวเลขนั้น* เพื่อ
 * โชว์เป็น chip "ทบมา X ชม." ในแท็บ "งานที่ถูกตัด MA" และเป็นบรรทัดใน
 * ผัง "ส่วนประกอบ → รวมเป็นชั่วโมง MA ทั้งหมด" ของแท็บ "ข้อมูลทั่วไป"
 *
 * **`NULL` = แถวนั้นไม่ได้ทบ** — ซึ่งเป็นความจริงของ 2 กรณี: แถวเก่าที่มีก่อน
 * migration (ย้อนกู้ไม่ได้ ไม่เคยเก็บ) และแถวที่ **ทบไม่ได้ตามกติกา** (รอบ 2
 * เป็นต้นไป / แถว `buy` ไม่เคยทบ) → UI ต้อง *ซ่อน* บรรทัด/chip นี้เมื่อไม่มีค่า
 * ไม่ใช่โชว์ 0 (ตามที่ขอ: "พอครั้งต่อไปที่ทบไม่ได้แล้วก็หายไป")
 *
 * **nullable ไม่ใส่ default โดยเจตนา** — แถวใหม่จาก `renewRecord()` ที่ไม่ส่งค่า
 * (และทุกแถวจาก `buyHours()`) จะได้ `NULL` ตามที่ต้องการ · ต่างจาก `kind`
 * (migration 1820) ที่ต้องมี `DEFAULT` เพราะ entity ตั้ง `default` แล้ว TypeORM
 * จะ**ไม่ใส่คอลัมน์ตอน INSERT**
 *
 * Idempotent — `IF NOT EXISTS` รันซ้ำได้
 */
export class AddAppCompanyCarriedHours1824000000000 implements MigrationInterface {
    name = "AddAppCompanyCarriedHours1824000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS carried_hours INTEGER`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE app_companies DROP COLUMN IF EXISTS carried_hours`);
    }
}
