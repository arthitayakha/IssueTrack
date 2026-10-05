import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Position } from "./position.entity";
import { User } from "../auth/entities/user.entity";

@Injectable()
export class PositionsService {
  constructor(
    @InjectRepository(Position)
    private readonly positions: Repository<Position>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async findAll() {
    const positions = await this.positions.find();
    const result = await Promise.all(
      positions.map(async (p) => ({
        id: p.id,
        name: p.name,
        isActive: p.isActive,
        userCount: await this.users.count({ where: { positionId: p.id } }),
      })),
    );
    return result;
  }

  async create(name: string) {
    const existing = await this.positions.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`Position "${name}" already exists`);
    }
    return this.positions.save(this.positions.create({ name }));
  }

  async rename(id: number, name: string) {
    const position = await this.positions.findOne({ where: { id } });
    if (!position) {
      throw new NotFoundException(`Position ${id} not found`);
    }
    const existing = await this.positions.findOne({ where: { name } });
    if (existing) {
      throw new ConflictException(`Position "${name}" already exists`);
    }
    position.name = name;
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
