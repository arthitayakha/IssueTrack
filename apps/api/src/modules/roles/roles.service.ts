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
import { permissionsForRole } from "@kanban/shared";

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    @InjectRepository(RolePermission)
    private readonly rolePermissions: Repository<RolePermission>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async findAll() {
    return this.roles.find({ order: { id: "ASC" } });
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

    await this.rolePermissions.delete({ roleId: id });
    const rows = permissions.map((permission) =>
      this.rolePermissions.create({ roleId: id, permission }),
    );
    await this.rolePermissions.save(rows);

    return { id: role.id, name: role.name, permissions };
  }
}
