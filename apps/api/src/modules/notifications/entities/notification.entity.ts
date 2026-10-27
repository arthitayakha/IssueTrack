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

@Entity("notifications")
export class Notification {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "user_id", type: "int" })
  userId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user?: User;

  @Column({ name: "issue_id", type: "int", nullable: true })
  issueId!: number | null;

  @ManyToOne(() => Issue, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "issue_id" })
  issue?: Issue | null;

  @Column({ name: "actor_id", type: "int", nullable: true })
  actorId!: number | null;

  @Column({ name: "actor_name", type: "varchar", length: 100, nullable: true })
  actorName!: string | null;

  /** Denormalised label shown next to the relative time (e.g. category name). */
  @Column({ type: "varchar", length: 100, nullable: true })
  context!: string | null;

  /** In-app path to open when the notification is clicked (e.g. `/issues`). */
  @Column({ type: "varchar", length: 255, nullable: true })
  link!: string | null;

  @Column({ type: "varchar", length: 200 })
  title!: string;

  @Column({ type: "text" })
  message!: string;

  @Column({ type: "varchar", length: 50 })
  type!: string;

  @Column({ name: "is_read", default: false })
  isRead!: boolean;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @Column({ name: "is_archived", default: false })
  isArchived!: boolean;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
