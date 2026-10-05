import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity("activity_logs")
export class ActivityLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "actor_id", type: "int", nullable: true })
  actorId!: number | null;

  @Column({ name: "actor_name", length: 100, nullable: true })
  actorName!: string | null;

  @Column({ name: "actor_role", length: 50, nullable: true })
  actorRole!: string | null;

  @Column({ length: 100 })
  action!: string;

  @Column({ name: "board_id", type: "int", nullable: true })
  boardId!: number | null;

  @Column({ name: "entity_id", type: "int", nullable: true })
  entityId!: number | null;

  @Column({ type: "text", nullable: true })
  detail!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
