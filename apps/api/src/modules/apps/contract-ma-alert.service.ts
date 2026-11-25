import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, IsNull, Repository } from "typeorm";
import { AppCompany } from "./entities/app-company.entity";
import { App } from "./entities/app.entity";
import { Company } from "../companies/entities/company.entity";
import { Notification } from "../notifications/entities/notification.entity";
import { NotificationsService } from "../notifications/notifications.service";
import { MaUsageService } from "./ma-usage.service";
import { daysBetween, toIsoDate, todayIso } from "../../common/dates";

/** แจ้งเฉพาะ 7 วันสุดท้ายของสัญญา */
export const CONTRACT_MA_ALERT_DAYS = 7;
/** วันเว้นวัน → เหลือ 7, 5, 3, 1 วัน */
export const CONTRACT_MA_ALERT_ACTION = "contract_ma_remaining";

/**
 * กระดิ่ง "สัญญาใกล้หมดแต่ MA ยังเหลือ" — 09:00 ทุกวัน (Asia/Bangkok)
 * เฉพาะคู่ที่เหลือ 1–7 วัน **และวันที่เป็นเลขคี่** (7/5/3/1) จึงโชว์วันเว้นวัน
 * โดยไม่ต้องเก็บ latch เพิ่ม: กติกาขึ้นกับปฏิทินอย่างเดียว เซิร์ฟเวอร์หลุดไปวัน
 * หนึ่งก็จะเงียบวันนั้นแล้วกลับมาในวันถัดไปที่ตรงกติกา (fail-open)
 *
 * ตัวเลข "คงเหลือ" มาจาก `MaUsageService.usageCounts()` ของ**รอบล่าสุดของคู่**
 * ชุดเดียวกับที่ `/systems` โชว์ — ถ้าดึงใช้ไปไม่ได้ หรือ MA ไม่เหลือแล้ว → ไม่แจ้ง
 * (ไม่เดาตัวเลขให้ลูกค้า) · คู่ที่แอดมินยกเลิกสัญญา (`cancelled_at`) ถูกข้าม
 *
 * กันซ้ำด้วยการนับแถว `contract_ma_remaining` ของคู่นั้นในวันเดียวกัน — cron
 * ที่ restart ซ้ำตอน 09:00 จะไม่ยิงสองรอบ · ทุกขั้นห่อ try/catch เพราะ sweep
 * ต้องไม่ทำให้ API ล้ม (สัญญาเดิมของ `AppExpiryService`)
 */
@Injectable()
export class ContractMaAlertService {
  private readonly logger = new Logger(ContractMaAlertService.name);

  constructor(
    @InjectRepository(AppCompany)
    private readonly links: Repository<AppCompany>,
    @InjectRepository(App)
    private readonly apps: Repository<App>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(Notification)
    private readonly notices: Repository<Notification>,
    private readonly maUsage: MaUsageService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron("0 9 * * *", { name: "contract-ma-alert-sweep", timeZone: "Asia/Bangkok" })
  async sweep(): Promise<void> {
    try {
      const links = await this.links.find({ where: { cancelledAt: IsNull() } });
      if (links.length === 0) return;

      // 1 คู่มีได้หลายช่วง (append ตอนต่ออายุ/ซื้อชม.) — ดูแค่แถวล่าสุด
      const latestByPair = new Map<string, AppCompany>();
      for (const link of links) {
        const key = `${link.appId}:${link.companyId}`;
        const prev = latestByPair.get(key);
        if (!prev || link.id > prev.id) latestByPair.set(key, link);
      }

      const today = todayIso();
      const due: Array<{ link: AppCompany; daysLeft: number }> = [];
      for (const link of latestByPair.values()) {
        if (!link.expiresAt || link.maHours == null) continue;
        const left = daysBetween(today, toIsoDate(link.expiresAt));
        if (left >= 1 && left <= CONTRACT_MA_ALERT_DAYS && left % 2 === 1) {
          due.push({ link, daysLeft: left });
        }
      }
      if (due.length === 0) return;

      const counts = await this.maUsage
        .usageCounts(due.map((entry) => entry.link.id))
        .catch((error) => {
          this.logger.warn(`MA usage lookup failed: ${(error as Error).message}`);
          return [];
        });
      const usedByRecord = new Map(counts.map((c) => [c.recordId, c.periodUsedHours]));

      const [apps, companies] = await Promise.all([this.apps.find(), this.companies.find()]);
      const appName = new Map(apps.map((a) => [a.id, a.name]));
      const companyName = new Map(companies.map((c) => [c.id, c.name]));

      const dayStart = new Date(`${today}T00:00:00+07:00`);
      const dayEnd = new Date(`${today}T23:59:59+07:00`);

      for (const { link, daysLeft } of due) {
        const used = usedByRecord.get(link.id);
        if (used == null || !Number.isFinite(used)) continue;
        const remaining = Math.round(((link.maHours ?? 0) - used) * 10) / 10;
        if (remaining <= 0) continue;

        const already = await this.notices.count({
          where: {
            type: CONTRACT_MA_ALERT_ACTION,
            appId: link.appId,
            companyId: link.companyId,
            createdAt: Between(dayStart, dayEnd),
          },
        });
        if (already > 0) continue;

        await this.notifications.notifyContractMaRemaining({
          companyId: link.companyId,
          appId: link.appId,
          appName: appName.get(link.appId) ?? "",
          companyName: companyName.get(link.companyId) ?? "",
          daysLeft,
          remainingHours: remaining,
        });
      }
    } catch (error) {
      this.logger.warn(`contract MA alert sweep failed: ${(error as Error).message}`);
    }
  }
}
