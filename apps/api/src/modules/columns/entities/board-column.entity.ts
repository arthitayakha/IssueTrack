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
import { Issue } from "../../issues/entities/issue.entity";
import { IssueStatus } from "../../issue-statuses/entities/issue-status.entity";

@Entity("board_columns")
export class BoardColumn {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "status_id", type: "int" })
  statusId!: number;

  @ManyToOne(() => IssueStatus, { onDelete: "CASCADE" })
  @JoinColumn({ name: "status_id" })
  status?: IssueStatus;

  @Column({ name: "custom_name", type: "varchar", length: 100, nullable: true })
  customName!: string | null;

  @Column({ name: "is_hidden", default: false })
  isHidden!: boolean;

  @Column({ name: "is_locked", default: false })
  isLocked!: boolean;

  @Column({ type: "int", default: 0 })
  position!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => Issue, (issue) => issue.column)
  issues?: Issue[];
}
