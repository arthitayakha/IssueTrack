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
import { IsActiveDto } from "../../common/dto/is-active.dto";
import { LabelsService } from "./labels.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Permissions } from "../auth/permissions.decorator";
import { Public } from "../auth/public.decorator";

@Controller("labels")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  /**
   * ⚠️ เส้นนี้เป็น `@Public()` **โดยเจตตนา** (AGENTS.md: อ่านได้แม้ไม่มี token)
   * — `RolesGuard` เช็ค `@Public` ก่อนอ่าน `@Permissions` (`roles.guard.ts`)
   * ดังนั้น `@Permissions("label.view")` เดิมที่เคยแปะตรงนี้เป็น **decorator
   * ตาย**: ดูเหมือนถูกกันแต่ไม่ได้กันอะไร → เอาออก กันคนเข้าใจผิดว่าปลอดภัย
   */
  @Public()
  @Get()
  findAll(@Query() query: { page?: string; limit?: string }) {
    return this.labels.findAll(normalizePagination(query));
  }

  @Post()
  @Permissions("label.create")
  create(@Body() body: { name: string; color: string }) {
    return this.labels.create(body.name, body.color);
  }

  @Patch(":id")
  @Permissions("label.update")
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { name?: string; color?: string },
  ) {
    return this.labels.update(id, body);
  }

  @Patch(":id/active")
  @Permissions("label.update")
  updateActive(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: IsActiveDto,
  ) {
    return this.labels.updateActive(id, body.isActive);
  }

  @Get(":id/check")
  @Permissions("label.delete")
  check(@Param("id", ParseIntPipe) id: number) {
    return this.labels.check(id);
  }

  @Delete(":id")
  @Permissions("label.delete")
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.labels.remove(id);
  }
}
