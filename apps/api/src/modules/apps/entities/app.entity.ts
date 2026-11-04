import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Issue } from "../../issues/entities/issue.entity";

/**
 * ระบบ/แอป (เช่น POS) — **1 แอปผูกกับหลายบริษัทได้** ผ่านตารางเชื่อม
 * `app_companies` (migration 1808) ซึ่งต่อมา (migration 1810) กลายเป็นที่
 * เก็บวันที่อายุของ "แต่ละคู่ แอป×บริษัท" ด้วย → ดู `AppCompany`
 *
 * ไม่มี relation ชี้กลับไปที่ `AppCompany` โดยเจตนา (เหตุผลอยู่ในไฟล์นั้น)
 * — ฝั่ง service โหลดคู่ด้วย `Repository<AppCompany>` เอง
 */
@Entity("apps")
export class App {
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

  @OneToMany(() => Issue, (issue) => issue.app)
  issues?: Issue[];
}
