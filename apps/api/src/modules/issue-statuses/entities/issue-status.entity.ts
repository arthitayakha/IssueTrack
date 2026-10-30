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

  /**
   * Column color ("#rrggbb" or a palette name such as "yellow"). Kept separate
   * from `name` so renaming a status (e.g. to Thai) never loses its color —
   * the UI resolves this value instead of guessing from the English name.
   */
  @Column({ type: "varchar", length: 32, nullable: true })
  color!: string | null;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @Column({ type: "int", default: 0 })
  position!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => Issue, (issue) => issue.status)
  issues?: Issue[];
}
