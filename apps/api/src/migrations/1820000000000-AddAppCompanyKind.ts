import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `app_companies.kind` — **แถบนี้มาจากอะไร**: `renew` (ต่ออายุ/เพิ่มรายการปกติ)
 * หรือ `buy` (ซื้อชั่วโมง MA เพิ่ม)
 *
 * เหตุผลที่ต้องมี: "ซื้อชั่วโมง" append แถวใหม่ให้ **คู่เดิมโดยคงวันที่สัญญา
 * เท่าเดิม** ต่างจากต่ออายุที่เปลี่ยนวันด้วย — ถ้าไม่มีคอลัมน์นี้ แท็บ
 * "ประวัติการต่ออายุ" ในป๊อปอัพ `/systems` จะเห็น 2 แถววันที่เท่ากันแต่
 * `ma_hours` ต่างกัน แล้วดูไม่ออกว่าแถวไหนคือการซื้อ
 *
 * **ค่าของแถวเดิม**: `renew` ทุกแถว — ทุกแถวที่มีอยู่ก่อนหน้าสร้างจาก
 * ต่ออายุ/เพิ่มรายการล้วน ๆ ย้อนกู้ไม่ได้ว่าแต่ละแถวกดเมื่อไหร่ (ไม่เคยเก็บ)
 *
 * **`DEFAULT 'renew'` + `NOT NULL` สำคัญ**: entity ตั้ง `default: "renew"` ซึ่ง
 * ทำให้ TypeORM **ไม่ใส่คอลัมน์นี้ตอน INSERT** เมื่อผู้เรียกไม่ได้ตั้งค่า —
 * ถ้า DB ไม่มี default แถวที่สร้างผ่าน `addRecord()` / `renewRecord()` จะได้
 * `NULL` (บั๊กที่ smoke test จับได้) · `NOT NULL` ตรงกับ type ฝั่ง entity ที่
 * ไม่ยอม `undefined`
 *
 * Idempotent — `IF NOT EXISTS` / `WHERE kind IS NULL` / `SET DEFAULT` / `SET NOT NULL`
 * รันซ้ำได้ทั้งหมด
 */
export class AddAppCompanyKind1820000000000 implements MigrationInterface {
    name = "AddAppCompanyKind1820000000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE app_companies ADD COLUMN IF NOT EXISTS kind VARCHAR(8)`,
        );
        await queryRunner.query(
            `UPDATE app_companies SET kind = 'renew' WHERE kind IS NULL`,
        );
        await queryRunner.query(
            `ALTER TABLE app_companies ALTER COLUMN kind SET DEFAULT 'renew'`,
        );
        await queryRunner.query(
            `ALTER TABLE app_companies ALTER COLUMN kind SET NOT NULL`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE app_companies DROP COLUMN IF EXISTS kind`);
    }
}
