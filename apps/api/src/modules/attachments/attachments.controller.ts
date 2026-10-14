import {
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
import { extname, join } from "path";
import { randomBytes } from "crypto";
import type { Response } from "express";
import { AttachmentsService } from "./attachments.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post("issues/:id/attachments")
  @Permissions("issue.create")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: join(process.cwd(), "uploads"),
        filename: (_req, file, cb) => {
          cb(null, `${randomBytes(16).toString("hex")}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
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
    @CurrentUser() user: { id: number },
  ) {
    return this.attachments.upload(id, file, user.id);
  }

  @Get("issues/:id/attachments")
  @Permissions("board.view")
  findByIssue(@Param("id", ParseIntPipe) id: number) {
    return this.attachments.findByIssue(id);
  }

  @Get("attachments/:id")
  @Permissions("board.view")
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.attachments.findOne(id);
  }

  @Get("attachments/:id/download")
  @Permissions("board.view")
  download(@Param("id", ParseIntPipe) id: number, @Res() res: Response) {
    return this.attachments.download(id, res);
  }

  @Delete("attachments/:id")
  @Permissions("issue.all.update")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.attachments.remove(id);
  }
}
