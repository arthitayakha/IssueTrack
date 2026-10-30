import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { User } from "../../auth/entities/user.entity";

@Entity("activity_logs")
export class ActivityLog {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Who did it — the name/role are read off `users` (+`roles`) at query time, never stored. */
  @Column({ name: "actor_id", type: "int", nullable: true })
  actorId!: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: "actor_id" })
  actor?: User | null;

  @Column({ type: "varchar", length: 100 })
  action!: string;

  /** Issue id for card/comment rows, rule id for `rule.*` audit rows. */
  @Column({ name: "entity_id", type: "int", nullable: true })
  entityId!: number | null;

  @Column({ type: "text", nullable: true })
  detail!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
