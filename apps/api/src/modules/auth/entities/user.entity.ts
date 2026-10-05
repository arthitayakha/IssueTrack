import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Position } from "../../positions/position.entity";
import { Role } from "../../roles/entities/role.entity";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 150 })
  email!: string;

  @Column({ name: "password", length: 255 })
  passwordHash!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ name: "role_id", type: "int", nullable: true })
  roleId!: number | null;

  @ManyToOne(() => Role, { nullable: true })
  @JoinColumn({ name: "role_id" })
  role?: Role;

  @Column({ name: "position_id", type: "int", nullable: true })
  positionId!: number | null;

  @ManyToOne(() => Position, { nullable: true })
  @JoinColumn({ name: "position_id" })
  position?: Position;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
