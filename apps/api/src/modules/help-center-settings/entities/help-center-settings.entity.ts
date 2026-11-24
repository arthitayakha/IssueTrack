import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * ข้อมูลติดต่อกลางของศูนย์ช่วยเหลือ — มีแถวเดียว (id = 1)
 * แยกจากรายชื่อแอดมินรายคน (`notifications/admin-contacts`) ที่ดึงแบบ live
 */
@Entity("help_center_settings")
export class HelpCenterSettings {
  @PrimaryColumn({ type: "int" })
  id!: number;

  @Column({ name: "support_email", type: "varchar", length: 255, nullable: true })
  supportEmail!: string | null;

  @Column({ name: "support_phone", type: "varchar", length: 50, nullable: true })
  supportPhone!: string | null;

  @Column({ name: "working_hours", type: "varchar", length: 255, nullable: true })
  workingHours!: string | null;

  /**
   * โปรแกรมเมอร์ที่แอดมินเลือกให้ลูกค้าติดต่อได้ (ได้หลายคน · array ว่าง = ยัง
   * ไม่เลือก → หน้า /systems ใช้ข้อมูลติดต่อกลางด้านบนเป็น fallback)
   */
  @Column({ name: "contact_user_ids", type: "int", array: true, default: () => "'{}'" })
  contactUserIds!: number[];

  /**
   * map `company_id (string)` → รายชื่อ user id ที่บริษัทนั้นเห็น · key ที่ไม่มี
   * = ใช้ `contactUserIds` ด้านบนเป็น fallback · array ว่าง = เจตตาไม่ให้ใคร sees
   * → ลูกค้าบริษัทนั้นได้ข้อมูลติดต่อกลางแทน
   */
  @Column({ name: "contact_users_by_company", type: "jsonb", default: () => "'{}'" })
  contactUsersByCompany!: Record<string, number[]>;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
