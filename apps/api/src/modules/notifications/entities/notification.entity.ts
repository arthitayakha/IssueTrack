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

/**
 * The bell inbox — every row here is *unread* (reading one deletes it), so the
 * table carries no read/archived state. The actor's name is read off `users`
 * through `actor` instead of being copied into a column.
 */
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

  /** Who caused it (nullable — system/automation rows have no user behind them). */
  @Column({ name: "actor_id", type: "int", nullable: true })
  actorId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "actor_id" })
  actor?: User | null;

  /** Denormalised label shown next to the relative time (e.g. category name). */
  @Column({ type: "varchar", length: 100, nullable: true })
  context!: string | null;

  /** In-app path to open when the notification is clicked (e.g. `/issues`). */
  @Column({ type: "varchar", length: 255, nullable: true })
  link!: string | null;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "varchar", length: 50 })
  type!: string;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
