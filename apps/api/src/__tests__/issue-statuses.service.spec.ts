import { IssueStatusesService } from "../modules/issue-statuses/issue-statuses.service";
import { IssueStatus } from "../modules/issue-statuses/entities/issue-status.entity";
import { REJECT_STATUS_NAME } from "@kanban/shared";

/**
 * สถานะ "ยกเลิก" ถูกล็อกไว้ท้ายสุดเสมอ (`IssueStatusesService.pinRejectLast`)
 *
 * - สองที่ที่เขียน `position` คือ `create()` (สถานะใหม่ได้ `MAX+1` = แซง
 *   "ยกเลิก" เอง) กับ `reorder()` (ลูกค้าส่งลำดับอะไรมา็เขียนตามนั้น) —
 *   ทั้งคู่ต้องจบด้วย "ยกเลิก" เป็น position มากสุด
 * - Fail-open: ไม่มีแถวชื่อนี้ → ไม่อัปเดตอะไร ไม่ throw
 * - Stubbed repositories only — รันคู่กับ `npm run dev` ได้ (ไม่แตะ DB)
 */

interface StatusRow {
  id: number;
  name: string;
  position: number;
}

type ServiceArgs = ConstructorParameters<typeof IssueStatusesService>;

function makeService(rows: StatusRow[]) {
  /** transaction em ที่ `manager.transaction` จะส่งเข้าไปใน callback */
  const em = {
    update: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue(rows),
  };

  const manager = {
    transaction: jest.fn(async (cb: (m: typeof em) => Promise<unknown>) => cb(em)),
    find: em.find,
    update: em.update,
  };

  const statuses = {
    find: jest.fn().mockResolvedValue(rows),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value: unknown) => value),
    // บันทึกแล้ว "แถวใหม่" อยู่ในตารางจริง → ให้ `manager.find` ของ pin เห็นด้วย
    save: jest.fn(async (value: Record<string, unknown>) => {
      const saved = { id: 99, ...value } as unknown as StatusRow;
      rows.push(saved);
      return saved;
    }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: null }),
    })),
    manager,
  };

  const issues = {
    count: jest.fn().mockResolvedValue(0),
  };

  const service = new IssueStatusesService(
    ...([statuses, issues] as unknown as ServiceArgs),
  );

  return { service, statuses, issues, em, manager };
}

const REJECT_ID = 62;
const reject = (position: number): StatusRow => ({
  id: REJECT_ID,
  name: REJECT_STATUS_NAME,
  position,
});
const plain = (id: number, position: number): StatusRow => ({
  id,
  name: `สถานะ ${id}`,
  position,
});

describe("IssueStatusesService.pinRejectLast — สถานะ 'ยกเลิก' ต้องอยู่ท้ายสุด", () => {
  describe("reorder", () => {
    it("ดัน 'ยกเลิก' กลับไป position มากสุดเมื่อลูกค้าส่งลำดับให้มันอยู่กลาง list", async () => {
      // ลากแถวก่อนหน้าไปทับ → payload บอกว่า "ยกเลิก" อยู่อันดับ 2 ของ 3
      const rows = [plain(1, 1), reject(2), plain(2, 3)];
      const { service, em } = makeService(rows);

      await service.reorder([
        { id: 1, sortOrder: 1 },
        { id: REJECT_ID, sortOrder: 2 },
        { id: 2, sortOrder: 3 },
      ]);

      // loop เขียนตาม payload ก่อน (3 ครั้ง) แล้วค่อย pin เป็นครั้งสุดท้าย:
      // max ของแถวอื่น = 3 → "ยกเลิก" ต้องได้ 4
      expect(em.update).toHaveBeenCalledTimes(4);
      expect(em.update).toHaveBeenLastCalledWith(IssueStatus, REJECT_ID, {
        position: 4,
      });
    });

    it("ไม่แตะอะไรเลยเมื่อ 'ยกเลิก' อยู่ท้ายสุดอยู่แล้ว", async () => {
      const rows = [plain(1, 1), plain(2, 2), reject(3)];
      const { service, em } = makeService(rows);

      const items = [
        { id: 1, sortOrder: 1 },
        { id: 2, sortOrder: 2 },
        { id: REJECT_ID, sortOrder: 3 },
      ];
      await service.reorder(items);

      // มีแค่ loop เขียนตาม payload — ไม่มีการ bump ทิ้ง (max ของแถวอื่น = 2 < 3)
      expect(em.update).toHaveBeenCalledTimes(items.length);
    });

    it("fail-open: ไม่มีสถานะ 'ยกเลิก' ในระบบ → ไม่อัปเดตอะไรเพิ่ม ไม่ throw", async () => {
      const rows = [plain(1, 1), plain(2, 2)];
      const { service, em } = makeService(rows);

      const items = [
        { id: 2, sortOrder: 1 },
        { id: 1, sortOrder: 2 },
      ];
      await expect(service.reorder(items)).resolves.toEqual({ reordered: 2 });
      expect(em.update).toHaveBeenCalledTimes(items.length);
    });
  });

  describe("create", () => {
    it("สถานะใหม่ที่แซงมาอยู่หลัง 'ยกเลิก' → ถูกดันให้ 'ยกเลิก' มากสุดกว่าเดิม", async () => {
      // เดิม: สถานะอื่นสูงสุด 5, "ยกเลิก" = 6 (อยู่ท้ายสุดพอดี)
      const rows = [plain(1, 5), reject(6)];
      const { service, statuses } = makeService(rows);

      // `create()` ถาม MAX(position) จากตาราง (= 6 ของ "ยกเลิก") → สถานะใหม่
      // ได้ 7 ซึ่ง "แซง" ยกเลิก (6) ทันที
      statuses.createQueryBuilder.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: 6 }),
      });

      await service.create({ name: "สถานะใหม่" });

      // pin ต้องดัน "ยกเลิก" ขึ้นเป็น 8 (= max 7 + 1) แล้วคืนคำตอบตามเดิม
      expect(statuses.manager.update).toHaveBeenCalledWith(IssueStatus, REJECT_ID, {
        position: 8,
      });
      // สถานะใหม่ยังถูกสร้างด้วย position ที่คำนวณไว้ (7)
      expect(statuses.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: "สถานะใหม่", position: 7 }),
      );
    });

    it("fail-open: เครื่อง fresh ที่ยังไม่มี 'ยกเลิก' → สร้างสถานะได้ตามปกติ", async () => {
      const rows = [plain(1, 1)];
      const { service, statuses } = makeService(rows);

      await expect(service.create({ name: "Backlog" })).resolves.toEqual(
        expect.objectContaining({ id: 99, name: "Backlog" }),
      );
      expect(statuses.manager.update).not.toHaveBeenCalled();
    });
  });
});
