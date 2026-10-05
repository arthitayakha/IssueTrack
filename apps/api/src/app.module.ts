import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./modules/auth/auth.module";
import { PermissionsModule } from "./modules/permissions/permissions.module";
import { BoardsModule } from "./modules/boards/boards.module";
import { ColumnsModule } from "./modules/columns/columns.module";
import { IssuesModule } from "./modules/issues/issues.module";
import { CommentsModule } from "./modules/comments/comments.module";
import { LabelsModule } from "./modules/labels/labels.module";
import { UsersModule } from "./modules/users/users.module";
import { RolesModule } from "./modules/roles/roles.module";
import { PositionsModule } from "./modules/positions/positions.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { AttachmentsModule } from "./modules/attachments/attachments.module";
import { IssueStatusesModule } from "./modules/issue-statuses/issue-statuses.module";
import { IssuePrioritiesModule } from "./modules/issue-priorities/issue-priorities.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { WorkSessionsModule } from "./modules/work-sessions/work-sessions.module";
import { ActivityLogsModule } from "./modules/activity-logs/activity-logs.module";
import { JwtAuthGuard } from "./modules/auth/jwt-auth.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST ?? "localhost",
      port: parseInt(process.env.DB_PORT ?? "5432"),
      username: process.env.DB_USER ?? "postgres",
      password: process.env.DB_PASSWORD ?? "1234",
      database: process.env.DB_NAME ?? "trackdb",
      autoLoadEntities: true,
      synchronize: false,
    }),
    AuthModule,
    PermissionsModule,
    BoardsModule,
    ColumnsModule,
    IssuesModule,
    CommentsModule,
    LabelsModule,
    UsersModule,
    RolesModule,
    PositionsModule,
    CategoriesModule,
    AttachmentsModule,
    IssueStatusesModule,
    IssuePrioritiesModule,
    NotificationsModule,
    WorkSessionsModule,
    ActivityLogsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
