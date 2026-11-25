import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import type { NotificationPriority } from "./notification.entity";

/**
 * หนึ่งสายของการเตือนซ้ำ — สร้างตอนแถวแจ้งเตือนต้นทางถูกบันทึก (เฉพาะ
 * ประเภทที่ต้องบริหาร) แล้วเก็บ snapshot ของข้อความไว้ที่นี่ ทุกครั้งที่ cron
 * 09:00 เห็นว่ายัง "ค้าง" อยู่ก็เรียก `notify()` ด้วย snapshot นี้ (แถวใหม่ใน
 * กล่องเข้า + toast ตัวเดิม) แล้วเพิ่ม `sent_count` / เลื่อน `nextNotifyAt`
 *
 * `resolvedAt` ถูกตั้งเมื่อเช็คแล้วว่าสถานะในระบบเปลี่ยน (เติม MA / ต่ออายุ /
 * มอบหมายงาน / ย้ายการ์ดออกจากสถานะค้าง) หรือครบจำนวนครั้งตามระดับ —
 * การอ่านแถวแจ้งเตือน**ไม่ได้**หยุดสาย (ตามคำตอบของผู้ใช้)
 *
 * ไม่มี FK ไป `notifications` เพราะแถวต้นทางถูกลบได้อิสระผ่าน DELETE /notifications/:id
 * — snapshot ที่นี่ต้องอยู่ต่อให้ครบชุดความถี่
 */
@Entity("notification_repeats")
export class NotificationRepeat {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id", type: "int" })
  userId!: number;

  @Column({ name: "source_notification_id", type: "int" })
  sourceNotificationId!: number;

  @Column({ type: "varchar", length: 50 })
  type!: string;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  context!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  link!: string | null;

  @Column({ name: "issue_id", type: "int", nullable: true })
  issueId!: number | null;

  @Column({ name: "app_id", type: "int", nullable: true })
  appId!: number | null;

  @Column({ name: "company_id", type: "int", nullable: true })
  companyId!: number | null;

  @Column({ name: "actor_id", type: "int", nullable: true })
  actorId!: number | null;

  @Column({ type: "varchar", length: 10 })
  priority!: NotificationPriority;

  /** จำนวนแถวที่**ซ้ำ**แล้ว (ไม่นับแถวต้นทาง) */
  @Column({ name: "sent_count", type: "int", default: 0 })
  sentCount!: number;

  @Column({ name: "next_notify_at", type: "timestamptz" })
  nextNotifyAt!: Date;

  @Column({ name: "resolved_at", type: "timestamptz", nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
