import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  ActivityLogListController,
  ActivityLogsController,
} from "./activity-logs.controller";
import { ActivityLogsService } from "./activity-logs.service";
import { ActivityLogInterceptor } from "./activity-log.interceptor";
import { ActivityLog } from "./entities/activity-log.entity";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [TypeOrmModule.forFeature([ActivityLog]), PermissionsModule],
  controllers: [ActivityLogsController, ActivityLogListController],
  providers: [
    ActivityLogsService,
    // ตาข่ายบันทึกทุกการกระทำ — ลงทะเบียนที่นี่ (module ที่มี repository
    // อยู่แล้ว) แต่**มีผลกับทั้งแอป**: APP_* token ใน module ใดก็ตาม = global
    // จึงไม่ต้องแตะ AppModule และไม่ต้อง register route ทีละ endpoint
    { provide: APP_INTERCEPTOR, useClass: ActivityLogInterceptor },
  ],
  exports: [ActivityLogsService],
})
export class ActivityLogsModule {}
