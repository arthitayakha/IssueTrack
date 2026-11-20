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
 * How loud a bell row is — drives the inbox order (high first) and the chip
 * colour. Written by `NotificationsService.notify()`: the card's own priority
 * when the row has an issue, the `FIXED_PRIORITY` map for system rows,
 * `medium` otherwise. The DB enforces the three values.
 */
export type NotificationPriority = "high" | "medium" | "low";

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

  /**
   * สัญญาที่แถวนี้พูดถึง (เฉพาะ `ma_depleted` / `app_expiring` / `app_expired`
   * / confirmation) — ไม่ใส่ FK เพราะแถวแจ้งเตือนเป็นของชั่วคราว ให้ fail-open
   * เสมอถ้าแอป/บริษัทถูกลบไปแล้ว
   */
  @Column({ name: "app_id", type: "int", nullable: true })
  appId!: number | null;

  @Column({ name: "company_id", type: "int", nullable: true })
  companyId!: number | null;

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

  /**
   * `high` / `medium` / `low` — see `NotificationPriority` above. The entity
   * default makes TypeORM omit the column when a caller does not set one, so
   * the migration's `DEFAULT 'medium'` (which the DB really has) is the
   * backstop — never `NULL`.
   */
  @Column({ type: "varchar", length: 10, default: "medium" })
  priority!: NotificationPriority;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
