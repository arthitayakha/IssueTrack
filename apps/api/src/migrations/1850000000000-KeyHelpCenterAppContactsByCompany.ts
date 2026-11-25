import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * แยกผู้ติดต่อรายแอปตาม **คู่แอป × บริษัท** — เดิม key เป็น `app_id` อย่างเดียว
 * ทำให้แอปเดียวที่ผูกหลายบริษัทแชร์รายชื่อกัน (แก้ในบริษัทหนึ่งส่งผลอีกบริษัท)
 * เปลี่ยนเป็น `app_id:company_id` · key เก่า (ไม่มี `:`) จะถูกย้ายไปให้บริษัท
 * แรกที่ผูกแอปนั้น (เลี่ยงก็อปปี้คนไปทุกบริษัท) ถ้าไม่มีคู่ผูกเลย = ตัดทิ้ง
 *
 * Idempotent ทั้ง up/down
 */
export class KeyHelpCenterAppContactsByCompany1850000000000 implements MigrationInterface {
  name = "KeyHelpCenterAppContactsByCompany1850000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: { id: number; contact_users_by_app: Record<string, number[]> }[] =
      await queryRunner.query(`SELECT id, contact_users_by_app FROM help_center_settings`);

    for (const row of rows) {
      const current = row.contact_users_by_app ?? {};
      let changed = false;
      const next: Record<string, number[]> = {};

      for (const [key, ids] of Object.entries(current)) {
        if (!/^\d+$/.test(key)) {
          next[key] = ids;
          continue;
        }
        changed = true;
        const links: { company_id: number }[] = await queryRunner.query(
          `SELECT company_id FROM app_companies WHERE app_id = $1 ORDER BY id ASC LIMIT 1`,
          [Number(key)],
        );
        if (links.length > 0) next[`${key}:${links[0].company_id}`] = ids;
      }

      if (changed) {
        await queryRunner.query(
          `UPDATE help_center_settings SET contact_users_by_app = $1::jsonb WHERE id = $2`,
          [JSON.stringify(next), row.id],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: { id: number; contact_users_by_app: Record<string, number[]> }[] =
      await queryRunner.query(`SELECT id, contact_users_by_app FROM help_center_settings`);

    for (const row of rows) {
      const current = row.contact_users_by_app ?? {};
      let changed = false;
      const next: Record<string, number[]> = {};

      for (const [key, ids] of Object.entries(current)) {
        if (!/^\d+:\d+$/.test(key)) {
          next[key] = ids;
          continue;
        }
        changed = true;
        const appKey = key.split(":")[0];
        if (!Object.prototype.hasOwnProperty.call(next, appKey)) next[appKey] = ids;
      }

      if (changed) {
        await queryRunner.query(
          `UPDATE help_center_settings SET contact_users_by_app = $1::jsonb WHERE id = $2`,
          [JSON.stringify(next), row.id],
        );
      }
    }
  }
}
