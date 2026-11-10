import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { createHash, randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";
import { User } from "./entities/user.entity";
import { PasswordResetToken } from "./entities/password-reset-token.entity";
import { Role } from "../roles/entities/role.entity";
import { LoginDto } from "./dto/login.dto";
import { MailService } from "../mail/mail.service";
import { PositionPermission } from "../positions/entities/position-permission.entity";
import { Position } from "../positions/position.entity";
import { Company } from "../companies/entities/company.entity";

/** How long a reset link stays valid, and how often we may re-send one. */
const RESET_TTL_MS = 30 * 60 * 1000;
const RESET_RESEND_MS = 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    @InjectRepository(Role)
    private readonly roles: Repository<Role>,
    @InjectRepository(Position)
    private readonly positions: Repository<Position>,
    @InjectRepository(PositionPermission)
    private readonly positionPermissions: Repository<PositionPermission>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly mail: MailService,
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
    return { accessToken, user: await this.toPublicUser(user, role?.name ?? null, positionPerms) };
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
    return await this.toPublicUser(user, role?.name ?? null, positionPerms);
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

  /**
   * Self-service password RESET for someone who cannot remember the current
   * password: the session already proved identity, so neither the current
   * password nor the e-mail flow is involved (that one stays for signed-out
   * users). We hold the hash, so "the new one repeats the old one" costs a
   * single compare instead of a field on the form. Same caveats as
   * `changePassword`: other sessions keep their 7-day JWT, and a wrong value
   * here is a 400 — never a 401, which would log the web client out.
   */
  async resetOwnPassword(userId: number, newPassword: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("User not found");
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException("New password must differ from the current one");
    }
    await this.users.update({ id: userId }, { passwordHash: await bcrypt.hash(newPassword, 12) });
    this.logger.log(`password reset by the signed-in user #${user.id} (${user.email})`);
    return { reset: true };
  }

  /**
   * "Forgot password" — answers the same `{ ok: true }` whether or not the
   * e-mail has an active account, so the endpoint cannot be used to probe
   * which addresses exist. A real request drops the user's older links, stores
   * only the sha256 of a fresh 32-byte token, and mails a link that lives 30
   * minutes and can be redeemed exactly once.
   */
  async requestPasswordReset(email: string, locale: "th" | "en" = "th") {
    const trimmed = email.trim();
    const user = await this.users
      .createQueryBuilder("u")
      .where("u.email ILIKE :email", { email: trimmed })
      .getOne();

    if (!user || !user.isActive) {
      this.logger.warn(`password reset requested for unknown or inactive address: ${trimmed}`);
      return { ok: true };
    }

    // one link per minute — a double submit must not re-send the e-mail
    const recent = await this.resetTokens.findOne({
      where: { userId: user.id, usedAt: IsNull() },
      order: { createdAt: "DESC" },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < RESET_RESEND_MS) {
      return { ok: true };
    }

    // only the newest link may ever work
    await this.resetTokens.delete({ userId: user.id, usedAt: IsNull() });

    const token = randomBytes(32).toString("hex");
    await this.resetTokens.save(
      this.resetTokens.create({
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
        usedAt: null,
      }),
    );

    const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
    await this.mail.sendPasswordReset(user.email, user.name, `${base}/${locale}/reset-password?token=${token}`);
    return { ok: true };
  }

  /**
   * Redeems a reset link: hash lookup, expiry and single use are checked
   * before the new password is written. The row is consumed atomically
   * (`used_at IS NULL` in the UPDATE) so two parallel submits cannot both win.
   * The wrong/expired token is always the same 400 — the page maps it to i18n.
   */
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = createHash("sha256").update(token.trim()).digest("hex");
    const record = await this.resetTokens.findOne({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("Invalid or expired reset link");
    }
    const consumed = await this.resetTokens.update(
      { id: record.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    if (!consumed.affected) throw new BadRequestException("Invalid or expired reset link");

    const user = await this.users.findOne({ where: { id: record.userId } });
    if (!user || !user.isActive) throw new BadRequestException("Invalid or expired reset link");

    await this.users.update({ id: user.id }, { passwordHash: await bcrypt.hash(newPassword, 12) });
    this.logger.log(`password reset through a link for user #${user.id} (${user.email})`);
    return { ok: true };
  }

  /** Stores the uploaded picture's bytes — no file on disk any more. */
  async setAvatar(userId: number, data: Buffer, mime: string) {
    await this.users.update({ id: userId }, { avatarData: data, avatarMime: mime });
  }

  async clearAvatar(userId: number) {
    await this.users.update({ id: userId }, { avatarData: null, avatarMime: null });
  }

  /**
   * The stored picture, or null when this user has none. The blob columns are
   * `select: false`, so they are pulled in explicitly and only for this call.
   */
  async getAvatar(userId: number): Promise<{ data: Buffer; mime: string } | null> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, avatarData: true, avatarMime: true },
    });
    if (!user?.avatarData?.length) return null;
    return { data: user.avatarData, mime: user.avatarMime ?? "image/jpeg" };
  }

  private async toPublicUser(user: User, roleName: string | null, positionPermissions: string[] = []) {
    const positionName = user.positionId
      ? ((await this.positions.findOne({ where: { id: user.positionId } }))?.name ?? null)
      : null;
    // บริษัทของผู้ใช้ (มีค่าเฉพาะบทบาท `customer`) — โชว์ใน popup โปรไฟล์เท่านั้น
    // อ่านตอนนี้ที่เดียว: ไม่เก็บลง JWT ไม่ต้อง prefill ฝั่ง client
    const companyName = user.companyId
      ? ((await this.companies.findOne({ where: { id: user.companyId } }))?.name ?? null)
      : null;
    return {
      id: String(user.id),
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      positionId: user.positionId,
      positionName,
      companyId: user.companyId ?? null,
      companyName,
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
