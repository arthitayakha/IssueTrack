import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangeEmailDto } from "./dto/change-email.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ResetOwnPasswordDto } from "./dto/reset-own-password.dto";
import { RolesGuard } from "./roles.guard";
import { Permissions } from "./permissions.decorator";
import { CurrentUser } from "./current-user.decorator";
import { Public } from "./public.decorator";
import { User } from "./entities/user.entity";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /**
   * Step 1 of "forgot password". Always 200 with the same body — an unknown
   * or inactive address is only logged, never revealed (anti-enumeration).
   * With no SMTP configured the link is printed to the API console instead.
   */
  @Public()
  @Post("forgot-password")
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto.email, dto.locale);
  }

  /** Step 2 — exchanging the one-time link for a brand new password. */
  @Public()
  @Post("reset-password")
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Get("me")
  @UseGuards(RolesGuard)
  @Permissions("user.view")
  me(@CurrentUser() user: User) {
    return this.auth.me(user);
  }

  /**
   * Self-service: rename yourself — no `user.update` permission required.
   * The body is a DTO now, so `whitelist`/`transform` in `main.ts` actually
   * validate it (a plain object type is skipped by the ValidationPipe).
   */
  @Patch("profile")
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto.name);
  }

  /**
   * Self-service e-mail change; needs the current password (403 when it is
   * wrong — a 401 would log the user out of the web client).
   */
  @Patch("profile/email")
  changeEmail(@CurrentUser() user: User, @Body() dto: ChangeEmailDto) {
    return this.auth.changeEmail(user.id, dto.email, dto.currentPassword);
  }

  /** Self-service password change; same current-password rule as the e-mail. */
  @Patch("profile/password")
  changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  /**
   * Self-service password RESET — the counterpart for people who cannot
   * remember the current one: no current password and no e-mail, because the
   * caller is already signed in and the session is the proof (that is why
   * this route has no `@Public()`: the global JwtAuthGuard guards it). The
   * e-mail flow above stays for signed-out users.
   */
  @Post("profile/reset-password")
  resetOwnPassword(@CurrentUser() user: User, @Body() dto: ResetOwnPasswordDto) {
    return this.auth.resetOwnPassword(user.id, dto.newPassword);
  }

  /**
   * Upload (or replace) your profile picture. The bytes go straight into the
   * row (`users.avatar_data`) — multer runs from memory, so nothing lands in
   * `uploads/` any more: a file there used to vanish whenever the API was
   * started from a different working directory, and the row outlived it, so
   * the picture silently 404'd the next day. A replace simply overwrites the
   * same row — no old file to delete, no window where the row points at
   * something that is already gone.
   */
  @Post("profile/avatar")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
          // a plain Error would surface as 500 — say what went wrong instead
          cb(new BadRequestException("Only image files are allowed"), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("No file uploaded");
    await this.auth.setAvatar(user.id, file.buffer, file.mimetype);
    this.logger.log(
      `profile picture updated for user #${user.id} (${file.mimetype}, ${file.buffer.length} bytes)`,
    );
    return { ok: true };
  }

  /** Remove the picture — the navbar falls back to the initials avatar. */
  @Delete("profile/avatar")
  async removeAvatar(@CurrentUser() user: User) {
    await this.auth.clearAvatar(user.id);
    this.logger.log(`profile picture removed for user #${user.id}`);
    return { ok: true };
  }

  /**
   * Serves the stored bytes; 404 when the user never uploaded one.
   * `no-store` on the miss matters as much as `max-age` on the hit — a cached
   * 404 keeps rendering the initials avatar long after a picture exists.
   */
  @Get("profile/avatar")
  async serveAvatar(@CurrentUser() user: User, @Res() res: Response) {
    const picture = await this.auth.getAvatar(user.id);
    if (!picture) {
      res.setHeader("Cache-Control", "no-store");
      throw new NotFoundException("No avatar");
    }
    // the upload filter only accepts image/* — the guard covers older rows too
    res.setHeader(
      "Content-Type",
      picture.mime.startsWith("image/") ? picture.mime : "application/octet-stream",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Length", String(picture.data.length));
    res.end(picture.data);
  }
}
