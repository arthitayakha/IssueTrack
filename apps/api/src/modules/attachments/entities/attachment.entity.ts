import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Issue } from "../../issues/entities/issue.entity";
import { User } from "../../auth/entities/user.entity";
import { SystemReport } from "../../system-reports/entities/system-report.entity";

@Entity("attachments")
export class Attachment {
  @PrimaryGeneratedColumn()
  id!: number;

  /** เจ้าของคืองานบนบอร์ด **หรือ** รายงานบั๊ก (ดู CHECK `attachments_owner_check`) */
  @Column({ name: "issue_id", type: "int", nullable: true })
  issueId!: number | null;

  @ManyToOne(() => Issue, (issue) => issue.attachments, {
    onDelete: "CASCADE",
    nullable: true,
  })
  @JoinColumn({ name: "issue_id" })
  issue?: Issue | null;

  @Column({ name: "system_report_id", type: "int", nullable: true })
  systemReportId!: number | null;

  @ManyToOne(() => SystemReport, (report) => report.attachments, {
    onDelete: "CASCADE",
    nullable: true,
  })
  @JoinColumn({ name: "system_report_id" })
  systemReport?: SystemReport | null;

  @Column({ name: "uploaded_by", type: "int", nullable: true })
  uploadedBy!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "uploaded_by" })
  uploadedByUser?: User;

  @Column({ name: "file_name", type: "varchar", length: 255 })
  fileName!: string;

  @Column({ name: "file_path", type: "varchar", length: 500 })
  filePath!: string;

  @Column({ name: "file_type", type: "varchar", length: 10, nullable: true })
  fileType!: string | null;

  @Column({ name: "file_size", type: "int", nullable: true })
  fileSize!: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
