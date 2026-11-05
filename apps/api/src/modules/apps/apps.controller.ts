import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { normalizePagination } from "../../common/pagination";
import { AppsService, AppCompanyInput } from "./apps.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";

@Controller("apps")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppsController {
  constructor(private readonly apps: AppsService) {}

  // No @Permissions on purpose: any authenticated user (customers included)
  // must be able to load the app list when reporting an issue. The rows now
  // also carry company names + expiry — both are master data the board shows.
  @Get()
  findAll(@Query() query: { page?: string; limit?: string }) {
    return this.apps.findAll(normalizePagination(query));
  }

  // The CRUD below serves TWO surfaces with separate permission cards:
  // the apps tab in `/master-data` (`app.*`) and the `/systems` page
  // (`system.*`). Same endpoint, either permission opens it (guard is OR).
  @Post()
  @Permissions("app.create", "system.create")
  create(
    @Body()
    body: {
      name: string;
      /** ตารางย่อยในฟอร์ม — 1 แถวต่อบริษัท พร้อมวันที่ + ชั่วโมง MA ของคู่นั้น */
      companies: AppCompanyInput[];
    },
  ) {
    return this.apps.create(body);
  }

  @Patch(":id")
  @Permissions("app.update", "system.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      /** `undefined` = คงคู่เดิมไว้ · ส่ง array ว่าง = 400 (ต้องมีอย่างน้อย 1 บริษัท) */
      companies?: AppCompanyInput[];
    },
  ) {
    return this.apps.update(id, body);
  }

  @Patch(":id/active")
  @Permissions("app.update", "system.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { isActive: boolean },
  ) {
    return this.apps.updateActive(id, body.isActive);
  }

  @Get(":id/check")
  @Permissions("app.delete", "system.delete")
  check(@Param("id", ParseIntPipe) id: number) {
    return this.apps.check(id);
  }

  @Delete(":id")
  @Permissions("app.delete", "system.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.apps.remove(id);
  }
}
