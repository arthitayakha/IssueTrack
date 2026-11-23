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

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
