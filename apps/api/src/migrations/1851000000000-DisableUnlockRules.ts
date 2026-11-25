import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * **ถอด "ปลดล็อกการ์ด" ออกจากระบบ** — ปิดการทำงานของกฎ `issue.unlock` ทั้งหมด
 *
 * **ที่มา**: พี่สรุปว่าถ้าโปรแกรมเมอร์กรอกชั่วโมง MA ผิดแล้วลากเข้า "เสร็จสิ้น"
 * แล้วลากกลับมาแก้ จำนวนชั่วโมงที่ถูกหักจะเหลือ/เกินได้ จึงล็อกคอลัมน์ปลายทาง
 * ด้วยกฎ `issue.lock` แบบ `to_status` แล้ว **ไม่มีทางปลดล็อก** — การ pause
 * กฎล็อกในแท็บระบบอัตโนมัติเป็นทางเดียวที่ปลดการ์ดได้
 *
 * ไม่มี migration ไหน seed กฎ `issue.unlock` ไว้ (มีแค่ `issue.move_step_only`
 * กับ `issue.require_task_type`) — เป็นการกันfallback สำหรับ DB ที่มีคนสร้างกฎ
 * นี้ขึ้นมาเองผ่าน UI: ถ้ากฎยัง active อยู่ `isUnlockRuleActive()` จะคืน true
 * → ปุ่มปลดล็อกในบอร์ดยังโผล่ แม้ action ถูก park ไว้ใน registry แล้วก็ตาม
 *
 * **Idempotent** — `UPDATE` ซ้ำได้ ไม่มีแถว match ก็ไม่แตะอะไร
 *
 * `down()` จงใจเป็น no-op: ไม่มีทางรู้ว่ากฎไหน active อยู่ก่อนหน้า (และโค้ดไม่ได้
 * เสนอ action นี้ใน wizard อีกแล้ว) การคืนค่าแบบเดาทำให้กฎที่ควรปิดกลับมาเปิด
 *
 * ⚠️ ใช้ literal ใน SQL แบบเดียวกับ migration อื่น — `migration:run` รันผ่าน
 * `typeorm-ts-node-commonjs` ซึ่งไม่ได้ register `tsconfig-paths`
 */
export class DisableUnlockRules1851000000000 implements MigrationInterface {
  name = "DisableUnlockRules1851000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE rules SET is_active = false WHERE action_key = 'issue.unlock'`,
    );
  }

  public async down(): Promise<void> {
    // no-op — ไม่เดาสถานะเก่า (ดู docblock)
  }
}
