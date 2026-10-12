import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Attachment } from "./entities/attachment.entity";
import { Issue } from "../issues/entities/issue.entity";

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachments: Repository<Attachment>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
  ) {}

  async upload(
    issueId: number,
    file: { originalname: string; path: string; mimetype: string; size: number },
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
        filePath: file.path,
        fileType: file.mimetype,
        fileSize: file.size,
      }),
    );
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

  async remove(id: number) {
    const attachment = await this.findOne(id);
    await this.attachments.remove(attachment);
    return { deleted: true };
  }
}
