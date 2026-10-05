import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../auth/entities/user.entity";

@Entity("positions")
export class Position {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, length: 100 })
  name!: string;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @OneToMany(() => User, (user) => user.position)
  users?: User[];
}
