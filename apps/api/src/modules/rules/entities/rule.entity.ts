import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "../../auth/entities/user.entity";

/**
 * One "if" clause of a rule — stored inside the rule's JSONB `conditions`
 * array (migration 0036 merged `rule_conditions` into `rules`). All clauses
 * are AND-combined by the engine; `position` is the display/eval order.
 */
export interface RuleConditionEntry {
  field: string;
  operator: string;
  value: string | null;
  position: number;
}

/** One automation rule — mirrors the `rules` table (migrations 0028 / 0030 / 0036). */
@Entity("rules")
export class Rule {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 150 })
  name!: string;

  @Column({ name: "trigger_key", type: "varchar", length: 64 })
  triggerKey!: string;

  @Column({ name: "template_key", type: "varchar", length: 64, nullable: true })
  templateKey!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  category!: string | null;

  @Column({ name: "action_key", type: "varchar", length: 64 })
  actionKey!: string;

  @Column({ name: "action_config", type: "jsonb", default: "{}" })
  actionConfig!: Record<string, unknown>;

  /** The rule's "if" clauses, e.g. `[{ field: "category", operator: "=", value: "1", position: 0 }]`. */
  @Column({ type: "jsonb", default: "[]" })
  conditions!: RuleConditionEntry[];

  @Column({ name: "is_active", default: false })
  isActive!: boolean;

  @Column({ name: "stop_on_error", default: false })
  stopOnError!: boolean;

  @Column({ name: "created_by", type: "int", nullable: true })
  createdBy!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by" })
  creator?: User | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
