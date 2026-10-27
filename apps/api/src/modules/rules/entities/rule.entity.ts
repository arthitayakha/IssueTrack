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
import { User } from "../../auth/entities/user.entity";
import { RuleCondition } from "./rule-condition.entity";

/** One automation rule — mirrors the `rules` table (migrations 0028 / 0030). */
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

  @Column({ name: "condition_group", type: "varchar", length: 4, default: "AND" })
  conditionGroup!: string;

  @Column({ name: "is_active", default: false })
  isActive!: boolean;

  @Column({ name: "stop_on_error", default: false })
  stopOnError!: boolean;

  @Column({ name: "created_by", type: "int", nullable: true })
  createdBy!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by" })
  creator?: User | null;

  @OneToMany(() => RuleCondition, (condition) => condition.rule, { cascade: ["insert"] })
  conditions!: RuleCondition[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
