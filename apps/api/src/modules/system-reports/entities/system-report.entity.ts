import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../auth/entities/user.entity";
import { Attachment } from "../../attachments/entities/attachment.entity";

/** รายงานบั๊กของระบบเองจากศูนย์ช่วยเหลือ (คนละอย่างกับงานบนบอร์ด) */
@Entity("system_reports")
export class SystemReport {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "reporter_id", type: "int" })
  reporterId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "reporter_id" })
  reporter?: User;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text" })
  description!: string;

  @Column({ name: "page_url", type: "varchar", length: 500, nullable: true })
  pageUrl!: string | null;

  /** ประเภทปัญหา (bug / improvement / other) — migration 1841 */
  @Column({ name: "problem_type", type: "varchar", length: 30, default: "other" })
  problemType!: string;

  @Column({ type: "varchar", length: 20, default: "open" })
  status!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  /** ไฟล์แนบอยู่ในตาราง `attachments` ร่วมกับของงาน (แยกด้วย `system_report_id`) */
  @OneToMany(() => Attachment, (a) => a.systemReport, { cascade: true })
  attachments?: Attachment[];
}
