import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { User } from "../auth/entities/user.entity";
import { Position } from "../positions/position.entity";
import { Role } from "../roles/entities/role.entity";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Position)
    private readonly positions: Repository<Position>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
  ) {}

  async findAll() {
    const users = await this.users
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.position", "position")
      .leftJoinAndSelect("user.role", "role")
      .orderBy("user.id", "ASC")
      .getMany();

    return users.map((user) => ({
      id: String(user.id),
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role?.name ?? null,
      positionId: user.positionId,
      positionName: user.position?.name ?? null,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }

  async create(data: {
    email: string;
    password: string;
    name: string;
    roleId?: number | null;
    positionId?: number | null;
  }) {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await this.users.save(
      this.users.create({ ...data, passwordHash }),
    );
    const positionName = user.positionId
      ? (await this.positions.findOne({ where: { id: user.positionId } }))?.name ?? null
      : null;
    const roleName = user.roleId
      ? (await this.roles.findOne({ where: { id: user.roleId } }))?.name ?? null
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

    await this.users.save(user);
    const positionName = user.positionId
      ? (await this.positions.findOne({ where: { id: user.positionId } }))?.name ?? null
      : null;
    const roleName = user.roleId
      ? (await this.roles.findOne({ where: { id: user.roleId } }))?.name ?? null
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

  private toPublicUser(user: User, positionName: string | null = null, roleName: string | null = null) {
    return {
      id: String(user.id),
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName,
      positionId: user.positionId,
      positionName,
      isActive: user.isActive,
    };
  }
}
