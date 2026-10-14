import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { BoardColumn } from "../../columns/entities/board-column.entity";
import { Category } from "../../categories/entities/category.entity";
import { Comment } from "../../comments/entities/comment.entity";
import { Attachment } from "../../attachments/entities/attachment.entity";
import { WorkSession } from "../../work-sessions/entities/work-session.entity";
import { IssueStatus } from "../../issue-statuses/entities/issue-status.entity";
import { IssuePriority } from "../../issue-priorities/entities/issue-priority.entity";
import { Label } from "../../labels/entities/label.entity";
import { User } from "../../auth/entities/user.entity";

@Entity("issues")
export class Issue {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "issue_number", type: "varchar", length: 12, nullable: true })
  issueNumber!: string | null;

  @Column({ name: "programmer_id", type: "int", nullable: true })
  programmerId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "programmer_id" })
  programmer?: User;

  @Column({ name: "category_id", type: "int", nullable: true })
  categoryId!: number | null;

  @ManyToOne(() => Category, { onDelete: "CASCADE" })
  @JoinColumn({ name: "category_id" })
  category?: Category;

  @Column({ name: "custom_category", type: "varchar", length: 500, nullable: true })
  customCategory!: string | null;

  @Column({ type: "varchar", length: 300 })
  title!: string;

  @Column({ type: "text" })
  description!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @Column({ name: "assigned_at", type: "timestamptz", nullable: true })
  assignedAt!: Date | null;

  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt!: Date | null;

  @Column({ name: "tracked_duration", default: 0 })
  trackedDuration!: number;

  @Column({ name: "actual_fix_duration", type: "int", nullable: true })
  actualFixDuration!: number | null;

  @Column({ name: "estimate_duration", type: "int", nullable: true })
  estimateDuration!: number | null;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @Column({ name: "customer_id", type: "int", nullable: true })
  customerId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "customer_id" })
  customer?: User;

  @Column({ name: "status_id", type: "int", nullable: true })
  statusId!: number | null;

  @ManyToOne(() => IssueStatus, { nullable: true })
  @JoinColumn({ name: "status_id" })
  status?: IssueStatus;

  @Column({ name: "priority_id", type: "int", nullable: true })
  priorityId!: number | null;

  @ManyToOne(() => IssuePriority, { nullable: true })
  @JoinColumn({ name: "priority_id" })
  priority?: IssuePriority;

  @Column({ name: "label_id", type: "int", nullable: true })
  labelId!: number | null;

  @ManyToOne(() => Label, { nullable: true })
  @JoinColumn({ name: "label_id" })
  label?: Label;

  @ManyToMany(() => Label, { nullable: true })
  @JoinTable({
    name: "issue_labels",
    joinColumn: { name: "issue_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "label_id", referencedColumnName: "id" },
  })
  labels?: Label[];

  @Column({ name: "doing_started_at", type: "timestamptz", nullable: true })
  doingStartedAt!: Date | null;

  @Column({ name: "is_locked", default: false })
  isLocked!: boolean;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @Column({ name: "deleted_by", type: "int", nullable: true })
  deletedBy!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "deleted_by" })
  deletedByUser?: User;

  @Column({ name: "column_id", type: "int", nullable: true })
  columnId!: number | null;

  @ManyToOne(() => BoardColumn, (column) => column.issues, { nullable: true })
  @JoinColumn({ name: "column_id" })
  column?: BoardColumn;

  @OneToMany(() => Comment, (comment) => comment.issue)
  comments?: Comment[];

  @OneToMany(() => Attachment, (attachment) => attachment.issue)
  attachments?: Attachment[];

  @OneToMany(() => WorkSession, (session) => session.issue)
  workSessions?: WorkSession[];
}
