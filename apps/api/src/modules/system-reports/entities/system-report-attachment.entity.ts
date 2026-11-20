import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { SystemReport } from "./system-report.entity";

/** ภาพหน้าจอ/ไฟล์ที่แนบมากับรายงานบั๊ก */
@Entity("system_report_attachments")
export class SystemReportAttachment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "report_id", type: "int" })
  reportId!: number;

  @ManyToOne(() => SystemReport, (report) => report.attachments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "report_id" })
  report?: SystemReport;

  @Column({ name: "file_name", type: "varchar", length: 255 })
  fileName!: string;

  @Column({ name: "file_path", type: "varchar", length: 500 })
  filePath!: string;

  @Column({ name: "file_type", type: "varchar", length: 10, nullable: true })
  fileType!: string | null;

  @Column({ name: "file_size", type: "int", nullable: true })
  fileSize!: number | null;

  @Column({ name: "uploaded_by", type: "int", nullable: true })
  uploadedBy!: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
