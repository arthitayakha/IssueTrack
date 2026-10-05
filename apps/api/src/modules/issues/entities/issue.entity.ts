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
import { Board } from "../../boards/entities/board.entity";
import { BoardColumn } from "../../columns/entities/board-column.entity";
import { Category } from "../../categories/entities/category.entity";
import { Comment } from "../../comments/entities/comment.entity";
import { Attachment } from "../../attachments/entities/attachment.entity";
import { WorkSession } from "../../work-sessions/entities/work-session.entity";

@Entity("issues")
export class Issue {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "programmer_id", type: "int", nullable: true })
  programmerId!: number | null;

  @ManyToOne("User", { nullable: true })
  @JoinColumn({ name: "programmer_id" })
  programmer?: any;

  @Column({ name: "category_id", type: "int" })
  categoryId!: number;

  @ManyToOne(() => Category, { onDelete: "CASCADE" })
  @JoinColumn({ name: "category_id" })
  category?: Category;

  @Column({ length: 300 })
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

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @Column({ name: "customer_id", type: "int" })
  customerId!: number;

  @Column({ length: 30, default: "BACKLOG" })
  status!: string;

  @Column({ name: "board_id", type: "int", nullable: true })
  boardId!: number | null;

  @ManyToOne(() => Board, (board) => board.issues, { nullable: true })
  @JoinColumn({ name: "board_id" })
  board?: Board;

  @Column({ length: 30, nullable: true })
  priority!: string | null;

  @Column({ name: "doing_started_at", type: "timestamptz", nullable: true })
  doingStartedAt!: Date | null;

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
