import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * บริษัท — standalone master data, same shape as `apps` (name + visibility).
 *
 * Linked to apps **many-to-many** through `app_companies` (migration 1808):
 * the relation is mapped only on `App` (`@ManyToMany` + `@JoinTable`), so this
 * entity stays import-free of `App` and `CompaniesService` counts the join rows
 * through `Repository<App>` instead. A company is deletable only while no app
 * points at it — see `CompaniesService.check()`.
 */
@Entity("companies")
export class Company {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 100, unique: true })
  name!: string;

  @Column({ name: "is_visible", default: true })
  isVisible!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
