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
import { Company } from "../../companies/entities/company.entity";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true, type: "varchar", length: 150 })
  email!: string;

  @Column({ name: "password", type: "varchar", length: 255 })
  passwordHash!: string;

  @Column({ type: "varchar", length: 100 })
  name!: string;

  @Column({ name: "role_id", type: "int", nullable: true })
  roleId!: number | null;

  @ManyToOne(() => Role, { nullable: true })
  @JoinColumn({ name: "role_id" })
  role?: Role;

  @Column({ name: "position_id", type: "int", nullable: true })
  positionId!: number | null;

  /**
   * Raw bytes of the profile picture (null = the initials avatar).
   *
   * Kept in the row, not on disk: the file used to live in `uploads/`, whose
   * location followed `process.cwd()` — start the API from another directory
   * (or lose the gitignored folder) and the picture silently 404'd the next
   * day. `select: false` keeps the blob out of every list/login query.
   */
  @Column({ name: "avatar_data", type: "bytea", nullable: true, select: false })
  avatarData?: Buffer | null;

  /** MIME of `avatar_data` (image/jpeg, image/png, …) so GET can label it. */
  @Column({ name: "avatar_mime", type: "varchar", length: 50, nullable: true, select: false })
  avatarMime?: string | null;

  @ManyToOne(() => Position, { nullable: true })
  @JoinColumn({ name: "position_id" })
  position?: Position;

  /**
   * บริษัทของผู้ใช้คนนี้ — **มีเฉพาะบทบาท `customer`** (ฟอร์มผู้ใช้บังคับตอน
   * บันทึก และ `UsersService` ล้างค่าทิ้งเองเมื่อบทบาทไม่ใช่ลูกค้า) คอลัมน์นี้คือ
   * ตัวบอกว่าลูกค้าเป็นคนของบริษัทไหน (ข้อมูลอ้างอิงที่กรอกผ่านฟอร์ม `/users`)
   *
   * **ไม่ได้ถูกใช้กรองอะไรอีกแล้ว** — เดิมฟอร์มรายงานปัญหาใช้คอลัมน์นี้กรอง
   * dropdown แอป (`GET /apps?mine=1`) และมี guard ตอนสร้างงาน แต่ข้อสรุปจากพี่คือ
   * เชื่อมหรือไม่เชื่อมแอปกับบริษัท ลูกค้าก็ต้องเห็นแอปทุกตัว ทั้งสองจุดจึงถูก
   * ถอดออกไปแล้ว — **อย่าเพิ่มการบังคับกลับโดยไม่ถามก่อน**
   *
   * Nullable ทุกบทบาทอื่นเป็น `null`
   */
  @Column({ name: "company_id", type: "int", nullable: true })
  companyId!: number | null;

  @ManyToOne(() => Company, { nullable: true })
  @JoinColumn({ name: "company_id" })
  company?: Company;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
