import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Issue } from "../../issues/entities/issue.entity";

@Entity("issue_statuses")
export class IssueStatus {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @Column({ type: "int", default: 0 })
  position!: number;

  @Column({ name: "timer_enabled", default: false })
  timerEnabled!: boolean;

  @Column({ name: "time_entry_enabled", default: false })
  timeEntryEnabled!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => Issue, (issue) => issue.status)
  issues?: Issue[];
}
