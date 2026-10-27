import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Rule } from "./rule.entity";

/** One condition row of a rule — mirrors `rule_conditions` (migration 0028). */
@Entity("rule_conditions")
export class RuleCondition {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "rule_id", type: "int" })
  ruleId!: number;

  @ManyToOne(() => Rule, (rule) => rule.conditions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "rule_id" })
  rule!: Rule;

  @Column({ type: "varchar", length: 64 })
  field!: string;

  @Column({ type: "varchar", length: 16 })
  operator!: string;

  @Column({ type: "text", nullable: true })
  value!: string | null;

  @Column({ name: "value_type", type: "varchar", length: 16, default: "text" })
  valueType!: string;

  @Column({ name: "condition_group", type: "varchar", length: 4, default: "AND" })
  conditionGroup!: string;

  @Column({ type: "int", default: 0 })
  position!: number;
}
