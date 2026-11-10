import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AppCompany } from "./entities/app-company.entity";
import { App } from "./entities/app.entity";
import { Company } from "../companies/entities/company.entity";
import { Issue } from "../issues/entities/issue.entity";
import { User } from "../auth/entities/user.entity";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * ประเภทงานที่**หักจาก MA** — ตรงกับฝั่งรายงาน (`GET /reports/usage` ที่หน้าเว็บ
 * ส่ง `taskTypes=feature,requirement` มาเอง) · `bug` กับ `NULL` (ยังไม่ระบุ) ไม่หัก
 */
const DEDUCTED_TASK_TYPES = ["feature", "requirement"] as const;

/**
 * **ตรวจว่าชั่วโมง MA ของคู่หมดแล้วหรือยัง** — เรียกหลังกรอกเวลาจริง
 * (`IssuesService.setActualFixDuration`) แบบ fire-and-forget
 *
 * สูตรใช้ไป = SUM(`issues.actual_fix_duration`) ของงานแอปนั้นซึ่ง
 * **ผู้แจ้งอยู่บริษัทคู่นั้น** (`customer_id` → `users.company_id`) และ
 * `task_type IN ('feature','requirement')` — **ตรงกับ `usageByPair()` ของ
 * `/reports/usage` ทุกประการ** (รวมการทิ้งงานที่จับคู่ไม่ได้และงานถังขยะ)
 * เพื่อให้ "หมด" ที่นี่กับ "คงเหลือ ≤ 0" บนตาราง `/systems` เป็นเลขเดียวกัน
 *
 * **Fail-open ทุกขั้น** (ไม่มีแอป/ไม่มีผู้แจ้ง/ผู้แจ้งไม่มีบริษัท/ไม่มีแถว
 * คู่/ยังไม่กรอก MA → หยุดเงียบ ๆ) · **ครั้งเดียวต่อรอบ**: แจ้งแล้ว stamp
 * `ma_notified_at` ที่แถวล่าสุดของคู่; กลับมาไม่หมด (งานถูกย้ายเป็นบั๊ก /
 * แก้ MA ให้มากขึ้น) → ล้าง latch เพื่อให้รอบถัดไปแจ้งใหม่ได้ ·
 * ต่ออายุ/ซื้อชั่วโมงไม่ต้องแตะ — แถบที่ append ใหม่ได้ `NULL` อยู่แล้ว
 *
 * **ไม่เคย throw** — ทุกอย่างห่อ try/catch + logger เพราะคอลเลกชันนี้วิ่ง
 * หลัง `save()` แล้ว การกรอกเวลาต้องไม่พังเพราะการแจ้งเตือน
 */
@Injectable()
export class MaUsageService {
  private readonly logger = new Logger(MaUsageService.name);

  constructor(
    @InjectRepository(AppCompany)
    private readonly links: Repository<AppCompany>,
    @InjectRepository(App)
    private readonly apps: Repository<App>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  /** จุดเรียกจาก `setActualFixDuration` — ไม่รอผล ไม่ throw (ดู docblock) */
  async checkAndNotify(issue: Issue): Promise<void> {
    try {
      // ---- fail-open: จับคู่ไม่ได้ = ไม่หักที่ไหน จึงไม่มีอะไรให้แจ้ง ----
      if (!issue.appId) return;
      const reporterId = issue.customerId;
      if (!reporterId) return;
      const reporter = await this.users.findOne({ where: { id: reporterId } });
      const companyId = reporter?.companyId ?? null;
      if (companyId == null) return;

      // แถวล่าสุดของคู่ = แถบที่ `/systems` โชว์ (`id DESC` เหมือน `rows` memo)
      const [link] = await this.links.find({
        where: { appId: issue.appId, companyId },
        order: { id: "DESC" },
        take: 1,
      });
      if (!link || link.maHours == null) return;

      const usedSeconds = await this.usedSeconds(issue.appId, companyId);
      const depleted = usedSeconds >= link.maHours * 3600;
      const alreadyRung = link.maNotifiedAt != null;

      if (!depleted) {
        // ชั่วโมงกลับมา (งานย้ายเป็นบั๊ก / MA ถูกแก้ให้มากขึ้น) → เปิดรอบใหม่
        if (alreadyRung) {
          await this.links.update({ id: link.id }, { maNotifiedAt: null });
        }
        return;
      }
      if (alreadyRung) return; // ครั้งเดียวต่อรอบ — เงียบจนกว่าจะมีชั่วโมงใหม่

      // stamp ก่อนแจ้ง: `notify()` ไม่เคย throw แต่กัน case พังกลางคัน
      // ไม่ให้ยิงซ้ำทุกครั้งที่กรอกเวลา ( spam หนักกว่าแจ้งพลาด 1 ครั้ง)
      await this.links.update({ id: link.id }, { maNotifiedAt: new Date() });

      const [app, company] = await Promise.all([
        this.apps.findOne({ where: { id: issue.appId } }),
        this.companies.findOne({ where: { id: companyId } }),
      ]);
      await this.notifications.notifyMaDepleted({
        companyId,
        appName: app?.name ?? "",
        companyName: company?.name ?? "",
        maHours: link.maHours,
        usedHours: usedSeconds / 3600,
      });
    } catch (error) {
      this.logger.warn(`ma depletion check failed: ${(error as Error).message}`);
    }
  }

  /**
   * "ใช้ไป" ของคู่ แอป×บริษัท (วินาที) — **สูตรเดียวกับ `usageByPair()`**:
   * กรองงานถังขยะ + `task_type` ที่หัก + ผู้แจ้งอยู่บริษัทนั้น · งานที่จับคู่
   * ไม่ได้ (ผู้แจ้งไม่มีบริษัท) หลุดจาก JOIN เอง = ไม่ถูกหัก (ตรงกติกา)
   */
  private async usedSeconds(appId: number, companyId: number): Promise<number> {
    const raw = await this.issues
      .createQueryBuilder("issue")
      .leftJoin("issue.customer", "reporter")
      .where("issue.app_id = :appId", { appId })
      .andWhere("issue.deleted_at IS NULL")
      .andWhere("issue.task_type IN (:...types)", { types: [...DEDUCTED_TASK_TYPES] })
      .andWhere("reporter.company_id = :companyId", { companyId })
      .select("COALESCE(SUM(issue.actual_fix_duration), 0)", "seconds")
      .getRawOne<{ seconds: string }>();
    return Number(raw?.seconds ?? 0);
  }
}
