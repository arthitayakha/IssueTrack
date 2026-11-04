import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { User } from "./entities/user.entity";
import { Role } from "../roles/entities/role.entity";
import { LoginDto } from "./dto/login.dto";
import { PositionPermission } from "../positions/entities/position-permission.entity";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    @InjectRepository(PositionPermission)
    private readonly positionPermissions: Repository<PositionPermission>,
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
    const positionPerms = user.positionId
      ? (await this.positionPermissions.find({ where: { positionId: user.positionId } }))
          .filter((p) => !p.denied)
          .map((p) => p.permission)
      : [];
    const accessToken = await this.jwt.signAsync({
      sub: String(user.id),
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      positionId: user.positionId,
    });
    return { accessToken, user: this.toPublicUser(user, role?.name ?? null, positionPerms) };
  }

  async me(user: User) {
    const role = user.roleId
      ? await this.roles.findOne({ where: { id: user.roleId } })
      : null;
    const positionPerms = user.positionId
      ? (await this.positionPermissions.find({ where: { positionId: user.positionId } }))
          .filter((p) => !p.denied)
          .map((p) => p.permission)
      : [];
    return this.toPublicUser(user, role?.name ?? null, positionPerms);
  }

  /** Self-service profile update — no `user.update` permission needed. */
  async updateProfile(userId: number, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException("Name is required");
    await this.users.update({ id: userId }, { name: trimmed });
    const user = await this.users.findOne({ where: { id: userId } });
    return user ? await this.me(user) : null;
  }

  /**
   * Self-service e-mail change — the current password proves it is really you.
   * The row is re-read by id: the JWT payload carries the OLD e-mail, so
   * `@CurrentUser()` cannot be trusted for anything but the id.
   *
   * A wrong password is a 403, never a 401 — the web client logs the user out
   * on any 401 (`lib/api.ts`), and a typo here must not end the session.
   */
  async changeEmail(userId: number, email: string, currentPassword: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("User not found");
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new ForbiddenException("Current password is incorrect");
    }

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) throw new BadRequestException("Email is required");
    if (trimmed === user.email.toLowerCase()) {
      throw new BadRequestException("New email is the same as the current one");
    }
    const taken = await this.users.findOne({ where: { email: trimmed } });
    if (taken) throw new ConflictException("Email is already in use");

    try {
      await this.users.update({ id: userId }, { email: trimmed });
    } catch (err) {
      // race with another signup/update — the unique index has the last word
      if (isUniqueViolation(err)) throw new ConflictException("Email is already in use");
      throw err;
    }
    const updated = await this.users.findOne({ where: { id: userId } });
    return updated ? await this.me(updated) : null;
  }

  /**
   * Self-service password change (same 403-not-401 rule as `changeEmail`).
   * Other sessions keep their 7-day JWT — there is no token invalidation yet.
   */
  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("User not found");
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new ForbiddenException("Current password is incorrect");
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException("New password must differ from the current one");
    }
    // rounds 12 — the same cost the admin form uses (UsersService)
    await this.users.update({ id: userId }, { passwordHash: await bcrypt.hash(newPassword, 12) });
    return { changed: true };
  }

  /** Stores the uploaded picture's path (the file itself lives in `uploads/`). */
  async setAvatar(userId: number, path: string) {
    await this.users.update({ id: userId }, { avatar: path });
  }

  async clearAvatar(userId: number) {
    await this.users.update({ id: userId }, { avatar: null });
  }

  /** The stored path, or null — the controller deletes the old file on replace. */
  async getAvatarPath(userId: number): Promise<string | null> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, avatar: true },
    });
    return user?.avatar ?? null;
  }

  private toPublicUser(user: User, roleName: string | null, positionPermissions: string[] = []) {
    return {
      id: String(user.id),
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      positionId: user.positionId,
      roleName,
      isActive: user.isActive,
      positionPermissions,
    };
  }
}

/** Postgres unique_violation — surfaced by TypeORM as a QueryFailedError. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return e?.code === "23505" || e?.driverError?.code === "23505";
}
