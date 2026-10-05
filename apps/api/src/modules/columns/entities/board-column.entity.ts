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
import { Board } from "../../boards/entities/board.entity";
import { Issue } from "../../issues/entities/issue.entity";

@Entity("board_columns")
export class BoardColumn {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "board_id", type: "int" })
  boardId!: number;

  @ManyToOne(() => Board, (board) => board.columns, { onDelete: "CASCADE" })
  @JoinColumn({ name: "board_id" })
  board?: Board;

  @Column({ length: 100 })
  status!: string;

  @Column({ name: "custom_name", length: 100, nullable: true })
  customName!: string | null;

  @Column({ name: "is_hidden", default: false })
  isHidden!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => Issue, (issue) => issue.column)
  issues?: Issue[];
}
