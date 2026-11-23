import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { Response } from "express";
import { createReadStream, existsSync } from "fs";
import { basename, join } from "path";
import { UPLOADS_DIR } from "../../lib/uploads-path";
import type { AuthUser } from "../auth/auth-user";
import { PermissionsService } from "../permissions/permissions.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SystemReport } from "./entities/system-report.entity";
import { Attachment } from "../attachments/entities/attachment.entity";
import type {
  CreateSystemReportDto,
  SystemReportProblemType,
  SystemReportStatus,
} from "./dto/system-report.dto";
import { SYSTEM_REPORT_PROBLEM_TYPES } from "./dto/system-report.dto";

function resolveFilePath(storedPath: string): string {
  const primary = join(UPLOADS_DIR, storedPath);
  if (existsSync(primary)) return primary;
  return join(UPLOADS_DIR, basename(storedPath));
}

@Injectable()
export class SystemReportsService {
  constructor(
    @InjectRepository(SystemReport)
    private readonly reports: Repository<SystemReport>,
    @InjectRepository(Attachment)
    private readonly attachments: Repository<Attachment>,
    private readonly permissions: PermissionsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** แอดมิน (หรือตำแหน่งที่ติ๊ก `system_report.view`) เห็นทุกแถว */
  private async canSeeAll(user: AuthUser): Promise<boolean> {
    return this.permissions.hasPermission(
      user.roleId,
      "system_report.view",
      user.positionId,
    );
  }

  private async findReport(id: number): Promise<SystemReport> {
    const report = await this.reports.findOne({ where: { id }, relations: ["attachments", "reporter"] });
    if (!report) throw new NotFoundException(`System report ${id} not found`);
    return report;
  }

  private async assertCanView(report: SystemReport, user: AuthUser): Promise<void> {
    if (report.reporterId === Number(user.id)) return;
    if (!(await this.canSeeAll(user))) {
      throw new ForbiddenException("You cannot view this report");
    }
  }

  private toResponse(report: SystemReport) {
    return {
      id: report.id,
      title: report.title,
      description: report.description,
      pageUrl: report.pageUrl,
      problemType: report.problemType ?? "other",
      status: report.status,
      reporterName: report.reporter?.name ?? null,
      reporterEmail: report.reporter?.email ?? null,
      reporterPhone: report.reporter?.phone ?? null,
      reporterId: report.reporterId,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      attachments: (report.attachments ?? []).map((a) => ({
        id: a.id,
        fileName: a.fileName,
        fileType: a.fileType,
        fileSize: a.fileSize,
        createdAt: a.createdAt,
      })),
    };
  }

  /** สร้างรายงาน + บันทึกไฟล์ที่อัปโหลด (ชื่อไฟล์บนดิสก์มาจาก multer แล้ว) */
  async create(
    dto: CreateSystemReportDto,
    files: Express.Multer.File[],
    user: AuthUser,
  ) {
    const report = await this.reports.save(
      this.reports.create({
        reporterId: Number(user.id),
        title: dto.title.trim(),
        description: dto.description.trim(),
        pageUrl: dto.pageUrl?.trim() || null,
        problemType: dto.problemType ?? "other",
        status: "open",
      }),
    );

    if (files.length > 0) {
      const rows = files.map((file) =>
        this.attachments.create({
          systemReportId: report.id,
          fileName: file.originalname,
          // เก็บพาธแบบเดียวกับ attachments ของงาน เพื่อให้ resolveFilePath ใช้ร่วมกันได้
          filePath: join("IssueTrack", "backend", "uploads", file.filename),
          fileType: file.mimetype.slice(0, 10),
          fileSize: file.size,
          uploadedBy: Number(user.id),
        }),
      );
      await this.attachments.save(rows);
    }

    // แจ้งแอดมินแบบ best-effort — notify() ไม่เคย throw (ห้ามให้บั๊กแจ้งเตือน
    // ทำให้การส่งรายงานล้มเหลว) และ actor เป็นผู้ส่ง → ไม่แจ้งตัวเอง
    void this.notifications.notifyAdmins({
      action: "system_report_created",
      title: `รายงานปัญหาระบบ: ${report.title}`.slice(0, 200),
      context: report.description.slice(0, 100),
      // ไม่มีหน้า /system-reports แล้ว — รายงานอยู่ในป๊อปอัพศูนย์ช่วยเหลือ
      // (แอดมินเปิด🎧แล้วเลือก "แจ้งปัญหา") จึงส่งแค่ไปหน้าแดชบอร์ด
      link: "/",
      actor: { actorId: Number(user.id) },
    });

    return this.toResponse(await this.findReport(report.id));
  }

  /** แอดมินเห็นทั้งหมด คนอื่นเห็นเฉพาะของตัวเอง · กรอง problemType ได้ (ไม่ระบุ = ทั้งหมด) */
  async list(user: AuthUser, problemType?: string) {
    const all = await this.canSeeAll(user);
    const type =
      problemType && (SYSTEM_REPORT_PROBLEM_TYPES as readonly string[]).includes(problemType)
        ? (problemType as SystemReportProblemType)
        : undefined;
    const rows = await this.reports.find({
      where: {
        ...(all ? {} : { reporterId: Number(user.id) }),
        ...(type ? { problemType: type } : {}),
      },
      relations: ["attachments", "reporter"],
      order: { createdAt: "DESC", id: "DESC" },
      take: 200,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async findOne(id: number, user: AuthUser) {
    const report = await this.findReport(id);
    await this.assertCanView(report, user);
    return this.toResponse(report);
  }

  async updateStatus(id: number, status: SystemReportStatus) {
    const report = await this.findReport(id);
    report.status = status;
    await this.reports.save(report);
    return this.toResponse(await this.findReport(id));
  }

  /** ดาวน์โหลดไฟล์แนบ — เฉพาะเจ้าของรายงานหรือแอดมิน */
  async download(reportId: number, attachmentId: number, res: Response, user: AuthUser) {
    const report = await this.findReport(reportId);
    await this.assertCanView(report, user);
    const attachment = await this.attachments.findOne({
      where: { id: attachmentId, systemReportId: reportId },
    });
    if (!attachment) throw new NotFoundException(`Attachment ${attachmentId} not found`);

    const fullPath = resolveFilePath(attachment.filePath);
    if (!existsSync(fullPath)) throw new NotFoundException("File not found on disk");

    res.setHeader("Content-Type", attachment.fileType?.trim() || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
    );
    const stream = createReadStream(fullPath);
    stream.on("error", (err) => {
      if (!res.headersSent) {
        res.status(404).json({ message: "File not found on disk" });
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
  }
}
