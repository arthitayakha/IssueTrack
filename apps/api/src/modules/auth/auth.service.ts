import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { User } from "./entities/user.entity";
import { Role } from "../roles/entities/role.entity";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    if (!user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }
    const role = user.roleId
      ? await this.roles.findOne({ where: { id: user.roleId } })
      : null;
    if (role && !role.isActive) {
      throw new UnauthorizedException("Role is deactivated");
    }
    const accessToken = await this.jwt.signAsync({
      sub: String(user.id),
      email: user.email,
      name: user.name,
      roleId: user.roleId,
    });
    return { accessToken, user: this.toPublicUser(user, role?.name ?? null) };
  }

  async me(user: User) {
    const role = user.roleId
      ? await this.roles.findOne({ where: { id: user.roleId } })
      : null;
    return this.toPublicUser(user, role?.name ?? null);
  }

  private toPublicUser(user: User, roleName: string | null) {
    return {
      id: String(user.id),
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName,
      isActive: user.isActive,
    };
  }
}
