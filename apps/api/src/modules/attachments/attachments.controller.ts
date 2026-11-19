import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname } from "path";
import { randomBytes } from "crypto";
import type { Response } from "express";
import { UPLOADS_DIR } from "../../lib/uploads-path";
import { AttachmentsService } from "./attachments.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth-user";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post("issues/:id/attachments")
  @Permissions("issue.create")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: UPLOADS_DIR,
        filename: (_req, file, cb) => {
          cb(null, `${randomBytes(16).toString("hex")}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        // SVG มี script ได้ — ถึงจะเสิร์ฟเป็น attachment ก็ปฏิเสธไว้ก่อน
        // (กันชนกับนโยบายเดียวกับ avatar ที่เสิร์ฟ inline)
        if (file.mimetype === "image/svg+xml") {
          return cb(new BadRequestException("SVG files are not allowed"), false);
        }
        const allowed = /^(image\/|application\/pdf$)/;
        if (!allowed.test(file.mimetype)) {
          return cb(new Error("Only images and PDF files are allowed"), false);
        }
        cb(null, true);
      },
    }),
  )
  upload(
    @Param("id", ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    // service เช็คขอบเขตงานก่อน (404 = งานไม่มี/ไม่ใช่ของเรา)
    return this.attachments.upload(id, file, Number(user.id), user);
  }

  @Get("issues/:id/attachments")
  @Permissions("board.view")
  findByIssue(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.attachments.findByIssue(id, user);
  }

  @Get("attachments/:id")
  @Permissions("board.view")
  findOne(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.attachments.findOne(id, user);
  }

  @Get("attachments/:id/download")
  @Permissions("board.view")
  download(
    @Param("id", ParseIntPipe) id: number,
    @Res() res: Response,
    @CurrentUser() user: AuthUser,
  ) {
    return this.attachments.download(id, res, user);
  }

  @Delete("attachments/:id")
  @Permissions("issue.all.update")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.attachments.remove(id);
  }
}
