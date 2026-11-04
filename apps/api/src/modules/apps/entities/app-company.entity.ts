import { Column, Entity, PrimaryColumn } from "typeorm";

/**
 * สถานะอายุที่ *เก็บไว้* ใน DB (`none` | `normal` | `expiring_soon` (≤30 วัน) |
 * `critical` (≤7 วัน) | `expired`) — คำนวณใหม่โดย `AppExpiryService` ทั้งตอนอ่าน
 * ตอนบันทึก และจาก cron รายวัน เก็บค่าไว้เพื่อให้โชว์เป็น chip ได้ทันที
 * และเพื่อให้ "แจ้งเตือนเฉพาะตอนสถานะเปลี่ยน" ทำได้ (เทียบค่าเดิมกับค่าใหม่)
 */
export type AppExpiryStatus =
  | "none"
  | "normal"
  | "expiring_soon"
  | "critical"
  | "expired";

/**
 * Which announcement has already gone out — the *notification* counterpart of
 * `expiryStatus`. Ordered `none < d30 < d7 < expired`, so `AppExpiryService`
 * can tell "we have not said anything yet" from "we already said the 30-day
 * one" and ring each threshold exactly once.
 */
export type AppExpiryStage = "none" | "d30" | "d7" | "expired";

/**
 * **1 แถว = คู่ (แอป × บริษัท) 1 คู่** — ตารางเชื่อมที่ migration 1808 สร้าง
 * และ migration 1810 ยก "วันที่อายุ" ทั้ง 4 คอลัมน์ลงมาอยู่ที่นี่
 *
 * เหตุผลที่วันที่ต้องอยู่ตรงนี้: วันที่ *เป็นของคู่* ไม่ใช่ของแอป — 1 แอป
 * ผูกได้หลายบริษัท และแต่ละเจ้าต่ออายุคนละช่วงเวลา ดังนั้น
 * `started_at` / `expires_at` / `expiry_status` / `expiry_notified` ของ
 * "มามี่ฟู้ด" กับ "ครัวบ้านสวน" จึงเป็นคนละชุดค่ากันโดยสิ้นเชิง
 *
 * **ไม่มี relation (`@ManyToOne`) โดยเจตนา** — PK เป็นคู่ (`app_id`,
 * `company_id`) และคอลัมน์ FK ทั้งสองตัวก็เป็นส่วนหนึ่งของ PK อยู่แล้ว
 * การ map relation กลับจะทำให้ TypeORM ต้อง register คอลัมน์เดียวกันสองรอบ
 * ฝั่ง service จึง join เองด้วย `In([...])` แบบเดียวกับที่ `CompaniesService`
 * นับแอปผ่าน repository ตรง ๆ — cascade ทั้งสองทางยังเป็นงานของ FK ใน DB
 * (`ON DELETE CASCADE` ใน migration 1808) เหมือนเดิม
 */
@Entity("app_companies")
export class AppCompany {
  @PrimaryColumn({ name: "app_id", type: "integer" })
  appId!: number;

  @PrimaryColumn({ name: "company_id", type: "integer" })
  companyId!: number;

  /**
   * วันที่เริ่มใช้งานของคู่นี้ — `null` = ยังไม่กรอก. Round-trip ผ่าน
   * `toIsoDate()` (local getters) เหมือน `expiresAt` เพราะ `pg` ส่ง DATE
   * กลับเป็น JS `Date` เที่ยงคืนเวลาท้องถิ่น
   */
  @Column({ name: "started_at", type: "date", nullable: true })
  startedAt!: Date | string | null;

  /**
   * วันหมดอายุของคู่นี้ — `null` = ไม่กำหนด → สถานะค้างที่ `none` และไม่มี
   * ทางถูกแจ้งเตือนให้เลย
   */
  @Column({ name: "expires_at", type: "date", nullable: true })
  expiresAt!: Date | string | null;

  /**
   * **ชั่วโมง MA** ที่ตกลงให้คู่นี้ (เช่น "POS ให้ลูกค้า 60 ชม.") — `null` =
   * ยังไม่กำหนด/ยังไม่ได้กรอก (ตั้งใจแยกจาก `0` ซึ่งหมายถึงตกลงให้ 0 ชม.)
   *
   * รอบนี้เก็บไว้เป็น **เพดานที่กรอกได้ก่อน** — การหักเวลาจริง
   * (`issues.actual_fix_duration` ของงานที่ปิดแล้ว) ยังไม่ทำ รอตัดสินใจรอบถัดไป
   */
  @Column({ name: "ma_hours", type: "int", nullable: true })
  maHours!: number | null;

  /** Stored status — refreshed by `AppExpiryService` (read/save/daily cron). */
  @Column({ name: "expiry_status", type: "varchar", length: 16, default: "none" })
  expiryStatus!: AppExpiryStatus;

  /**
   * Last threshold announced (`none → d30 → d7 → expired`) **ของคู่นี้**.
   * เคลื่อนหน้าอย่างเดียวขณะที่วันที่นิ่ง; วันถูกเลื่อนออก/ล้าง →
   * `reconcile()` จะรีเซ็ตเป็น `none` เพื่อให้แจ้งใหม่ได้อีกครั้ง
   */
  @Column({ name: "expiry_notified", type: "varchar", length: 16, default: "none" })
  expiryNotified!: AppExpiryStage;
}
