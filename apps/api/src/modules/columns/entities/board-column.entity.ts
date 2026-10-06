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
import { Board } from "../../boards/entities/board.entity";

@Entity("board_columns")
export class BoardColumn {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "board_id", type: "int", nullable: true })
  boardId!: number | null;

  @ManyToOne(() => Board, (board) => board.columns, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "board_id" })
  board?: Board;

  @Column({ type: "varchar", length: 100 })
  status!: string;

  @Column({ name: "custom_name", type: "varchar", length: 100, nullable: true })
  customName!: string | null;

  @Column({ name: "is_hidden", default: false })
  isHidden!: boolean;

  @Column({ type: "int", default: 0 })
  position!: number;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => Issue, (issue) => issue.column)
  issues?: Issue[];
}
