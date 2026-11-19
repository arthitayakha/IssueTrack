import { ConflictException } from "@nestjs/common";
import { IssueStatusesService } from "../modules/issue-statuses/issue-statuses.service";
import { IssueStatus } from "../modules/issue-statuses/entities/issue-status.entity";

/**
 * `IssueStatusesService` — พื้นฐานของ `create()` / `reorder()` / `remove()`
 *
 * ⚠️ เดิมไฟล์นี้ทดสอบ `pinRejectLast()` (การปักสถานะ "ยกเลิก" ไว้ท้ายสุด) ทั้งไฟล์
 * — ฟีเจอร์นั้นถูก**ถอดออกทั้งหมด** พร้อมกับสถานะ "ยกเลิก" เอง (ดู migration
 * `1831000000000-DropRejectStatus` และ `REJECT_STATUS_NAME` ที่ถูกลบจาก
 * `@kanban/shared`) เหลือไว้แค่เทสต์ของพฤติกรรมที่ยังอยู่
 *
 * - Stubbed repositories only — รันคู่กับ `npm run dev` ได้ (ไม่แตะ DB)
 */

interface StatusRow {
  id: number;
  name: string;
  position: number;
}

type ServiceArgs = ConstructorParameters<typeof IssueStatusesService>;

/** `manager.transaction(cb)` ส่ง `em` = ตัวเอง — interface ตัด cycle ของ inference */
interface TestManager {
  transaction: (cb: (em: TestManager) => Promise<unknown>) => Promise<unknown>;
  update: jest.Mock;
  find: jest.Mock;
}

function makeService(rows: StatusRow[]) {
  const manager: TestManager = {
    transaction: jest.fn(async (cb: (em: TestManager) => Promise<unknown>) =>
      cb(manager),
    ),
    update: jest.fn().mockResolvedValue(undefined),
    find: jest.fn().mockResolvedValue(rows),
  };

  const statuses = {
    find: jest.fn().mockResolvedValue(rows),
    // `remove()` / `update()` / `check()` หาแถวด้วย id → คืนแถวจริงจาก harness
    findOne: jest.fn(
      async ({ where }: { where: { id?: number; name?: string } }) =>
        rows.find(
          (r) =>
            (where.id !== undefined && r.id === where.id) ||
            (where.name !== undefined && r.name === where.name),
        ) ?? null,
    ),
    create: jest.fn((value: unknown) => value),
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

  return { service, statuses, issues, manager };
}

const plain = (id: number, position: number): StatusRow => ({
  id,
  name: `สถานะ ${id}`,
  position,
});

describe("IssueStatusesService.create", () => {
  it("assigns MAX(position)+1 and saves the new row", async () => {
    const rows = [plain(1, 5), plain(2, 6)];
    const { service, statuses } = makeService(rows);
    statuses.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: 6 }),
    });

    await service.create({ name: "สถานะใหม่" });

    expect(statuses.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: "สถานะใหม่", position: 7 }),
    );
  });

  it("starts at position 1 on an empty table", async () => {
    const { service, statuses } = makeService([]);

    await service.create({ name: "Backlog" });

    expect(statuses.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Backlog", position: 1 }),
    );
  });

  it("rejects a duplicate name", async () => {
    const rows = [plain(1, 1)];
    const { service, statuses } = makeService(rows);
    statuses.findOne.mockResolvedValue(rows[0]);

    await expect(service.create({ name: "สถานะ 1" })).rejects.toThrow(
      ConflictException,
    );
    expect(statuses.save).not.toHaveBeenCalled();
  });

  it("does not call the old pin helper (feature removed)", async () => {
    const rows = [plain(1, 5)];
    const { service, manager } = makeService(rows);

    await service.create({ name: "ใหม่" });

    expect(manager.update).not.toHaveBeenCalled();
  });
});

describe("IssueStatusesService.reorder", () => {
  it("writes every position in the payload order", async () => {
    const rows = [plain(1, 1), plain(2, 2)];
    const { service, manager } = makeService(rows);

    await service.reorder([
      { id: 2, sortOrder: 1 },
      { id: 1, sortOrder: 2 },
    ]);

    expect(manager.update).toHaveBeenCalledTimes(2);
    expect(manager.update).toHaveBeenNthCalledWith(1, IssueStatus, 2, { position: 1 });
    expect(manager.update).toHaveBeenNthCalledWith(2, IssueStatus, 1, { position: 2 });
  });

  it("never rewrites a position the payload did not mention", async () => {
    const rows = [plain(1, 1), plain(2, 2), plain(3, 3)];
    const { service, manager } = makeService(rows);

    await service.reorder([{ id: 1, sortOrder: 1 }]);

    expect(manager.update).toHaveBeenCalledTimes(1);
  });
});

describe("IssueStatusesService.remove", () => {
  it("blocks the delete while issues still sit on the status", async () => {
    const { service, issues } = makeService([plain(1, 1)]);
    issues.count.mockResolvedValue(3);

    await expect(service.remove(1)).rejects.toThrow(ConflictException);
  });

  it("deletes when nothing is assigned", async () => {
    const { service, statuses } = makeService([plain(1, 1)]);

    await service.remove(1);

    expect(statuses.delete).toHaveBeenCalledWith(1);
  });
});
