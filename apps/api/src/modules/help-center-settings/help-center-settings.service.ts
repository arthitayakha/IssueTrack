import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
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
const MAX_COMPANIES = 50;
const MAX_CONTACTS_PER_COMPANY = 50;

/**
 * ตรวจและจัดรูป mapping ก่อนเซฟ/ก่อนอ่าน — คืน object ใหม่เสมอ (ไม่แตะ input)
 * key ที่ไม่ใช่ id ตัวเลขบวกหรือ value ที่ไม่ใช่ array ถูกข้าม; array ว่างก็เก็บไว้
 * (บริษัทนั้นมี config แต่ไม่มีผู้ติดต่อ → ป๊อปอัพโชว์ข้อความว่าง)
 */
function normaliseMapping(value: unknown): Record<string, number[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number[]> = {};
  for (const [key, ids] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(key) || Number(key) < 1 || !Array.isArray(ids)) continue;
    const clean = [
      ...new Set(
        ids.filter(
          (id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0,
        ),
      ),
    ].slice(0, MAX_CONTACTS_PER_COMPANY);
    out[key] = clean;
  }
  return Object.fromEntries(Object.entries(out).slice(0, MAX_COMPANIES));
}

@Injectable()
export class HelpCenterSettingsService {
  private readonly logger = new Logger(HelpCenterSettingsService.name);

  constructor(
    @InjectRepository(HelpCenterSettings)
    private readonly repo: Repository<HelpCenterSettings>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * รายชื่อที่ลูกค้าเห็นจริง · `companyId` มาจาก JWT (`AuthUser.companyId`)
   * มีเฉพาะ mapping ของบริษัทนั้น — **ไม่มี global fallback / ไม่มีข้อมูลกลาง**
   * บริษัทที่ยังไม่ได้กำหนด → `contacts: []` → ป๊อปอัพโชว์ข้อความ "ยังไม่มีข้อมูลติดต่อ"
   */
  async get(companyId: number | null = null) {
    const row = await this.repo.findOne({ where: { id: 1 } });
    const mapping = normaliseMapping(row?.contactUsersByCompany);
    const key = companyId == null ? null : String(companyId);
    const contactIds = key === null ? [] : (mapping[key] ?? []);
    return {
      id: row?.id ?? 1,
      contacts: await this.resolveContacts(contactIds),
      updatedAt: row?.updatedAt ?? null,
    };
  }

  /** config ดิบสำหรับ dialog "จัดการผู้ติดต่อ" (แอดมินเท่านั้น) */
  async config() {
    const row = await this.repo.findOne({ where: { id: 1 } });
    return {
      id: row?.id ?? 1,
      contactUsersByCompany: normaliseMapping(row?.contactUsersByCompany),
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

  async update(dto: UpdateHelpCenterSettingsDto) {
    let row = await this.repo.findOne({ where: { id: 1 } });
    if (!row) row = this.repo.create({ id: 1 });
    if (dto.contactUsersByCompany !== undefined) {
      const raw = dto.contactUsersByCompany;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new BadRequestException("contactUsersByCompany ต้องเป็น object");
      }
      if (Object.keys(raw).length > MAX_COMPANIES) {
        throw new BadRequestException(`กำหนดได้ไม่เกิน ${MAX_COMPANIES} บริษัท`);
      }
      for (const [key, ids] of Object.entries(raw)) {
        if (!/^\d+$/.test(key) || Number(key) < 1) {
          throw new BadRequestException(`company id ไม่ถูกต้อง: ${key}`);
        }
        if (!Array.isArray(ids) || ids.length > MAX_CONTACTS_PER_COMPANY) {
          throw new BadRequestException(`รายชื่อผู้ติดต่อของบริษัท ${key} ไม่ถูกต้อง`);
        }
        if (ids.some((id) => !Number.isInteger(id) || (id as number) < 1)) {
          throw new BadRequestException(`user id ในบริษัท ${key} ไม่ถูกต้อง`);
        }
      }
      row.contactUsersByCompany = normaliseMapping(raw);
    }
    await this.repo.save(row);
    return this.config();
  }
}
