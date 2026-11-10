import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { User } from "../auth/entities/user.entity";
import { Position } from "../positions/position.entity";
import { Role } from "../roles/entities/role.entity";
import { Company } from "../companies/entities/company.entity";
import { paginate, PaginationParams } from "../../common/pagination";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Position)
    private readonly positions: Repository<Position>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
  ) {}

  /**
   * รายการผู้ใช้แบบแบ่งหน้า — `filters` มาจาก query string ของ `GET /users`
   * (ฟิวเตอร์: บริษัท / บทบาท / ตำแหน่ง บนหน้าจัดการผู้ใช้) แต่ละตัวเป็น **array**
   * ของ multi-select (tick ไว้กี่อันก็กรองแบบ OR) ไม่ส่ง/ array ว่าง = ไม่กรอง
   */
  async findAll(
    params: PaginationParams,
    filters: {
      companyIds?: number[];
      roleIds?: number[];
      positionIds?: number[];
    } = {},
  ) {
    const qb = this.users
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.position", "position")
      .leftJoinAndSelect("user.role", "role")
      // บริษัทของลูกค้า — join มาเพื่อให้ตารางผู้ใช้โชว์ชื่อบริษัทได้ทันที
      .leftJoinAndSelect("user.company", "company");

    const { companyIds, roleIds, positionIds } = filters;
    if (companyIds && companyIds.length > 0) {
      qb.andWhere("user.companyId IN (:...companyIds)", { companyIds });
    }
    if (roleIds && roleIds.length > 0) {
      qb.andWhere("user.roleId IN (:...roleIds)", { roleIds });
    }
    if (positionIds && positionIds.length > 0) {
      qb.andWhere("user.positionId IN (:...positionIds)", { positionIds });
    }

    const users = await qb.orderBy("user.id", "ASC").getMany();

    const mapped = users.map((user) => ({
      id: String(user.id),
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role?.name ?? null,
      positionId: user.positionId,
      positionName: user.position?.name ?? null,
      companyId: user.companyId ?? null,
      companyName: user.company?.name ?? null,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
    return paginate(mapped, params);
  }

  /**
   * Lightweight member list for the board (assignee/reporter pickers).
   * Only exposes id/name/role - no email - so it can be read by anyone
   * who is allowed to see the board, not only by `user.view` holders.
   */
  async findMembers() {
    const users = await this.users
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.role", "role")
      .orderBy("user.id", "ASC")
      .getMany();

    return users.map((user) => ({
      id: String(user.id),
      name: user.name,
      roleId: user.roleId,
      roleName: user.role?.name ?? null,
      isActive: user.isActive,
    }));
  }

  async create(data: {
    email: string;
    password: string;
    name: string;
    roleId?: number | null;
    positionId?: number | null;
    companyId?: number | null;
  }) {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const roleId = data.roleId ?? null;
    const roleName = await this.roleNameOf(roleId);
    const companyId = await this.resolveCompanyId(roleName, data.companyId ?? null);
    const user = await this.users.save(
      this.users.create({ ...data, companyId, passwordHash }),
    );
    const positionName = user.positionId
      ? (await this.positions.findOne({ where: { id: user.positionId } }))?.name ?? null
      : null;
    return this.toPublicUser(user, positionName, roleName);
  }

  async update(
    id: number,
    data: {
      email?: string;
      name?: string;
      roleId?: number | null;
      password?: string;
      positionId?: number | null;
      companyId?: number | null;
    },
  ) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) return null;

    if (data.email) user.email = data.email;
    if (data.name) user.name = data.name;
    if (data.roleId !== undefined) user.roleId = data.roleId;
    if (data.password) {
      user.passwordHash = await bcrypt.hash(data.password, 12);
    }
    if (data.positionId !== undefined) {
      user.positionId = data.positionId;
    }

    /**
     * บริษัทถูกตัดสินจาก **บทบาทที่จะเป็นหลังบันทึก** — การเปลี่ยนจากลูกค้าเป็น
     * แอดมินในรอบเดียวกันต้องเคลียร์ `company_id` เป็น null ด้วย (คอลัมน์นี้
     * มีความหมายเฉพาะบทบาท `customer`) และฝั่งฟอร์มก็ส่ง `companyId: null`
     * มาพร้อม `roleId` ใหม่อยู่แล้ว
     */
    const roleName = await this.roleNameOf(user.roleId);
    user.companyId = await this.resolveCompanyId(
      roleName,
      data.companyId !== undefined ? data.companyId : user.companyId,
    );

    await this.users.save(user);
    const positionName = user.positionId
      ? (await this.positions.findOne({ where: { id: user.positionId } }))?.name ?? null
      : null;
    return this.toPublicUser(user, positionName, roleName);
  }

  async updateActive(id: number, isActive: boolean) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) return null;
    user.isActive = isActive;
    await this.users.save(user);
    return this.toPublicUser(user);
  }

  async remove(id: number) {
    const result = await this.users.delete(id);
    return result.affected !== 0;
  }

  private async roleNameOf(roleId: number | null): Promise<string | null> {
    if (!roleId) return null;
    return (await this.roles.findOne({ where: { id: roleId } }))?.name ?? null;
  }

  /**
   * **บริษัทเป็นข้อมูลของลูกค้าเท่านั้น** — บทบาทอื่นถูกบังคับเป็น `null`
   * (แอดมิน/โปรแกรมเมอร์ไม่ได้เป็นของบริษัทไหน) ส่วนลูกค้าที่ไม่ได้เลือก
   * บริษัทถือว่าบันทึกไม่ผ่าน เพราะคอลัมน์นี้คือตัวรู้ว่าลูกค้าเป็นคนของ
   * บริษัทไหน ปล่อยว่างไม่ได้ ทั้งนี้ id ต้องชี้ไปยังแถว `companies` จริง
   * ไม่งั้นจะชน FK แล้วกลายเป็น 500 จึงเช็กก่อนเสมอ
   */
  private async resolveCompanyId(
    roleName: string | null,
    companyId: number | null,
  ): Promise<number | null> {
    if (roleName !== "customer") return null;
    if (!companyId) {
      throw new BadRequestException("A customer must belong to a company");
    }
    const company = await this.companies.findOne({ where: { id: companyId } });
    if (!company) {
      throw new BadRequestException(`Company ${companyId} not found`);
    }
    return company.id;
  }

  private async toPublicUser(
    user: User,
    positionName: string | null = null,
    roleName: string | null = null,
  ) {
    const companyName = user.companyId
      ? (await this.companies.findOne({ where: { id: user.companyId } }))?.name ?? null
      : null;
    return {
      id: String(user.id),
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName,
      positionId: user.positionId,
      positionName,
      companyId: user.companyId ?? null,
      companyName,
      isActive: user.isActive,
    };
  }
}
