import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";

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
 * **1 แถว = 1 ช่วงข้อมูลของคู่ (แอป × บริษัท)** — ตารางเชื่อมที่ migration 1808
 * สร้าง, migration 1810 ยก "วันที่อายุ" ทั้ง 4 คอลัมน์ลงมาที่นี่ และ
 * migration 1812 เปลี่ยน composite PK → surrogate key `id`
 *
 * เหตุผลที่วันที่ต้องอยู่ตรงนี้: วันที่ *เป็นของคู่* ไม่ใช่ของแอป — 1 แอป
 * ผูกได้หลายบริษัท และแต่ละเจ้าต่ออายุคนละช่วงเวลา ดังนั้น
 * `started_at` / `expires_at` / `expiry_status` / `expiry_notified` ของ
 * "มามี่ฟู้ด" กับ "ครัวบ้านสวน" จึงเป็นคนละชุดค่ากันโดยสิ้นเชิง
 *
 * **คู่เดิมมีได้หลายแถว** (1812): แถว (POS × มามี่ฟู้ด) ช่วงปี 2568 กับช่วง
 * ปี 2569 เป็นคนละแถวกัน ห้ามเขียนทับกัน — หน้าที่แทนที่/ลบเป็นของ
 * `PATCH` / `DELETE /apps/:id/companies/:recordId` ไม่ใช่การส่ง list ทั้งชุด
 *
 * **ไม่มี relation (`@ManyToOne`) โดยเจตนา** — ฝั่ง service โหลดคู่เองด้วย
 * repository ตรง ๆ แล้ว join ชื่อบริษัทเอง (master data มีไม่กี่สิบแถว)
 * cascade ทั้งสองทางเป็นงานของ FK ใน DB (`ON DELETE CASCADE` ใน 1808) เหมือนเดิม
 */
@Entity("app_companies")
export class AppCompany {
  /** surrogate PK (migration 1812) — ใช้เป็น `recordId` ของ API ฝั่งเว็บ */
  @PrimaryGeneratedColumn({ name: "id", type: "int" })
  id!: number;

  @Column({ name: "app_id", type: "integer" })
  appId!: number;

  @Column({ name: "company_id", type: "integer" })
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
   * ฝั่งเว็บหักจาก `issues.actual_fix_duration` แล้ว (ดู `MA_DEDUCTION_PAUSED`
   * ใน `reports-api.ts`) — นับเฉพาะงาน type `ma` (`bug`, `requirement` กับ NULL
   * ไม่หัก) ระดับ**แอป** (ทุกแถวของแอปเดียวกันหักค่าเดียวกัน)
   */
  @Column({ name: "ma_hours", type: "int", nullable: true })
  maHours!: number | null;

  /**
   * **ชั่วโมงที่ "ทบมาจากช่วงแรก" ตอนต่ออายุ** (migration 1824) — ฟอร์มต่ออายุ
   * บวกชั่วโมงคงเหลือเข้า `ma_hours` แล้วทิ้งค่าทบทิ้งไป คอลัมน์นี้เก็บตัวเลขนั้น
   * ให้ย้อนดูได้ว่าแถวนี้ทบมาเท่าไร
   *
   * `NULL` = **ไม่ได้ทบ** — ทั้งแถวเก่าที่มีก่อน migration (ไม่เคยเก็บ) และแถวที่
   * ทบไม่ได้ตามกติกา (รอบ 2 เป็นต้นไป / แถว `buy`) → UI ซ่อน chip/บรรทัดนี้เมื่อ
   * ไม่มีค่า ไม่โชว์ 0 · แถวใหม่ที่ไม่ส่งค่า (และทุกแถวของ `buyHours()`) ได้ `NULL`
   */
  @Column({ name: "carried_hours", type: "int", nullable: true })
  carriedHours?: number | null;

  /**
   * **แถบนี้มาจากอะไร** (migration 1820) — `renew` = ต่ออายุ/เพิ่มรายการปกติ,
   * `buy` = ซื้อชั่วโมง MA เพิ่ม (คงวันที่สัญญาเดิม `maHours` มากขึ้น)
   *
   * ใช้แยกแถบที่ซื้อออกจากแถบที่ต่ออายุในแท็บ "ประวัติการต่ออายุ" —
   * สองแถวมีวันที่เท่ากันแต่ `maHours` ต่างกัน จึงแยกจากตัวเลขอย่างเดียว
   * ไม่ได้ว่าแถวไหนคือการซื้อ · แถวเก่าที่มีก่อน migration = `renew` ทุกแถว
   */
  @Column({ name: "kind", type: "varchar", length: 8, default: "renew" })
  kind!: "renew" | "buy";

  /**
   * **latch flag "แจ้ง MA หมดแล้ว" รอบนี้** (migration 1821) — `null` = ยังไม่เคยแจ้ง,
   * ค่าอื่น = เวลาที่ `MaUsageService` แจ้งลูกค้า + แอดมินไปแล้ว (ครั้งเดียวต่อรอบ)
   *
   * ล้างเองเมื่อ ใช้ไป ≤ MA อีกครั้ง (งานย้ายเป็นบั๊ก/แก้ MA เพิ่ม) → รอบการหมด
   * ถัดไปแจ้งใหม่ได้ · แถวใหม่จากต่ออายุ/ซื้อชั่วโมงได้ `NULL` โดยปริยาย
   * (คนละแถวกับ latch เดิม จึงแจ้งซ้ำได้เมื่อหมดอีก)
   */
  @Column({ name: "ma_notified_at", type: "timestamp", nullable: true })
  maNotifiedAt!: Date | null;

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

  /**
   * **วันที่บันทึกช่วงเวลานั้น** — คอลัมน์ "วันที่" ของตาราง **ประวัติการต่ออายุ**
   * (migration 1819) ต่างจาก `startedAt` ที่เป็น *วันที่ของสัญญา*: แถวช่วง 2569
   * ที่ต่ออายุเมื่อวานต้องโชว์วันที่เมื่อวาน ไม่ใช่วันที่เริ่มสัญญา
   *
   * แถวเดิมที่มีอยู่ก่อน migration ได้ค่า "วันที่ migrate" (ย้อนกู้ไม่ได้ —
   * ไม่เคยเก็บไว้) · แถวใหม่หลังจากนี้ได้ค่าจริงเสมอ
   */
  @CreateDateColumn({ name: "created_at", type: "timestamp" })
  createdAt!: Date;
}
