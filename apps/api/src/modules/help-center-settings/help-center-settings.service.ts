import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { AppCompany } from "../apps/entities/app-company.entity";
import { User } from "../auth/entities/user.entity";
import { HelpCenterSettings } from "./entities/help-center-settings.entity";
import type { UpdateHelpCenterSettingsDto } from "./dto/help-center-settings.dto";

/** รูปแบบเดียวกับ `ContractContact` ฝั่ง notifications (ใช้ได้ทั้งการ์ด/ตัวเลือก) */
export interface ProgrammerContact {
  userId: number;
  name: string;
  email: string | null;
  phone: string | null;
}

/** เพดานกันคนส่ง mapping มาใหญ่เกิน */
const MAX_OWNERS = 50;
const MAX_CONTACTS_PER_OWNER = 50;

/** key บริษัท = `company_id` · key แอป = `app_id:company_id` (แอปเดียวผูกหลายบริษัทได้) */
const validCompanyKey = (key: string) => /^\d+$/.test(key) && Number(key) > 0;
const validAppKey = (key: string) =>
  /^\d+:\d+$/.test(key) && key.split(":").every((part) => Number(part) > 0);

export const appContactKey = (appId: number, companyId: number) => `${appId}:${companyId}`;

/**
 * ตรวจและจัดรูป mapping ก่อนเซฟ/ก่อนอ่าน — คืน object ใหม่เสมอ (ไม่แตะ input)
 * key ที่ไม่ตรงรูปที่กำหนดหรือ value ที่ไม่ใช่ array ถูกข้าม; array ว่างก็เก็บไว้
 * (เจ้าของนั้นมี config แต่ไม่มีผู้ติดต่อ → ป๊อปอัพโชว์ข้อความว่าง)
 */
function normaliseMapping(
  value: unknown,
  validKey: (key: string) => boolean,
): Record<string, number[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number[]> = {};
  for (const [key, ids] of Object.entries(value as Record<string, unknown>)) {
    if (!validKey(key) || !Array.isArray(ids)) continue;
    const clean = [
      ...new Set(
        ids.filter(
          (id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0,
        ),
      ),
    ].slice(0, MAX_CONTACTS_PER_OWNER);
    out[key] = clean;
  }
  return Object.fromEntries(Object.entries(out).slice(0, MAX_OWNERS));
}

@Injectable()
export class HelpCenterSettingsService {
  private readonly logger = new Logger(HelpCenterSettingsService.name);

  constructor(
    @InjectRepository(HelpCenterSettings)
    private readonly repo: Repository<HelpCenterSettings>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(AppCompany)
    private readonly appCompanies: Repository<AppCompany>,
  ) {}

  /**
   * รายชื่อที่ลูกค้าเห็นจริง · `companyId` มาจาก JWT (`AuthUser.companyId`)
   *
   * 2 ชั้น: ถ้าส่ง `appId` **และแอปนั้นผูกกับบริษัทของคนเรียก** (`app_companies`)
   * → ใช้ map รายแอปด้วย key `appId:companyId` · **ไม่มี key = ตกมาคนระดับบริษัท**
   * (fallback) แต่ array ว่าง = ตั้งใจไม่มีคนสำหรับคู่นั้น · ไม่มี/ตรวจแอปไม่ได้
   * = ค่าบริษัท (fail-closed: ลูกค้าชี้ appId ของบริษัทอื่นก็ไม่เห็นรายชื่อของบริษัทนั้น)
   */
  async get(companyId: number | null = null, appId: number | null = null) {
    const row = await this.repo.findOne({ where: { id: 1 } });
    const byCompany = normaliseMapping(row?.contactUsersByCompany, validCompanyKey);
    const byApp = normaliseMapping(row?.contactUsersByApp, validAppKey);
    let contactIds = companyId == null ? [] : (byCompany[String(companyId)] ?? []);

    if (appId != null && companyId != null) {
      try {
        const link = await this.appCompanies.findOne({ where: { appId, companyId } });
        const key = appContactKey(appId, companyId);
        if (link && Object.prototype.hasOwnProperty.call(byApp, key)) {
          contactIds = byApp[key];
        }
      } catch (error) {
        this.logger.warn(`could not verify app contact scope: ${(error as Error).message}`);
      }
    }

    return {
      id: row?.id ?? 1,
      contacts: await this.resolveContacts(contactIds),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /** config ดิบสำหรับ dialog "จัดการผู้ติดต่อ" (แอดมินเท่านั้น) — ทั้ง 2 ชั้น */
  async config() {
    const row = await this.repo.findOne({ where: { id: 1 } });
    return {
      id: row?.id ?? 1,
      contactUsersByCompany: normaliseMapping(row?.contactUsersByCompany, validCompanyKey),
      contactUsersByApp: normaliseMapping(row?.contactUsersByApp, validAppKey),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /** ตัวเลือกใน dialog "จัดการผู้ติดต่อ" — เฉพาะโปรแกรมเมอร์ที่ active */
  async programmers(): Promise<ProgrammerContact[]> {
    try {
      const rows = await this.users.find({
        where: { isActive: true, role: { name: "programmer" } },
        relations: ["role"],
        order: { id: "ASC" },
      });
      return rows.map((u) => ({
        userId: u.id,
        name: u.name,
        email: u.email ?? null,
        phone: u.phone ?? null,
      }));
    } catch (error) {
      this.logger.warn(`could not load programmer contacts: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * resolve id ที่เลือก → ข้อมูลติดต่อจริง · ตัดคนที่ถูกปิด/ลบ/เปลี่ยน role ออก
   * (ไม่ลบ id ออกจาก config — ถ้าเปิดใช้งานอีกครั้งจะกลับมาโชว์เอง)
   */
  private async resolveContacts(ids: number[]): Promise<ProgrammerContact[]> {
    if (!ids.length) return [];
    try {
      const rows = await this.users.find({
        where: { id: In(ids), isActive: true, role: { name: "programmer" } },
        relations: ["role"],
        order: { id: "ASC" },
      });
      const byId = new Map(rows.map((u) => [u.id, u]));
      // คงลำดับที่แอดมินเลือก (ไม่ใช่ลำดับ id ใน DB)
      return ids.flatMap((id) => {
        const u = byId.get(id);
        return u
          ? [{ userId: u.id, name: u.name, email: u.email ?? null, phone: u.phone ?? null }]
          : [];
      });
    } catch (error) {
      this.logger.warn(`could not resolve contact users: ${(error as Error).message}`);
      return [];
    }
  }

  /** ตรวจ mapping ก่อนเซฟ — key ต้องตรงรูป (บริษัท = id, แอป = appId:companyId) */
  private validateMapping(
    raw: unknown,
    label: string,
    validKey: (key: string) => boolean,
  ): Record<string, number[]> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new BadRequestException(`${label} ต้องเป็น object`);
    }
    if (Object.keys(raw).length > MAX_OWNERS) {
      throw new BadRequestException(`กำหนดได้ไม่เกิน ${MAX_OWNERS} รายการ`);
    }
    for (const [key, ids] of Object.entries(raw)) {
      if (!validKey(key)) {
        throw new BadRequestException(`id ไม่ถูกต้อง: ${key}`);
      }
      if (!Array.isArray(ids) || ids.length > MAX_CONTACTS_PER_OWNER) {
        throw new BadRequestException(`รายชื่อผู้ติดต่อของ ${key} ไม่ถูกต้อง`);
      }
      if (ids.some((id) => !Number.isInteger(id) || (id as number) < 1)) {
        throw new BadRequestException(`user id ใน ${key} ไม่ถูกต้อง`);
      }
    }
    return normaliseMapping(raw, validKey);
  }

  async update(dto: UpdateHelpCenterSettingsDto) {
    let row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) row = this.repo.create({ id: 1 });
    if (dto.contactUsersByCompany !== undefined) {
      row.contactUsersByCompany = this.validateMapping(
        dto.contactUsersByCompany,
        "contactUsersByCompany",
        validCompanyKey,
      );
    }
    if (dto.contactUsersByApp !== undefined) {
      row.contactUsersByApp = this.validateMapping(
        dto.contactUsersByApp,
        "contactUsersByApp",
        validAppKey,
      );
    }
    await this.repo.save(row);
    return this.config();
  }
}
