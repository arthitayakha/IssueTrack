import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Attachment } from "./entities/attachment.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Attachment])],
  controllers: [],
  providers: [],
})
export class AttachmentsModule {}
