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

@Entity("work_sessions")
export class WorkSession {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "issue_id", type: "int" })
  issueId!: number;

  @ManyToOne(() => Issue, (issue) => issue.workSessions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "issue_id" })
  issue?: Issue;

  @Column({ name: "programmer_id", type: "int" })
  programmerId!: number;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "programmer_id" })
  programmer?: User;

  @Column({ name: "started_at", type: "timestamptz" })
  startedAt!: Date;

  @Column({ name: "ended_at", type: "timestamptz" })
  endedAt!: Date;

  @Column({ type: "int" })
  duration!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
