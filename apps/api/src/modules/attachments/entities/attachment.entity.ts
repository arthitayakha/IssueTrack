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

@Entity("attachments")
export class Attachment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "issue_id", type: "int" })
  issueId!: number;

  @ManyToOne(() => Issue, (issue) => issue.attachments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "issue_id" })
  issue?: Issue;

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
