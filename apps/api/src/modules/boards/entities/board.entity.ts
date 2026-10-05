import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { BoardColumn } from "../../columns/entities/board-column.entity";
import { Issue } from "../../issues/entities/issue.entity";

@Entity("boards")
export class Board {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  name!: string;

  @Column({ length: 20, default: "OPEN" })
  status!: string;

  @Column({ name: "created_by", type: "int", nullable: true })
  createdBy!: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @Column({ name: "closed_at", type: "timestamptz", nullable: true })
  closedAt!: Date | null;

  @OneToMany(() => BoardColumn, (column) => column.board)
  columns?: BoardColumn[];

  @OneToMany(() => Issue, (issue) => issue.board)
  issues?: Issue[];
}
