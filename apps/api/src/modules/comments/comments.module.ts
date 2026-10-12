import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Comment } from "./entities/comment.entity";
import { CommentsController } from "./comments.controller";
import { CommentsService } from "./comments.service";
import { ActivityLog } from "../activity-logs/entities/activity-log.entity";

@Module({
  imports: [TypeOrmModule.forFeature([Comment, ActivityLog])],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
