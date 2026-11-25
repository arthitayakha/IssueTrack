import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Attachment } from "./entities/attachment.entity";
import { Issue } from "../issues/entities/issue.entity";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [TypeOrmModule.forFeature([Attachment, Issue]), PermissionsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
