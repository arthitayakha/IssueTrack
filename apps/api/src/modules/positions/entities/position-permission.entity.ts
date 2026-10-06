import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Position } from "../position.entity";

@Entity("position_permissions")
@Unique(["positionId", "permission"])
export class PositionPermission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "position_id", type: "int" })
  positionId!: number;

  @ManyToOne(() => Position, { onDelete: "CASCADE" })
  @JoinColumn({ name: "position_id" })
  position?: Position;

  @Column()
  permission!: string;
}
