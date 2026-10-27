import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Attachment } from "./entities/attachment.entity";
import { Issue } from "../issues/entities/issue.entity";
import { User } from "../auth/entities/user.entity";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { PermissionsModule } from "../permissions/permissions.module";
import { RulesModule } from "../rules/rules.module";

@Module({
  imports: [TypeOrmModule.forFeature([Attachment, Issue, User]), PermissionsModule, RulesModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
