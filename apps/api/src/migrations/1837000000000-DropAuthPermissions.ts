import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ลบสิทธิ์ `auth.login` / `auth.logout` ออกจากระบบ**
 *
 * ที่มา: ผู้ใช้เห็นการ์ด "การยืนยันตัวตน" ในเมทริกซ์สิทธิ์แล้วบอกว่า
 * *"มันก็ต้อง login เข้ามาอยู่แล้วหนิจะมีทำไม ไม่ต้องมีอันนี้"* · จริง ๆ แล้ว
 * โค้ดทั้ง 2 ตัวไม่มี `@Permissions()` / `RolesGuard` ตัวไหนอ่านเลย —
 * `POST /auth/login` เป็น `@Public()` และ logout แค่ต้องมี token — จึงเป็น
 * เฉพาะ "สิทธิ์ที่โชว์แต่ในหน้าจอ" ที่ไม่มีผลใด ๆ ตอน runtime
 *
 * สิ่งที่ลบ (ใน `permissions` / `role_permissions` / `position_permissions`):
 *   - `auth.login`  = เข้าสู่ระบบ
 *   - `auth.logout` = ออกจากระบบ
 *
 * **ไม่แตะ** activity-log action `"auth.login"` (`activity-log.interceptor.ts`
 * map จาก `POST /auth/login`) — นั่นคือชื่อ action ในฟีดประวัติ คนละอย่างกับ
 * โค้ดสิทธิ์ (และมี test คุมอยู่) · ไม่แตะ i18n key `Users.Nav.auth` /
 * `Notifications.actions.auth_login` ตามกติกา keep-unused-keys
 *
 * ไม่มี FK จาก `role_permissions.permission` / `position_permissions.permission`
 * ไปยัง `permissions.code` (เป็น varchar ธรรมดา) จึงลบ child ก่อน parent ตาม
 * ลำดับด้านล่างได้เลย · `DELETE ... WHERE` รันซ้ำได้ (idempotent)
 *
 * `down()` คืนแถว `permissions` + สิทธิ์เริ่มต้นของ 3 role ตาม
 * `ROLE_PERMISSIONS` เดิม · **ไม่กู้ grant ของแต่ละ position** (ไม่มีข้อมูล
 * บอกว่า position ไหนเคยติ๊กบ้าง — เหมือน migration 1813 ที่ down() ก็ลบทิ้ง
 * เช่นกัน) ฝั่งหน้าเว็บ/constant ไม่ต้องทำอะไรตอน rollback เพราะ matrix มาจาก
 * client-side `PERMISSION_GROUPS` ล้วน ๆ
 *
 * ⚠️ ใช้ literal ใน SQL — `migration:run` ไม่ได้ register `tsconfig-paths`
 */
export class DropAuthPermissions1837000000000 implements MigrationInterface {
  name = "DropAuthPermissions1837000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // child ก่อน (ไม่มี FK จริง แต่ทำตามลำดับให้ชัดเจน) — ทั้ง 2 ตาราง
    // เป็น varchar ธรรมดา ไม่ต้องแตะตารางอื่น
    await queryRunner.query(
      `DELETE FROM position_permissions WHERE permission IN ('auth.login', 'auth.logout')`,
    );
    await queryRunner.query(
      `DELETE FROM role_permissions WHERE permission IN ('auth.login', 'auth.logout')`,
    );
    await queryRunner.query(
      `DELETE FROM permissions WHERE code IN ('auth.login', 'auth.logout')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // คืนโค้ดสิทธิ์ + grant เริ่มต้นของ role (admin/programmer/customer เคยมีทั้งคู่)
    await queryRunner.query(
      `INSERT INTO permissions (code, action, category) VALUES
         ('auth.login', 'auth.login', 'auth'),
         ('auth.logout', 'auth.logout', 'auth')
       ON CONFLICT (code) DO NOTHING`,
    );
    await queryRunner.query(
      `INSERT INTO role_permissions (role_id, permission)
       SELECT r.id, p.code
       FROM roles r
       CROSS JOIN permissions p
       WHERE r.name IN ('admin', 'programmer', 'customer')
         AND p.code IN ('auth.login', 'auth.logout')
       ON CONFLICT (role_id, permission) DO NOTHING`,
    );
  }
}
