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

function resolveFilePath(storedPath: string): string {
  const cwd = process.cwd();
  const primary = join(cwd, storedPath);
  if (existsSync(primary)) return primary;
  return join(cwd, "uploads", basename(storedPath));
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
  ) {}

  async upload(
    issueId: number,
    file: { originalname: string; path: string; filename: string; mimetype: string; size: number },
    uploadedBy: number,
  ) {
    const issue = await this.issues.findOne({ where: { id: issueId } });
    if (!issue) {
      throw new NotFoundException(`Issue ${issueId} not found`);
    }
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

  async findByIssue(issueId: number) {
    return this.attachments.find({
      where: { issueId },
      order: { id: "ASC" },
    });
  }

  async findOne(id: number) {
    const attachment = await this.attachments.findOne({ where: { id } });
    if (!attachment) {
      throw new NotFoundException(`Attachment ${id} not found`);
    }
    return attachment;
  }

  async download(id: number, res: Response) {
    const attachment = await this.findOne(id);
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
