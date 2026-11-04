import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join, normalize, resolve, sep } from "path";
import { randomBytes } from "crypto";
import { existsSync, unlink } from "fs";
import type { Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangeEmailDto } from "./dto/change-email.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { RolesGuard } from "./roles.guard";
import { Permissions } from "./permissions.decorator";
import { CurrentUser } from "./current-user.decorator";
import { Public } from "./public.decorator";
import { User } from "./entities/user.entity";

/** Same folder the issue attachments land in — one place to look for uploads. */
const UPLOADS_DIR = join(process.cwd(), "uploads");

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
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

  /** Upload (or replace) your profile picture; the old file is deleted. */
  @Post("profile/avatar")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          const ext = (extname(file.originalname) || ".jpg").toLowerCase();
          cb(null, `avatar-${randomBytes(16).toString("hex")}${ext}`);
        },
      }),
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
    const previous = await this.auth.getAvatarPath(user.id);
    await this.auth.setAvatar(user.id, file.filename);
    if (previous && previous !== file.filename) this.deleteUpload(previous);
    return { avatar: file.filename };
  }

  /** Remove the picture — the navbar falls back to the initials avatar. */
  @Delete("profile/avatar")
  async removeAvatar(@CurrentUser() user: User) {
    const previous = await this.auth.getAvatarPath(user.id);
    await this.auth.clearAvatar(user.id);
    if (previous) this.deleteUpload(previous);
    return { avatar: null };
  }

  /** Serves the stored file; 404 when none was ever uploaded. */
  @Get("profile/avatar")
  async serveAvatar(@CurrentUser() user: User, @Res() res: Response) {
    const filename = await this.auth.getAvatarPath(user.id);
    if (!filename) throw new NotFoundException("No avatar");
    this.sendUpload(res, filename);
  }

  /** Resolves a stored filename inside `uploads/` — refuses anything else. */
  private resolveUpload(filename: string): string | null {
    const full = resolve(UPLOADS_DIR, normalize(filename));
    if (full !== resolve(UPLOADS_DIR) && !full.startsWith(resolve(UPLOADS_DIR) + sep)) {
      return null; // path traversal attempt
    }
    return existsSync(full) ? full : null;
  }

  private sendUpload(res: Response, filename: string) {
    const full = this.resolveUpload(filename);
    if (!full) throw new NotFoundException("No avatar");
    const ext = extname(full).toLowerCase();
    const types: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };
    res.setHeader("Content-Type", types[ext] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.sendFile(full);
  }

  /** Best-effort cleanup — a missing file must never fail the request. */
  private deleteUpload(filename: string) {
    const full = this.resolveUpload(filename);
    if (!full) return;
    unlink(full, () => undefined);
  }
}
