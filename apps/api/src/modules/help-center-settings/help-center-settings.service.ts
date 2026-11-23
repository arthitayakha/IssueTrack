import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { HelpCenterSettings } from "./entities/help-center-settings.entity";
import type { UpdateHelpCenterSettingsDto } from "./dto/help-center-settings.dto";

const DEFAULT_SETTINGS = {
  id: 1,
  supportEmail: "support@issuetrack.com",
  supportPhone: "02-123-4567",
  workingHours: "จันทร์ - ศุกร์ 09:00 - 18:00 น.",
};

@Injectable()
export class HelpCenterSettingsService {
  constructor(
    @InjectRepository(HelpCenterSettings)
    private readonly repo: Repository<HelpCenterSettings>,
  ) {}

  /** fail-open: ไม่มีแถว (DB ยังไม่รัน migration) → ค่าเริ่มต้นตาม UI อยู่แล้ว */
  async get() {
    const row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) return { ...DEFAULT_SETTINGS, updatedAt: null };
    return {
      id: row.id,
      supportEmail: row.supportEmail ?? "",
      supportPhone: row.supportPhone ?? "",
      workingHours: row.workingHours ?? "",
      updatedAt: row.updatedAt,
    };
  }

  async update(dto: UpdateHelpCenterSettingsDto) {
    let row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) row = this.repo.create({ id: 1 });
    if (dto.supportEmail !== undefined) row.supportEmail = dto.supportEmail.trim() || null;
    if (dto.supportPhone !== undefined) row.supportPhone = dto.supportPhone.trim() || null;
    if (dto.workingHours !== undefined) row.workingHours = dto.workingHours.trim() || null;
    await this.repo.save(row);
    return this.get();
  }
}
