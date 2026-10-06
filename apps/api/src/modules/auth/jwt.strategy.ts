import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "./entities/user.entity";
import { Role } from "../roles/entities/role.entity";

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  roleId: number | null;
  positionId: number | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? "secret",
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.users.findOne({ where: { id: Number(payload.sub) } });
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    if (!user.isActive) {
      throw new UnauthorizedException("Account is deactivated");
    }
    if (user.roleId) {
      const role = await this.roles.findOne({ where: { id: user.roleId } });
      if (role && !role.isActive) {
        throw new UnauthorizedException("Role is deactivated");
      }
    }
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      roleId: payload.roleId,
      positionId: payload.positionId,
    };
  }
}
