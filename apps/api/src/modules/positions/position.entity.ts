import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../auth/entities/user.entity";
import { Role } from "../roles/entities/role.entity";
import { PositionPermission } from "./entities/position-permission.entity";

@Entity("positions")
export class Position {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, type: "varchar", length: 100 })
  name!: string;

  @Column({ name: "role_id", type: "int", nullable: true })
  roleId!: number | null;

  @ManyToOne(() => Role, { nullable: true })
  @JoinColumn({ name: "role_id" })
  role?: Role;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @OneToMany(() => User, (user) => user.position)
  users?: User[];

  @OneToMany(() => PositionPermission, (pp) => pp.position)
  permissions?: PositionPermission[];
}
