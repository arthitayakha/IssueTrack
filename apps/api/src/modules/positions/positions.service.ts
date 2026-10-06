import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { Position } from "./position.entity";
import { PositionPermission } from "./entities/position-permission.entity";
import { User } from "../auth/entities/user.entity";
import { Role } from "../roles/entities/role.entity";
import { PermissionsService } from "../permissions/permissions.service";
import { permissionsForRole } from "@kanban/shared";

@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(Position)
    private readonly positions: Repository<Position>,
    @InjectRepository(PositionPermission)
    private readonly positionPermissions: Repository<PositionPermission>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    private readonly dataSource: DataSource,
    private readonly permissionsService: PermissionsService,
  ) {}

  async findAll() {
    const positions = await this.positions.find({ order: { id: "ASC" } });
    const result = await Promise.all(
      positions.map(async (p) => ({
        id: p.id,
        name: p.name,
        roleId: p.roleId,
        roleName: p.roleId
          ? (await this.roles.findOne({ where: { id: p.roleId } }))?.name ?? null
          : null,
        isActive: p.isActive,
        userCount: await this.users.count({ where: { positionId: p.id } }),
      })),
    );
    return result;
  }

  async create(name: string, roleId?: number | null) {
    const existing = await this.positions.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`Position "${name}" already exists`);
    }
    const position = await this.positions.save(
      this.positions.create({ name, roleId: roleId ?? null }),
    );
    let defaultPermissions: string[];
    if (roleId) {
      const role = await this.roles.findOne({ where: { id: roleId } });
      if (role?.name === "admin") {
        defaultPermissions = [...permissionsForRole("admin")];
      } else {
        defaultPermissions = [...permissionsForRole("customer")];
      }
    } else {
      defaultPermissions = [...permissionsForRole("customer")];
    }
    const rows = defaultPermissions.map((permission) =>
      this.positionPermissions.create({ positionId: position.id, permission }),
    );
    await this.positionPermissions.save(rows);
    await this.permissionsService.refreshCache();
    return { id: position.id, name: position.name, roleId: position.roleId, permissions: [...defaultPermissions] };
  }

  async getPermissions(id: number) {
    const position = await this.positions.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(`Position ${id} not found`);
    }
    const rows = await this.positionPermissions.find({ where: { positionId: id } });
    return { id: position.id, name: position.name, permissions: rows.map((r) => r.permission) };
  }

  async updatePermissions(id: number, permissions: string[]) {
    const position = await this.positions.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(`Position ${id} not found`);
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(PositionPermission, { positionId: id });
      const rows = permissions.map((permission) =>
        manager.create(PositionPermission, { positionId: id, permission }),
      );
      await manager.save(PositionPermission, rows);
    });
    await this.permissionsService.refreshCache();
    return { id: position.id, name: position.name, permissions };
  }

  async update(id: number, name: string, roleId?: number | null) {
    const position = await this.positions.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(`Position ${id} not found`);
    }
    const existing = await this.positions.findOne({ where: { name } });
    if (existing && existing.id !== id) {
      throw new ConflictException(`Position "${name}" already exists`);
    }
    position.name = name;
    position.roleId = roleId ?? null;
    return this.positions.save(position);
  }

  async findUsersByPosition(positionId: number) {
    const users = await this.users.find({
      where: { positionId },
      order: { id: "ASC" },
    });
    return users.map((u) => ({ id: String(u.id), name: u.name, email: u.email }));
  }

  async updateActive(id: number, isActive: boolean) {
    const position = await this.positions.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(`Position ${id} not found`);
    }
    if (!isActive) {
      const userCount = await this.users.count({ where: { positionId: id } });
      if (userCount > 0) {
        throw new ConflictException(
          `Cannot deactivate position "${position.name}" because it has ${userCount} user(s) assigned`,
        );
      }
    }
    position.isActive = isActive;
    await this.positions.save(position);
    return { id: position.id, name: position.name, isActive: position.isActive };
  }

  async check(id: number) {
    const position = await this.positions.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(`Position ${id} not found`);
    }
    const userCount = await this.users.count({ where: { positionId: id } });
    return { canDelete: userCount === 0, userCount };
  }

  async remove(id: number) {
    const position = await this.positions.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(`Position ${id} not found`);
    }
    const userCount = await this.users.count({ where: { positionId: id } });
    if (userCount > 0) {
      throw new ConflictException(
        `Cannot delete position "${position.name}" because it has ${userCount} user(s) assigned`,
      );
    }
    await this.positions.delete(id);
    return { deleted: true };
  }
}
