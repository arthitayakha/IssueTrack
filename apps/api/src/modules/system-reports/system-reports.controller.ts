import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { randomBytes } from "crypto";
import { extname } from "path";
import type { Response } from "express";
import { UPLOADS_DIR } from "../../lib/uploads-path";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth-user";
import { SystemReportsService } from "./system-reports.service";
import {
  CreateSystemReportDto,
  UpdateSystemReportStatusDto,
} from "./dto/system-report.dto";

/** multipart รายงานบั๊ก — รูป/PDF เหมือนนโยบายไฟล์แนบของงาน (ปฏิเสธ SVG) */
const uploadOptions = {
  storage: diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      cb(null, `${randomBytes(16).toString("hex")}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => {
    if (file.mimetype === "image/svg+xml") {
      return cb(new BadRequestException("SVG files are not allowed"), false);
    }
    if (!/^(image\/|application\/pdf$)/.test(file.mimetype)) {
      return cb(new BadRequestException("Only images and PDF files are allowed"), false);
    }
    cb(null, true);
  },
};

@Controller("system-reports")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemReportsController {
  constructor(private readonly service: SystemReportsService) {}

  /** ทุกคนที่ล็อกอินอยู่ส่งรายงานบั๊กได้ (รวมลูกค้าที่หน้า /issues/new พัง) */
  @Post()
  @UseInterceptors(FilesInterceptor("files", 5, uploadOptions))
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateSystemReportDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.service.create(dto, files ?? [], user);
  }

  /** แอดมินเห็นทั้งหมด ที่เหลือเห็นเฉพาะของตัวเอง (กรองใน service) */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("problemType") problemType?: string) {
    return this.service.list(user, problemType);
  }

  @Get(":id")
  findOne(@Param("id", ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.findOne(id, user);
  }

  @Patch(":id/status")
  @Permissions("system_report.update")
  updateStatus(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateSystemReportStatusDto,
  ) {
    return this.service.updateStatus(id, dto.status);
  }

  @Get(":id/attachments/:attachmentId/download")
  download(
    @Param("id", ParseIntPipe) id: number,
    @Param("attachmentId", ParseIntPipe) attachmentId: number,
    @Res() res: Response,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.download(id, attachmentId, res, user);
  }
}
