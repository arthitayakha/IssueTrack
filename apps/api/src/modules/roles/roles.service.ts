import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Role } from "./entities/role.entity";
import { RolePermission } from "../permissions/entities/role-permission.entity";
import { User } from "../auth/entities/user.entity";
import { PermissionsService } from "../permissions/permissions.service";
import { ALL_PERMISSIONS, permissionsForRole, type Permission } from "@kanban/shared";
import { paginateTotal, PaginationParams } from "../../common/pagination";

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermissions: Repository<RolePermission>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly permissionsService: PermissionsService,
  ) {}

  async findAll(params: PaginationParams) {
    /** SQL page — เดิมโหลดทุก role + `userCount` รายแถว แล้วค่อย slice (ดู companies) */
    const [rows, total] = await this.roles.findAndCount({
      order: { id: "ASC" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });
    const mapped = await Promise.all(
      rows.map(async (role) => ({
        ...role,
        userCount: await this.users.count({ where: { roleId: role.id } }),
      })),
    );
    return paginateTotal(mapped, total, params);
  }

  async findAllActive() {
    return this.roles.find({ where: { isActive: true }, order: { id: "ASC" } });
  }

  async create(name: string, template: string = "customer") {
    const existing = await this.roles.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`Role "${name}" already exists`);
    }

    const role = await this.roles.save(
      this.roles.create({ name, isActive: true }),
    );

    const defaultPermissions = permissionsForRole(template);
    const rows = defaultPermissions.map((permission) =>
      this.rolePermissions.create({ roleId: role.id, permission }),
    );
    await this.rolePermissions.save(rows);

    return { id: role.id, name: role.name, isActive: role.isActive, permissions: [...defaultPermissions] };
  }

  async update(id: number, data: { name?: string; isActive?: boolean }) {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }

    if (data.name !== undefined) role.name = data.name;
    if (data.isActive !== undefined) role.isActive = data.isActive;

    await this.roles.save(role);
    return { id: role.id, name: role.name, isActive: role.isActive };
  }

  async updateActive(id: number, isActive: boolean) {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }

    if (role.name === "admin") {
      throw new BadRequestException("Cannot deactivate admin role");
    }

    if (!isActive) {
      const userCount = await this.users.count({ where: { roleId: id } });
      if (userCount > 0) {
        throw new BadRequestException(
          `Cannot deactivate role "${role.name}" because it has ${userCount} user(s) assigned`,
        );
      }
    }

    role.isActive = isActive;
    await this.roles.save(role);
    return { id: role.id, name: role.name, isActive: role.isActive };
  }

  async check(id: number) {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }
    const userCount = await this.users.count({ where: { roleId: id } });
    return { canDelete: userCount === 0, userCount };
  }

  async remove(id: number) {
    const userCount = await this.users.count({ where: { roleId: id } });
    if (userCount > 0) {
      throw new BadRequestException(
        `Cannot delete role because it has ${userCount} user(s) assigned`,
      );
    }

    const result = await this.roles.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }
    return { deleted: true };
  }

  async findUsersByRole(roleId: number) {
    const users = await this.users.find({
      where: { roleId },
      order: { id: "ASC" },
    });
    return users.map((u) => ({ id: String(u.id), name: u.name, email: u.email }));
  }

  async updateRolePermissions(id: number, permissions: string[]) {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Role with id ${id} not found`);
    }

    /**
     * **whitelist `ALL_PERMISSIONS`** — ตรงกับ `permissions.updateMatrix`:
     * เดิมเส้นนี้ insert string อะไรก็ได้ลง `role_permissions` (code ปลอม /
     * ยาวเกินจะหลุดเข้า DB) · **ทุกขั้นอยู่ใน transaction เดียว** — เดิม
     * delete แล้วค่อย insert นอก transaction: fail กลางทาง = สิทธิ์ของ role
     * นั้นหายบางส่วน (เทียบ `positions.updatePermissions` ที่ห่ออยู่แล้ว)
     */
    const granted = [
      ...new Set(
        permissions.filter((permission) =>
          ALL_PERMISSIONS.includes(permission as Permission),
        ),
      ),
    ];
    await this.rolePermissions.manager.transaction(async (em) => {
      await em.delete(RolePermission, { roleId: id });
      const rows = granted.map((permission) =>
        em.create(RolePermission, { roleId: id, permission }),
      );
      await em.save(RolePermission, rows);
    });
    await this.permissionsService.refreshCache();

    return { id: role.id, name: role.name, permissions: granted };
  }
}
