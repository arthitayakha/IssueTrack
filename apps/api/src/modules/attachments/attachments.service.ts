import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { Response } from "express";
import { createReadStream, existsSync, unlinkSync } from "fs";
import { basename, join } from "path";
import { Attachment } from "./entities/attachment.entity";
import { Issue } from "../issues/entities/issue.entity";
import { User } from "../auth/entities/user.entity";
import { RulesEngineService } from "../rules/rules-engine.service";
import { PermissionsService } from "../permissions/permissions.service";
import type { AuthUser } from "../auth/auth-user";
import { loadVisibleIssue } from "../issues/issue-access";
import { UPLOADS_DIR } from "../../lib/uploads-path";

/**
 * Rows still carry the legacy `IssueTrack/backend/uploads/<file>` prefix, so
 * the filename is the only reliable part. Resolution goes through the shared,
 * cwd-independent folder — starting the API from another directory used to
 * turn every download into a 404.
 */
function resolveFilePath(storedPath: string): string {
  const primary = join(UPLOADS_DIR, storedPath);
  if (existsSync(primary)) return primary;
  return join(UPLOADS_DIR, basename(storedPath));
}

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachments: Repository<Attachment>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly rulesEngine: RulesEngineService,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * อัปโหลดขึ้นงาน — **เช็คขอบเขตของงานก่อน** (`issue-access.ts`): ผู้ไม่เกี่ยว
   * (ไม่ใช่ผู้รับผิดชอบ/ผู้แจ้ง และไม่มี `issue.all.view`) ได้ 404 ทั้งอ่านและเขียน
   * (เดิมใครก็ attach ลงงานใครก็ได้ด้วย `issue.create` = write-IDOR)
   */
  async upload(
    issueId: number,
    file: { originalname: string; path: string; filename: string; mimetype: string; size: number },
    uploadedBy: number,
    user: AuthUser,
  ) {
    const issue = await loadVisibleIssue(this.issues, this.permissions, issueId, user);
    const attachment = await this.attachments.save(
      this.attachments.create({
        issueId,
        uploadedBy,
        fileName: file.originalname,
        filePath: join("IssueTrack", "backend", "uploads", file.filename),
        fileType: file.mimetype,
        fileSize: file.size,
      }),
    );
    // automation rules — file name + card status context
    const uploader = await this.users.findOne({ where: { id: uploadedBy }, relations: ["role"] });
    await this.rulesEngine.evaluate("attachment.created", {
      issueId,
      toStatusId: issue.statusId ?? null,
      filename: file.originalname,
      actorId: uploadedBy,
      actorRole: uploader?.role?.name ?? null,
    });
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      fileType: attachment.fileType,
      fileSize: attachment.fileSize,
    };
  }

  /** รายการไฟล์แนบของงาน — เช็คขอบเขตงานก่อน (ดู `upload`) */
  async findByIssue(issueId: number, user: AuthUser) {
    await loadVisibleIssue(this.issues, this.permissions, issueId, user);
    return this.attachments.find({
      where: { issueId },
      order: { id: "ASC" },
    });
  }

  /**
   * ไฟล์แนบรายตัว — แนบกับงานไหนก็เช็คขอบเขต**ของงานนั้น** (`user` ที่ส่งมา
   * คือ caller ของเส้นอ่าน; การลบ `remove` ยังไม่ส่ง user = ไม่เช็ค —
   * กันด้วย `issue.all.update` ซึ่งเป็นสิทธิ์สตาฟฟ์คนละชุด)
   */
  async findOne(id: number, user?: AuthUser) {
    const attachment = await this.attachments.findOne({ where: { id } });
    if (!attachment) {
      throw new NotFoundException(`Attachment ${id} not found`);
    }
    if (user) {
      await loadVisibleIssue(this.issues, this.permissions, attachment.issueId, user);
    }
    return attachment;
  }

  async download(id: number, res: Response, user: AuthUser) {
    const attachment = await this.findOne(id, user);
    const fullPath = resolveFilePath(attachment.filePath);
    if (!existsSync(fullPath)) {
      throw new NotFoundException(`File not found on disk`);
    }
    // file_type historically came back space-padded from a char(100) column;
    // a padded MIME type breaks the preview dialog's blob, so normalize it
    const mimeType = attachment.fileType?.trim() || "application/octet-stream";
    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
    );
    const stream = createReadStream(fullPath);
    /**
     * **จับ error ของ stream** — ไฟล์ถูกลบ/ย้ายไประหว่าง `existsSync` กับ
     * `open` (race กับการลบ attachment) จะยิง `error` บน stream และไม่มี
     * listener = **unhandled error ที่ทำให้ process ค้าง/พัง** · ตอบ 404
     * แล้วปิด response (ถ้าหัวส่งไปแล้ว = ตัด response กึ่งกลาง — ลูกค้า
     * เห็น download ล้มเหลว ซึ่งเป็นจริงตามสภาพไฟล์ที่หายไป)
     */
    stream.on("error", (err) => {
      if (!res.headersSent) {
        res.status(404).json({ message: "File not found on disk" });
      } else {
        res.destroy(err);
      }
    });
    stream.pipe(res);
  }

  async remove(id: number) {
    const attachment = await this.findOne(id);
    const fullPath = resolveFilePath(attachment.filePath);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
    await this.attachments.remove(attachment);
    return { deleted: true };
  }
}
