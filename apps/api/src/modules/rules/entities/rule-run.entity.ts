import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { Rule } from "./rule.entity";
import { Issue } from "../../issues/entities/issue.entity";

export type RuleRunStatus = "applied" | "skipped" | "failed";

/**
 * One execution record — written whenever a rule's conditions pass.
 * `ruleId` is nullable (SET NULL) so history survives rule deletion and
 * `ruleName` keeps the display snapshot.
 */
@Entity("rule_runs")
@Index(["ruleId", "createdAt"])
export class RuleRun {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "rule_id", type: "int", nullable: true })
  ruleId!: number | null;

  @ManyToOne(() => Rule, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "rule_id" })
  rule?: Rule | null;

  @Column({ name: "rule_name", type: "varchar", length: 150, nullable: true })
  ruleName!: string | null;

  @Column({ name: "trigger_key", type: "varchar", length: 64 })
  triggerKey!: string;

  @Column({ name: "issue_id", type: "int", nullable: true })
  issueId!: number | null;

  @ManyToOne(() => Issue, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "issue_id" })
  issue?: Issue | null;

  @Column({ type: "varchar", length: 16 })
  status!: RuleRunStatus;

  @Column({ name: "action_key", type: "varchar", length: 64, nullable: true })
  actionKey!: string | null;

  @Column({ type: "text", nullable: true })
  detail!: string | null;

  @Column({ name: "duration_ms", type: "int", default: 0 })
  durationMs!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
