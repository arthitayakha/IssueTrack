import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * config รายชื่อผู้ติดต่อ — มีแถวเดียว (id = 1)
 * เก็บแค่ map บริษัท → โปรแกรมเมอร์ (ไม่มีรายชื่อหลัก/ข้อมูลกลางแล้ว)
 * แยกจากรายชื่อแอดมินรายคน (`notifications/admin-contacts`) ที่ดึงแบบ live
 */
@Entity("help_center_settings")
export class HelpCenterSettings {
  @PrimaryColumn({ type: "int" })
  id!: number;

  /**
   * map `company_id (string)` → รายชื่อ user id ที่บริษัทนั้นเห็น
   * ไม่มี key = บริษัทนั้นไม่มีผู้ติดต่อ (ป๊อปอัพโชว์ข้อความว่าง)
   */
  @Column({ name: "contact_users_by_company", type: "jsonb", default: () => "'{}'" })
  contactUsersByCompany!: Record<string, number[]>;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
