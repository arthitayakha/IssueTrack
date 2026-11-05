import { Module } from "@nestjs/common";
import { SystemsController } from "./systems.controller";
import { AppsModule } from "../apps/apps.module";

/** AppsModule exports AppsService — `GET /systems` is a thin guarded read. */
@Module({
  imports: [AppsModule],
  controllers: [SystemsController],
})
export class SystemsModule {}
