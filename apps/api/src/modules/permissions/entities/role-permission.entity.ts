import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from "typeorm";
import { Role } from "../../roles/entities/role.entity";

@Entity("role_permissions")
@Unique(["roleId", "permission"])
export class RolePermission {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "role_id", type: "int" })
  roleId!: number;

  @ManyToOne(() => Role, { onDelete: "CASCADE" })
  @JoinColumn({ name: "role_id" })
  role?: Role;

  @Column()
  permission!: string;
}
