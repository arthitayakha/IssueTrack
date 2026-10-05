import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("issue_statuses")
export class IssueStatus {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 100 })
  name!: string;

  @Column({ length: 50 })
  code!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ length: 20, nullable: true })
  color!: string | null;

  @Column({ name: "sort_order", default: 0 })
  sortOrder!: number;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @Column({ name: "is_timer_running", default: false })
  isTimerRunning!: boolean;

  @Column({ name: "is_end_status", default: false })
  isEndStatus!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
