import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { REJECT_STATUS_NAME } from "@kanban/shared";
import { IssueStatus } from "./entities/issue-status.entity";
import { Issue } from "../issues/entities/issue.entity";
import { paginate, PaginationParams } from "../../common/pagination";

@Injectable()
export class IssueStatusesService {
  constructor(
    @InjectRepository(IssueStatus)
    private readonly issueStatuses: Repository<IssueStatus>,
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
  ) {}

  async findAll(params: PaginationParams) {
    const statuses = await this.issueStatuses.find({
      order: { position: "ASC", id: "ASC" },
    });
    const result = await Promise.all(
      statuses.map(async (s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        color: s.color,
        isActive: s.isActive,
        issueCount: await this.issues.count({ where: { statusId: s.id } }),
      })),
    );
    return paginate(result, params);
  }

  async create(data: {
    name: string;
    description?: string;
    color?: string;
  }) {
    const existing = await this.issueStatuses.findOne({ where: { name: data.name } });
    if (existing) {
      throw new ConflictException(`Status "${data.name}" already exists`);
    }
    const maxPosition = await this.issueStatuses
      .createQueryBuilder("s")
      .select("MAX(s.position)", "max")
      .getRawOne();
    const nextPosition = (maxPosition?.max ?? 0) + 1;
    const status = await this.issueStatuses.save(
      this.issueStatuses.create({
        name: data.name,
        description: data.description ?? null,
        // No color chosen → let the column's DB default ("default") apply.
        color: data.color || null,
        isActive: true,
        position: nextPosition,
      }),
    );
    // สถานะใหม่ได้ `MAX(position)+1` = มักจะ "แซง" สถานะยกเลิกไปอยู่หลังสุด
    // เอง → ดัน "ยกเลิก" กลับไปเป็น position มากสุดทันที (ดู pinRejectLast)
    await this.pinRejectLast(this.issueStatuses.manager);
    return {
      id: status.id,
      name: status.name,
      description: status.description,
      color: status.color,
      isActive: status.isActive,
    };
  }

  async update(
    id: number,
    data: {
      name?: string;
      description?: string;
      color?: string;
    },
  ) {
    const status = await this.issueStatuses.findOne({ where: { id } });
    if (!status) {
      throw new NotFoundException(`Status with id ${id} not found`);
    }
    if (data.name !== undefined) {
      const existing = await this.issueStatuses.findOne({ where: { name: data.name } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Status "${data.name}" already exists`);
      }
      status.name = data.name;
    }
    if (data.description !== undefined) status.description = data.description;
    if (data.color !== undefined) status.color = data.color;
    await this.issueStatuses.save(status);
    return {
      id: status.id,
      name: status.name,
      description: status.description,
      color: status.color,
      isActive: status.isActive,
    };
  }

  async updateActive(id: number, isActive: boolean) {
    const status = await this.issueStatuses.findOne({ where: { id } });
    if (!status) {
      throw new NotFoundException(`Status with id ${id} not found`);
    }
    status.isActive = isActive;
    await this.issueStatuses.save(status);
    return { id: status.id, name: status.name, isActive: status.isActive };
  }

  async check(id: number) {
    const status = await this.issueStatuses.findOne({ where: { id } });
    if (!status) {
      throw new NotFoundException(`Status with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { statusId: id } });
    return { canDelete: issueCount === 0, issueCount };
  }

  async reorder(items: Array<{ id: number; sortOrder: number }>) {
    await this.issueStatuses.manager.transaction(async (em) => {
      for (const item of items) {
        await em.update(IssueStatus, item.id, { position: item.sortOrder });
      }
      // ลากเสร็จ = ตรวจซ้ำว่า "ยกเลิก" ยังอยู่ท้ายสุด (payload ที่เอามันไปไว้
      // กลาง list โดนแก้ตรงนี้ — เรียกด้วย em ตัวเดียวกับ transaction)
      await this.pinRejectLast(em);
    });
    return { reordered: items.length };
  }

  /**
   * **สถานะ "ยกเลิก" ต้องอยู่ท้ายสุดเสมอ** (`REJECT_STATUS_NAME` จาก
   * `@kanban/shared` — จุดเดียวกับปุ่ม "ตีกลับงาน" ฝั่งเว็บ และกับ
   * `IssuesService.move()` ที่ยกเว้น move guards เมื่อปลายทางเป็นสถานะนี้)
   *
   * - **ทำไมต้องฝั่งเซิร์ฟเวอร์**: สองที่ที่เขียน `position` คือ `create()`
   *   (`MAX(position)+1` — สถานะใหม่จะแซงไปอยู่หลัง "ยกเลิก" เอง) กับ
   *   `reorder()` (ลูกค้าส่งลำดับอะไรมา ก็เขียนตามนั้น — มีทั้งแท็บสถานะใน
   *   `/master-data` และสาขาลากคอลัมน์ของบอร์ด) ดังนั้นปล่อยให้หน้าเว็บ
   *   ฝั่งเดียวบังคับไม่ได้
   * - **ลากไม่ใช่การนับ index คงที่**: บังคับ "position มากสุดเสมอ" —
   *   เพิ่มสถานะกี่อันก็ได้ (ยี่สิบ/ร้อย) "ยกเลิก" ก็ยังอยู่ท้ายสุด และ
   *   `reorder` ที่ส่งมาจะ renumber 1..n ชิดเอง
   * - **Fail-open**: ไม่มีแถวชื่อนี้ (เครื่อง fresh ที่ยังไม่ได้สร้าง) →
   *   คืนเงียบ ไม่ throw — ไม่มีอะไรให้ล็อก
   * - ตัวช่วยของงานนี้: แถวมีแค่หลักสิบ → `find()` ทั้งตารางแล้วหา max
   *   ใน JS ถูกกว่า query builder + subquery และใช้ได้ทั้งนอก/ใน transaction
   *
   * ⚠️ ยังคง **rename / ลบ / ปิดใช้งาน** ได้ตามเดิม (ข้อสรุป: ล็อกเฉพาะ
   * "ตำแหน่ง") — ถ้าจะเพิ่มการป้องกันส่วนนั้น ค่อยว่ากันทีหลัง
   */
  private async pinRejectLast(em: EntityManager): Promise<void> {
    const all = await em.find(IssueStatus);
    const reject = all.find((s) => s.name === REJECT_STATUS_NAME);
    if (!reject) return; // fail-open — ยังไม่มีสถานะนี้ในระบบ
    const max = all.reduce(
      (m, s) => (s.id === reject.id ? m : Math.max(m, s.position)),
      0,
    );
    // `>=` (ไม่ใช่ `>`): ตำแหน่งเท่ากันแต่ id ใหญ่กว่าก็ถูกจัด"ก่อน"ได้ใน
    // `findAll` (`position ASC, id ASC`) — เท่ากันจึงต้อง bump ทิ้งเพื่อให้
    // "ยกเลิก" เป็นแถวเดียวที่มี position มากสุดจริง ๆ
    if (max >= reject.position) {
      await em.update(IssueStatus, reject.id, { position: max + 1 });
    }
  }

  async remove(id: number) {
    const status = await this.issueStatuses.findOne({ where: { id } });
    if (!status) {
      throw new NotFoundException(`Status with id ${id} not found`);
    }
    const issueCount = await this.issues.count({ where: { statusId: id } });
    if (issueCount > 0) {
      throw new ConflictException(
        `Cannot delete status "${status.name}" because it has ${issueCount} issue(s) assigned`,
      );
    }
    await this.issueStatuses.delete(id);
    return { deleted: true };
  }
}
