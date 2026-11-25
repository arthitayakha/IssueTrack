import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { AppsService } from "../modules/apps/apps.service";
import { viewerScope } from "../modules/apps/viewer-scope";
import type { AuthUser } from "../modules/auth/auth-user";
import { todayIso } from "../common/dates";

/**
 * AppsService with in-memory stub repositories — no database, no Nest testing
 * module, safe to run next to a live `npm run dev`.
 *
 * Guards the contract the `/systems` page relies on after migration 1812
 * (surrogate key): **เพิ่มข้อมูลใหม่ = 1 คู่ 1 แถว** · แถวหลายช่วงของคู่เดิมมีได้
 * เฉพาะจาก "ต่ออายุ"/"ซื้อชั่วโมง" (คนละ route):
 *
 * - `addRecord()` **1 คู่ 1 แถว** — ทุกช่องบังคับและกันคู่แอป×บริษัทซ้ำ (409)
 *   ตามคำสั่งผู้ใช้ ("เพิ่มตัวที่มีอยู่แล้วไม่ได้") · รายการใหม่ของคู่เดิมให้ใช้
 *   `renewRecord()` / `buyHours()` ที่ append แถวใหม่คนละ route
 * - `updateRecord()` touches **exactly one row**, and only when that row
 *   belongs to the app in the path (no cross-app editing) · `removeRecord()`
 *   deletes **every row of the pair** (ตาราง `/systems` คือ 1 แถว = 1 คู่
 *   แอป×บริษัท → ผู้ใช้คาดว่ากดถังขยะแล้วประวัติทั้งคู่หายไปด้วย — ข้อสรุป
 *   "ลบทีละรอบ มันต้องลบทั้งหมด") แต่ยัง 404 เมื่อแถวไม่อยู่ใต้แอปใน path
 * - `POST /apps` / `PATCH /apps/:id` are **name only** — the master-data tab
 *   can create or rename an app without ever writing to `app_companies`
 */

interface Row {
  id: number;
  appId: number;
  companyId: number;
  startedAt: string | null;
  expiresAt: string | null;
  maHours: number | null;
  /** แถวนี้มาจากอะไร — `renew` (ค่าเริ่มต้น/แถวเก่า) หรือ `buy` (ซื้อชั่วโมง) */
  kind: "renew" | "buy";
  /**
   * ชั่วโมงที่ "ทบมาจากช่วงแรก" ตอนต่ออายุ (migration 1824) — `null` = แถวนี้
   * ไม่ทบ (แถวเก่า / รอบ 2 เป็นต้นไป / แถว `buy`)
   */
  carriedHours: number | null;
  /** latch flag "แจ้ง MA หมดแล้ว" รอบนี้ — `null` = ยังไม่เคยแจ้ง (migration 1821) */
  maNotifiedAt: Date | null;
  /** `app_companies.cancelled_at` (1848) — สัญญาถูกยกเลิก / เปิดกลับได้ */
  cancelledAt: Date | null;
  expiryStatus: string;
  expiryNotified: string;
}

interface AppRow {
  id: number;
  name: string;
  isVisible: boolean;
}

const COMPANIES = [
  { id: 1, name: "บริษัท มามี่ฟู้ด จำกัด" },
  { id: 2, name: "บริษัท ครัวบ้านสวน จำกัด" },
];

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 1,
    appId: 7,
    companyId: 1,
    startedAt: null,
    expiresAt: null,
    maHours: null,
    kind: "renew",
    carriedHours: null,
    maNotifiedAt: null,
    cancelledAt: null,
    expiryStatus: "none",
    expiryNotified: "none",
    ...overrides,
  };
}

function makeService(options?: { apps?: AppRow[]; rows?: Row[] }) {
  const state = {
    apps: [...(options?.apps ?? [])],
    rows: [...(options?.rows ?? [])],
    nextAppId: 50,
    nextRowId: 500,
  };

  const apps = {
    // `find` = the un-scoped path (`GET /apps` without `?visible=1`): every app,
    // hidden ones included, because /master-data has to toggle them back on
    find: jest
      .fn()
      .mockImplementation(() => Promise.resolve(state.apps.map((a) => ({ ...a })))),
    findOne: jest.fn().mockImplementation((opts: { where: Partial<AppRow> }) => {
      const { id, name } = opts.where;
      const found = state.apps.find(
        (a) => (id === undefined || a.id === id) && (name === undefined || a.name === name),
      );
      return Promise.resolve(found ? { ...found } : null);
    }),
    create: jest.fn().mockImplementation((value: Partial<AppRow>) => value),
    /**
     * `?visible=1` path — a fake builder that *evaluates* the one condition the
     * service asks for instead of running SQL (`app.is_visible = true`), so the
     * tests assert real output rather than "where() was called". There is no
     * `andWhere` on purpose: company linkage must never reach this query —
     * `?mine=1` filters **in JS after `getMany()`** (`AppsService.findAll`),
     * never in SQL, so a stray extra clause would throw here instead of passing
     * quietly.
     */
    createQueryBuilder: jest.fn(() => {
      // Named (recursive) type instead of letting `qb` infer from itself —
      // TS7022/TS7024 otherwise: the object literal references `qb` inside
      // its own initializer, so there is nothing to infer from.
      type FakeQb = {
        where: (_sql: string) => FakeQb;
        orderBy: () => FakeQb;
        getMany: () => Promise<AppRow[]>;
      };
      const qb: FakeQb = {
        where: jest.fn(() => qb),
        orderBy: jest.fn(() => qb),
        getMany: jest.fn(() =>
          Promise.resolve(
            state.apps.filter((a) => a.isVisible).map((a) => ({ ...a })),
          ),
        ),
      };
      return qb;
    }),
    save: jest.fn().mockImplementation((value: Partial<AppRow>) => {
      if (value.id === undefined) {
        const created: AppRow = { isVisible: true, ...value, id: state.nextAppId++ } as AppRow;
        state.apps.push(created);
        return Promise.resolve({ ...created });
      }
      const index = state.apps.findIndex((a) => a.id === value.id);
      state.apps[index] = { ...state.apps[index], ...value };
      return Promise.resolve({ ...state.apps[index] });
    }),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const appCompanies = {
    // `where.appId` is a plain number in the paths under test (`In(...)` falls
    // back to "every row", which only `findAll` uses and is not exercised here)
    // · `companyId` ถูกส่งโดย `removePeriod()` (ย้อนกลับ) จึงต้องกรองด้วย
    find: jest
      .fn()
      .mockImplementation((opts?: { where?: { appId?: number; companyId?: number } }) => {
        const { appId, companyId } = opts?.where ?? {};
        let list = state.rows;
        if (typeof appId === "number") list = list.filter((r) => r.appId === appId);
        if (typeof companyId === "number") list = list.filter((r) => r.companyId === companyId);
        return Promise.resolve(list.map((r) => ({ ...r })));
      }),
    findOne: jest
      .fn()
      .mockImplementation(
        (opts: {
          where: { id?: number; appId?: number; companyId?: number };
          order?: { id?: string };
        }) => {
          const { id, appId, companyId } = opts.where;
          // `{ where: { id } }` — รายแถว (paths เดิม: updateRecord/removePeriod)
          if (typeof id === "number") {
            const found = state.rows.find((r) => r.id === id);
            return Promise.resolve(found ? { ...found } : null);
          }
          // `{ where: { appId, companyId }, order: { id: "DESC" } }` —
          // `isPairExpired()` ถาม "ช่วงล่าสุดของคู่" → คืนแถว id มากสุด
          let list = state.rows;
          if (typeof appId === "number") list = list.filter((r) => r.appId === appId);
          if (typeof companyId === "number") list = list.filter((r) => r.companyId === companyId);
          if (list.length === 0) return Promise.resolve(null);
          const latest = list.reduce((best, r) => (r.id > best.id ? r : best));
          return Promise.resolve({ ...latest });
        },
      ),
    create: jest.fn().mockImplementation((value: Partial<Row>) => value),
    save: jest.fn().mockImplementation((value: Partial<Row>) => {
      if (value.id === undefined) {
        const created: Row = { ...value, id: state.nextRowId++ } as Row;
        state.rows.push(created);
        return Promise.resolve({ ...created });
      }
      const index = state.rows.findIndex((r) => r.id === value.id);
      state.rows[index] = { ...state.rows[index], ...value };
      return Promise.resolve({ ...state.rows[index] });
    }),
    /**
     * รับได้ทั้ง `{ id }` (รายแถว) และ `{ appId, companyId }` (ทั้งคู่ —
     * `removeRecord()`) · คืน `{ affected }` เหมือน TypeORM จริง
     */
    delete: jest
      .fn()
      .mockImplementation((where: { id?: number; appId?: number; companyId?: number }) => {
        const before = state.rows.length;
        state.rows = state.rows.filter(
          (r) =>
            !(
              (where.id !== undefined && r.id === where.id) ||
              (where.appId !== undefined &&
                where.companyId !== undefined &&
                r.appId === where.appId &&
                r.companyId === where.companyId)
            ),
        );
        return Promise.resolve({ affected: before - state.rows.length });
      }),
  };

  const companies = {
    find: jest.fn().mockImplementation(() => Promise.resolve(COMPANIES.map((c) => ({ ...c })))),
    findOne: jest.fn().mockImplementation((opts: { where: { id: number } }) => {
      const found = COMPANIES.find((c) => c.id === opts.where.id);
      return Promise.resolve(found ? { ...found } : null);
    }),
  };

  const issues = { count: jest.fn().mockResolvedValue(0) };
  const expiry = { reconcile: jest.fn().mockResolvedValue(false) };
  /**
   * `removePeriod()` ถามว่าช่วงนั้น "คิด MA" ไปหรือยัง — ค่าเริ่มต้น `[]`
   * (= ยังไม่เคยหัก → ย้อนได้) เคสที่หักแล้ว override ในเทสต์นั้นเอง
   */
  const maUsage = { usageCounts: jest.fn().mockResolvedValue([]) };
  const notifications = { notifyContractChange: jest.fn().mockResolvedValue(undefined) };

  const service = new AppsService(
    apps as unknown as never,
    appCompanies as unknown as never,
    issues as unknown as never,
    companies as unknown as never,
    expiry as unknown as never,
    maUsage as unknown as never,
    notifications as unknown as never,
  );

  return { service, apps, appCompanies, expiry, maUsage, notifications, state };
}

const POS: AppRow = { id: 7, name: "POS", isVisible: true };
const CRM: AppRow = { id: 11, name: "CRM", isVisible: true };
const CRM_OFF: AppRow = { id: 12, name: "CRM Classic", isVisible: false };

describe("AppsService.addRecord — 1 คู่ 1 แถว, กรอกครบ, กันซ้ำ", () => {
  const full = {
    companyId: 2,
    startedAt: "2026-11-09",
    expiresAt: "2027-11-08",
    maHours: 12,
  };

  it("rejects a duplicate app×company pair with 409 and leaves the old row untouched", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, companyId: 1, maHours: 40, expiresAt: "2027-11-08" })],
    });

    await expect(
      service.addRecord(7, { ...full, companyId: 1 }),
    ).rejects.toThrow(ConflictException);

    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({
      id: 11,
      companyId: 1,
      maHours: 40,
      expiresAt: "2027-11-08",
    });
  });

  it("creates a row when all fields are filled and the pair is new", async () => {
    const { service, state } = makeService({ apps: [POS] });

    await service.addRecord(7, { ...full, maHours: "12" });

    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({
      companyId: 2,
      startedAt: "2026-11-09",
      expiresAt: "2027-11-08",
      maHours: 12,
      // a fresh row starts with no announcements to its name
      expiryStatus: "none",
      expiryNotified: "none",
    });
  });

  it("rejects an app that does not exist", async () => {
    const { service, state } = makeService({ apps: [POS] });

    await expect(service.addRecord(999, full)).rejects.toThrow(NotFoundException);
    expect(state.rows).toHaveLength(0);
  });

  it("rejects a company that does not exist and writes nothing", async () => {
    const { service, state } = makeService({ apps: [POS] });

    await expect(service.addRecord(7, { ...full, companyId: 999 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.addRecord(7, {} as typeof full)).rejects.toThrow(
      BadRequestException,
    );
    expect(state.rows).toHaveLength(0);
  });

  it("requires every field (company, start, expiry, MA hours)", async () => {
    const { service, state } = makeService({ apps: [POS] });

    await expect(service.addRecord(7, { ...full, companyId: null })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.addRecord(7, { ...full, startedAt: "" })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.addRecord(7, { ...full, expiresAt: undefined })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.addRecord(7, { ...full, maHours: null })).rejects.toThrow(
      BadRequestException,
    );
    expect(state.rows).toHaveLength(0);
  });

  it("rejects expiry on or before the start date", async () => {
    const { service, state } = makeService({ apps: [POS] });

    await expect(
      service.addRecord(7, { ...full, expiresAt: "2026-11-09" }),
    ).rejects.toThrow(BadRequestException);
    expect(state.rows).toHaveLength(0);
  });

  it("accepts 0 hours but rejects a bad date and a negative/non-integer hour count", async () => {
    const { service, state } = makeService({ apps: [POS] });

    await service.addRecord(7, { ...full, maHours: 0 });
    expect(state.rows[0].maHours).toBe(0);

    await expect(
      service.addRecord(7, { ...full, companyId: 1, expiresAt: "31/12/2027" }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.addRecord(7, { ...full, companyId: 1, maHours: -1 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.addRecord(7, { ...full, companyId: 1, maHours: 1.5 }),
    ).rejects.toThrow(BadRequestException);
    expect(state.rows).toHaveLength(1);
  });
});

describe("AppsService.updateRecord — one row only", () => {
  it("updates just that row and leaves the other periods alone", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [
        row({ id: 11, companyId: 1, maHours: 40 }),
        row({ id: 12, companyId: 1, maHours: 60 }),
      ],
    });

    await service.updateRecord(7, 12, { maHours: 75 });

    expect(state.rows[0].maHours).toBe(40);
    expect(state.rows[1].maHours).toBe(75);
  });

  it("leaves fields the caller did not send untouched (PATCH semantics)", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, startedAt: "2026-01-01", expiresAt: "2026-12-31", maHours: 40 })],
    });

    await service.updateRecord(7, 11, { maHours: 10 });

    expect(state.rows[0]).toMatchObject({
      startedAt: "2026-01-01",
      expiresAt: "2026-12-31",
      maHours: 10,
    });
  });

  it("rejects changing the company to a pair that already has a row (409)", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, companyId: 1 }), row({ id: 12, companyId: 2 })],
    });

    await expect(service.updateRecord(7, 11, { companyId: 2 })).rejects.toThrow(
      ConflictException,
    );
    expect(state.rows[0].companyId).toBe(1);
  });

  it("allows changing the company to a pair that has no row", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, companyId: 1 })],
    });

    await service.updateRecord(7, 11, { companyId: 2 });
    expect(state.rows[0].companyId).toBe(2);
  });

  it("clears the MA-depleted latch only when the hours go UP (เปิดรอบแจ้งใหม่)", async () => {
    const notified = new Date("2026-11-01T00:00:00Z");
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, maHours: 40, maNotifiedAt: notified })],
    });

    // เติมชั่วโมง → รอบการหมดครั้งต่อไปต้องแจ้งใหม่ได้
    await service.updateRecord(7, 11, { maHours: 50 });
    expect(state.rows[0].maNotifiedAt).toBeNull();

    // แก้เท่าเดิม / ลดลง → ไม่แตะ latch (ยังไม่หมดไม่แจ้งอยู่แล้ว)
    state.rows[0].maNotifiedAt = notified;
    await service.updateRecord(7, 11, { maHours: 50 });
    expect(state.rows[0].maNotifiedAt).toBe(notified);

    await service.updateRecord(7, 11, { maHours: 30 });
    expect(state.rows[0].maNotifiedAt).toBe(notified);
  });

  it("404 when the record belongs to another app (no cross-app edits)", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, appId: 8 })],
    });

    await expect(service.updateRecord(7, 11, { maHours: 5 })).rejects.toThrow(NotFoundException);
    expect(state.rows[0].maHours).toBeNull();
  });

  it("404 when the app itself is gone", async () => {
    const { service } = makeService({ apps: [POS], rows: [row({ id: 11 })] });

    await expect(service.updateRecord(999, 11, { maHours: 5 })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe("AppsService.removeRecord — deletes the whole pair, not the app", () => {
  it("removes EVERY row of that app×company pair and keeps other pairs", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [
        row({ id: 11, companyId: 1 }), // ช่วงแรกของคู่ (7×1)
        row({ id: 12, companyId: 2 }), // คู่อื่น — ต้องอยู่รอด
        row({ id: 13, companyId: 1 }), // ช่วงที่ 2 ของคู่ (7×1)
      ],
    });

    // ตารางส่งแถวล่าสุด แต่ทั้งคู่ต้องหาย (ข้อสรุป: "ลบทีละรอบ มันต้องลบทั้งหมด")
    await expect(service.removeRecord(7, 13)).resolves.toEqual({
      deleted: true,
      deletedRows: 2,
    });

    expect(state.rows.map((r) => r.id)).toEqual([12]);
    expect(state.apps).toHaveLength(1); // แอปไม่หาย (คนละกับ remove())
  });

  it("reports deletedRows: 1 when the pair has a single row", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, companyId: 1 })],
    });

    await expect(service.removeRecord(7, 11)).resolves.toEqual({
      deleted: true,
      deletedRows: 1,
    });
    expect(state.rows).toHaveLength(0);
  });

  it("404 when the record is not under that app, and deletes nothing", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, appId: 8 })],
    });

    await expect(service.removeRecord(7, 11)).rejects.toThrow(NotFoundException);
    await expect(service.removeRecord(7, 4242)).rejects.toThrow(NotFoundException);
    expect(state.rows).toHaveLength(1);
  });
});

describe("AppsService.removePeriod — undo deletes ONE period, never the pair", () => {
  const period = { startedAt: "2026-11-09", expiresAt: "2027-11-09", maHours: 40 };

  it("removes ONLY the newest period of that pair and leaves the others", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [
        row({ id: 11, companyId: 1, ...period }), // ช่วงก่อนต่ออายุ — ต้องอยู่รอด
        row({ id: 13, companyId: 1, ...period }), // ช่วงที่เพิ่ง append = แถวย้อนกลับ
        row({ id: 12, companyId: 2, ...period }), // คู่อื่น — ต้องไม่กระทบ
      ],
    });

    await service.removePeriod(7, 13);

    // คู่ 7×1 เหลือช่วงเดิม (กลับเป็น latest เอง) + คู่อื่นอยู่ครบ · แอปไม่หาย
    expect(state.rows.map((r) => r.id)).toEqual([11, 12]);
    expect(state.apps).toHaveLength(1);
  });

  it("404 when the record is not under that app, and deletes nothing", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, appId: 8 }), row({ id: 12, appId: 8 })],
    });

    await expect(service.removePeriod(7, 11)).rejects.toThrow(NotFoundException);
    await expect(service.removePeriod(7, 4242)).rejects.toThrow(NotFoundException);
    expect(state.rows).toHaveLength(2);
  });

  it("400 when it is the only period left — that is the whole-pair delete", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, companyId: 1, ...period })],
    });

    await expect(service.removePeriod(7, 11)).rejects.toThrow(BadRequestException);
    expect(state.rows).toHaveLength(1);
  });

  it("400 when the record is NOT the newest of its pair (undo is LIFO)", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [
        row({ id: 11, companyId: 1, ...period }),
        row({ id: 13, companyId: 1, ...period }),
      ],
    });

    await expect(service.removePeriod(7, 11)).rejects.toThrow(BadRequestException);
    expect(state.rows).toHaveLength(2);
  });

  it("finds the newest of ITS pair even when another pair has a higher id", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [
        row({ id: 11, companyId: 1, ...period }),
        row({ id: 12, companyId: 1, ...period }), // ใหม่สุดของคู่ 7×1
        row({ id: 15, companyId: 2, ...period }), // คู่อื่น id ใหญ่กว่า — ไม่เกี่ยว
      ],
    });

    await service.removePeriod(7, 12);

    expect(state.rows.map((r) => r.id)).toEqual([11, 15]);
  });

  it("400 when the period already has MA hours deducted (the UI hides the button)", async () => {
    const { service, state, maUsage } = makeService({
      apps: [POS],
      rows: [
        row({ id: 11, companyId: 1, ...period }),
        row({ id: 13, companyId: 1, ...period }),
      ],
    });
    maUsage.usageCounts.mockResolvedValue([{ recordId: 13, count: 2, periodUsedHours: 2.5 }]);

    await expect(service.removePeriod(7, 13)).rejects.toThrow(BadRequestException);
    expect(state.rows).toHaveLength(2);
    // ถามเฉพาะแถวนั้น — ไม่ใช่ทั้งคู่
    expect(maUsage.usageCounts).toHaveBeenCalledWith([13]);
  });

  it("removes a period whose usage came back as 0 (ยังไม่เคยคิด MA)", async () => {
    const { service, state, maUsage } = makeService({
      apps: [POS],
      rows: [
        row({ id: 11, companyId: 1, ...period }),
        row({ id: 13, companyId: 1, ...period }),
      ],
    });
    maUsage.usageCounts.mockResolvedValue([{ recordId: 13, count: 0, periodUsedHours: 0 }]);

    await service.removePeriod(7, 13);

    expect(state.rows.map((r) => r.id)).toEqual([11]);
  });
});

describe("AppsService.renewRecord — appends the next period, never rewrites", () => {
  const period = { startedAt: "2026-11-09", expiresAt: "2027-11-09", maHours: 40 };

  it("adds a new period for the same pair and leaves the old one byte-for-byte", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, companyId: 2, ...period, expiresAt: "2026-12-08" })],
    });

    await service.renewRecord(7, 11, period);

    expect(state.rows).toHaveLength(2);
    expect(state.rows[0]).toMatchObject({ id: 11, companyId: 2, expiresAt: "2026-12-08" });
    // the new period inherits the company — the form cannot move it to another one
    expect(state.rows[1]).toMatchObject({ appId: 7, companyId: 2, ...period });
    expect(state.rows[1].id).not.toBe(11);
    // a fresh period starts with no announcements to its name
    expect(state.rows[1]).toMatchObject({ expiryStatus: "none", expiryNotified: "none" });
  });

  it("accepts the hours as a string (ช่องกรอกในฟอร์ม) and normalizes both dates", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11 })],
    });

    await service.renewRecord(7, 11, { ...period, maHours: "60" });

    expect(state.rows[1]).toMatchObject({ startedAt: "2026-11-09", expiresAt: "2027-11-09", maHours: 60 });
  });

  it("rejects a renewal that leaves a field empty (บังคับกรอกทั้ง 3 ช่อง)", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11 })],
    });

    await expect(service.renewRecord(7, 11, { ...period, startedAt: "" })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.renewRecord(7, 11, { ...period, expiresAt: null })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.renewRecord(7, 11, { startedAt: "2026-11-09", expiresAt: "2027-11-09" })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.renewRecord(7, 11, { ...period, maHours: null })).rejects.toThrow(
      BadRequestException,
    );
    expect(state.rows).toHaveLength(1);
  });

  it("rejects a period whose end is not after its start", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11 })],
    });

    await expect(
      service.renewRecord(7, 11, { ...period, expiresAt: "2026-11-09" }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.renewRecord(7, 11, { ...period, expiresAt: "2026-01-01" }),
    ).rejects.toThrow(BadRequestException);
    expect(state.rows).toHaveLength(1);
  });

  it("rejects a bad date or a negative/non-integer hour count", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11 })],
    });

    await expect(
      service.renewRecord(7, 11, { ...period, startedAt: "09/11/2026" }),
    ).rejects.toThrow(BadRequestException);
    await expect(service.renewRecord(7, 11, { ...period, maHours: -1 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.renewRecord(7, 11, { ...period, maHours: 1.5 })).rejects.toThrow(
      BadRequestException,
    );
    expect(state.rows).toHaveLength(1);
  });

  it("404 when the record belongs to another app (no cross-app renewal)", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, appId: 8 })],
    });

    await expect(service.renewRecord(7, 11, period)).rejects.toThrow(NotFoundException);
    await expect(service.renewRecord(7, 4242, period)).rejects.toThrow(NotFoundException);
    expect(state.rows).toHaveLength(1);
  });

  it("404 when the app itself is gone", async () => {
    const { service, state } = makeService({ apps: [POS], rows: [row({ id: 11 })] });

    await expect(service.renewRecord(999, 11, period)).rejects.toThrow(NotFoundException);
    expect(state.rows).toHaveLength(1);
  });

  it("stores the carried-over hours and exposes them in the payload (carried_hours)", async () => {
    const { service, state } = makeService({ apps: [POS], rows: [row({ id: 11 })] });

    const result = await service.renewRecord(7, 11, { ...period, carriedHours: 15 });

    expect(state.rows[1]).toMatchObject({ maHours: 40, carriedHours: 15 });
    // ป๊อปอัพ `/systems` อ่านค่านี้จาก payload เพื่อโชว์ chip "ทบมา X ชม."
    expect(result.companies[1].carriedHours).toBe(15);
    expect(result.companies[0].carriedHours ?? null).toBeNull();
  });

  it("keeps carried_hours NULL when nothing was carried (ส่ง 0 / ไม่ส่งค่า)", async () => {
    const { service, state } = makeService({ apps: [POS], rows: [row({ id: 11 })] });

    // ฟอร์มส่ง 0 เมื่อรอบนั้นทบไม่ได้ (รอบ 2 เป็นต้นไป) → เก็บเป็น NULL
    await service.renewRecord(7, 11, { ...period, carriedHours: 0 });
    expect(state.rows[1].carriedHours ?? null).toBeNull();

    // payload ที่ไม่ส่งค่าเลย (เวอร์ชันเก่า) ก็ต้องไม่พัง
    await service.renewRecord(7, 11, period);
    expect(state.rows[2].carriedHours ?? null).toBeNull();
  });

  it("rejects a carried value that is negative, fractional or above maHours", async () => {
    const { service, state } = makeService({ apps: [POS], rows: [row({ id: 11 })] });

    await expect(service.renewRecord(7, 11, { ...period, carriedHours: -1 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.renewRecord(7, 11, { ...period, carriedHours: 1.5 })).rejects.toThrow(
      BadRequestException,
    );
    // `maHours` ของรอบนี้ = 40 → ทบมากกว่านั้นเป็นไปไม่ได้ (payload เพี้ยน)
    await expect(service.renewRecord(7, 11, { ...period, carriedHours: 41 })).rejects.toThrow(
      BadRequestException,
    );
    expect(state.rows).toHaveLength(1);
  });

  it("drops the carry when the new period starts more than 1 year after the old expiry", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, expiresAt: "2025-01-01" })],
    });

    // ต่อตรงเวลา (3 ม.ค. 2567) และครบ 1 ปีพอดี (1 ม.ค. 2568) → ยังได้ทบ
    await service.renewRecord(7, 11, {
      ...period,
      startedAt: "2025-01-03",
      expiresAt: "2026-01-03",
      carriedHours: 15,
    });
    await service.renewRecord(7, 11, {
      ...period,
      startedAt: "2026-01-01",
      expiresAt: "2027-01-01",
      carriedHours: 15,
    });

    // ขาดไป 1 ปี (5 ม.ค. 2569) → สิทธิ์ทบหมด
    await expect(
      service.renewRecord(7, 11, {
        ...period,
        startedAt: "2027-01-05",
        expiresAt: "2028-01-05",
        carriedHours: 15,
      }),
    ).rejects.toThrow(BadRequestException);

    // แต่ต่อช้าโดยไม่ทบยังทำได้ (window นี้คุมแค่ `carriedHours`)
    await service.renewRecord(7, 11, {
      ...period,
      startedAt: "2027-01-05",
      expiresAt: "2028-01-05",
    });
    expect(state.rows).toHaveLength(4);
  });

  it("uses the form's Feb-29 clamp for the 1-year carry deadline", async () => {
    const { service } = makeService({
      apps: [POS],
      rows: [row({ id: 11, expiresAt: "2024-02-29" })],
    });

    // dayjs `.add(1, "year")` ปัด 29 ก.พ. → 28 ก.พ. 2568 — ฝั่งเซิร์ฟเวอร์ต้องตรงกัน
    await expect(
      service.renewRecord(7, 11, {
        ...period,
        startedAt: "2025-02-28",
        expiresAt: "2026-02-28",
        carriedHours: 10,
      }),
    ).resolves.toBeDefined();
    await expect(
      service.renewRecord(7, 11, {
        ...period,
        startedAt: "2025-03-01",
        expiresAt: "2026-03-01",
        carriedHours: 10,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("sends an in-app renewal confirmation after the write (no e-mail)", async () => {
    const { service, notifications } = makeService({
      apps: [POS],
      rows: [row({ id: 11, companyId: 2, ...period })],
    });

    await service.renewRecord(7, 11, period);
    await new Promise((resolve) => setImmediate(resolve));

    expect(notifications.notifyContractChange).toHaveBeenCalledWith({
      companyId: 2,
      appId: 7,
      appName: "POS",
      companyName: "บริษัท ครัวบ้านสวน จำกัด",
      action: "app_renewed",
      context: "MA 40 ชม.",
    });
  });
});

describe("AppsService.buyHours — same dates, more hours (ซื้อชั่วโมง MA เพิ่ม)", () => {
  it("appends a same-dates row whose MA is the purchased hours when nothing is carried (kind 'buy')", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [
        row({
          id: 11,
          companyId: 2,
          startedAt: "2026-01-01",
          expiresAt: "2026-12-08",
          maHours: 40,
          expiryStatus: "expiring_soon",
          expiryNotified: "d30",
        }),
      ],
    });

    const result = await service.buyHours(7, 11, { hours: 20 });

    expect(state.rows).toHaveLength(2);
    // the source row is byte-for-byte untouched
    expect(state.rows[0]).toMatchObject({
      id: 11,
      companyId: 2,
      maHours: 40,
      expiryStatus: "expiring_soon",
      expiryNotified: "d30",
    });
    // the new row keeps the contract dates (ซื้อชั่วโมง ≠ ต่ออายุ) and — **ไม่ส่ง
    // `carriedHours`** — MA = ที่ซื้อล้วน (20 ไม่ใช่ 60)
    expect(state.rows[1]).toMatchObject({
      appId: 7,
      companyId: 2,
      startedAt: "2026-01-01",
      expiresAt: "2026-12-08",
      // **เท่ากับที่ซื้อเท่านั้น** (ไม่ส่งทบ) — ไม่รวม MA ของแถวก่อน (20 ไม่ใช่ 60)
      maHours: 20,
      kind: "buy",
    });
    expect(state.rows[1].id).not.toBe(11);
    // same dates → copy the announcement latch, NOT a fresh 'none' (กันยิง d30/d7 ซ้ำ)
    expect(state.rows[1]).toMatchObject({
      expiryStatus: "expiring_soon",
      expiryNotified: "d30",
    });
    // the response carries `kind` so the history tab can label the row
    expect(result.companies).toHaveLength(2);
    expect(result.companies[0].kind).toBe("renew");
    expect(result.companies[1].kind).toBe("buy");
    // ไม่ทบ → ไม่มีค่าเก็บ (NULL) ผัง "ข้อมูลทั่วไป" จึงไม่โชว์บรรทัด "ทบมา"
    expect(result.companies[1].carriedHours ?? null).toBeNull();
    expect(state.rows[1].carriedHours ?? null).toBeNull();
  });

  it("adds the unspent balance of the source row to the new MA (ทบสิทธิ์คงเหลือ)", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, companyId: 2, startedAt: "2026-01-01", expiresAt: "2026-12-08", maHours: 40 })],
    });

    // ฟอร์มคำนวณ `carry = MA แถวนั้น − ใช้ไปของแถวนั้น` (40 − 25 = 15) แล้วส่งมา
    await service.buyHours(7, 11, { hours: 20, carriedHours: 15 });

    // **maHours = ที่ซื้อ + ทบ** = 35 (ไม่ใช่ 20 และไม่ใช่ 60) — ช่วงเดิมเหลือ 15 ยังใช้ได้
    expect(state.rows[1]).toMatchObject({ maHours: 35, kind: "buy", carriedHours: 15 });
    // แถวนั้นไม่ถูกเขียนทับ
    expect(state.rows[0]).toMatchObject({ id: 11, maHours: 40 });
  });

  it("rejects a carried value above the source row's MA / negative / fractional", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, maHours: 40 })],
    });

    // เพดาน `carried ≤ MA แถวนั้น` (40) — เกิน = payload เพี้ยน → 400
    await expect(
      service.buyHours(7, 11, { hours: 20, carriedHours: 41 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.buyHours(7, 11, { hours: 20, carriedHours: -1 }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.buyHours(7, 11, { hours: 20, carriedHours: 1.5 }),
    ).rejects.toThrow(BadRequestException);
    expect(state.rows).toHaveLength(1);
  });

  it("keeps carried_hours NULL when the form sends 0 (แถวนั้นใช้หมด)", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, maHours: 40 })],
    });

    await service.buyHours(7, 11, { hours: 20, carriedHours: 0 });

    expect(state.rows[1]).toMatchObject({ maHours: 20, kind: "buy" });
    expect(state.rows[1].carriedHours ?? null).toBeNull();
  });

  it("does not add the source MA when the form sends no carry (ซื้อได้แม้ยังไม่เคยกรอก MA)", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, startedAt: "2026-01-01", expiresAt: "2026-12-08" })],
    });

    await service.buyHours(7, 11, { hours: 10 });

    // ไม่ส่ง `carriedHours` → MA = ที่ซื้อ ล้วน (10) — แถวนั้นไม่มี MA อยู่แล้ว
    // จึงทบอะไรไม่ได้ (เพดานของ `requireCarriedHours` = MA แถวนั้น = 0)
    expect(state.rows[1]).toMatchObject({ maHours: 10, kind: "buy" });
  });

  it("accepts the hours as a string (ช่องกรอกในฟอร์ม)", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, maHours: 40 })],
    });

    await service.buyHours(7, 11, { hours: "15" });

    expect(state.rows[1]).toMatchObject({ maHours: 15, kind: "buy" });
  });

  it("rejects empty / zero / negative / fractional hours and writes nothing", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, maHours: 40 })],
    });

    await expect(service.buyHours(7, 11, {})).rejects.toThrow(BadRequestException);
    await expect(service.buyHours(7, 11, { hours: null })).rejects.toThrow(BadRequestException);
    await expect(service.buyHours(7, 11, { hours: "" })).rejects.toThrow(BadRequestException);
    await expect(service.buyHours(7, 11, { hours: 0 })).rejects.toThrow(BadRequestException);
    await expect(service.buyHours(7, 11, { hours: -5 })).rejects.toThrow(BadRequestException);
    await expect(service.buyHours(7, 11, { hours: 2.5 })).rejects.toThrow(BadRequestException);
    expect(state.rows).toHaveLength(1);
  });

  it("404 when the record belongs to another app or does not exist", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, appId: 8 })],
    });

    await expect(service.buyHours(7, 11, { hours: 10 })).rejects.toThrow(NotFoundException);
    await expect(service.buyHours(7, 4242, { hours: 10 })).rejects.toThrow(NotFoundException);
    expect(state.rows).toHaveLength(1);
  });

  it("404 when the app itself is gone", async () => {
    const { service, state } = makeService({ apps: [POS], rows: [row({ id: 11 })] });

    await expect(service.buyHours(999, 11, { hours: 10 })).rejects.toThrow(NotFoundException);
    expect(state.rows).toHaveLength(1);
  });

  it("sends an in-app purchase row with the carried hours folded into the total", async () => {
    const { service, notifications } = makeService({
      apps: [POS],
      rows: [
        row({
          id: 11,
          companyId: 2,
          startedAt: "2026-01-01",
          expiresAt: "2026-12-08",
          maHours: 40,
        }),
      ],
    });

    await service.buyHours(7, 11, { hours: 40, carriedHours: 10 });
    await new Promise((resolve) => setImmediate(resolve));

    expect(notifications.notifyContractChange).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 2,
        appName: "POS",
        action: "app_hours_purchased",
        context: "+40 ชม. (รวม 50 ชม.)",
      }),
    );
  });
});

describe("AppsService.create / update — name only (แท็บแอปใน /master-data)", () => {
  it("creates an app with no system data attached", async () => {
    const { service, state } = makeService();

    const created = await service.create({ name: "CRM" });

    expect(created).toMatchObject({ name: "CRM", companies: [] });
    expect(state.rows).toHaveLength(0);
  });

  it("requires a name", async () => {
    const { service } = makeService();

    await expect(service.create({})).rejects.toThrow(BadRequestException);
    await expect(service.create({ name: "" })).rejects.toThrow(BadRequestException);
  });

  it("rejects a duplicate name with 409", async () => {
    const { service } = makeService({ apps: [POS] });

    await expect(service.create({ name: "POS" })).rejects.toThrow(ConflictException);
  });

  it("renames without touching a single system-data row", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, maHours: 40 })],
    });

    const updated = await service.update(7, { name: "POS v2" });

    expect(updated.name).toBe("POS v2");
    expect(updated.companies).toHaveLength(1);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].maHours).toBe(40);
  });

  it("404 when renaming an app that is not there", async () => {
    const { service } = makeService({ apps: [POS] });

    await expect(service.update(999, { name: "X" })).rejects.toThrow(NotFoundException);
  });
});

describe("AppsService.findAll — the ?visible=1 scope (ฟอร์มรายงานปัญหา)", () => {
  const params = { page: 1, limit: 100 };

  it("returns every switched-on app, linked to a company or not (ไม่ส่ง `mine` = ไม่กรอง)", async () => {
    // POS is linked to company 1, CRM to nobody — without `?mine=1` linkage
    // must not matter, so both belong in the dropdown (ข้อสรุปเดิมของพี่ยัง
    // ใช้ได้กับ path ที่ไม่ส่ง flag — /master-data, /reports, ชิปบนบอร์ด)
    const { service, apps } = makeService({
      apps: [POS, CRM],
      rows: [row({ id: 11, appId: 7, companyId: 1 })],
    });

    const res = await service.findAll(params, { visible: true });

    expect(res.data.map((a) => a.name)).toEqual(["POS", "CRM"]);
    expect(res.total).toBe(2);
    // …and the only clause it asked for is the visibility one — no company EXISTS
    expect(apps.createQueryBuilder.mock.results[0].value.where).toHaveBeenCalledWith(
      "app.is_visible = true",
    );
  });

  it("drops apps switched off in /master-data from the ?visible=1 path", async () => {
    // CRM Classic is linked just like POS — visibility is the only reason it
    // must not show up, so this test cannot pass by accident
    const { service } = makeService({
      apps: [POS, CRM_OFF],
      rows: [row({ id: 11, appId: 7, companyId: 1 }), row({ id: 12, appId: 12, companyId: 1 })],
    });

    const res = await service.findAll(params, { visible: true });

    expect(res.data.map((a) => a.name)).toEqual(["POS"]);
  });

  it("keeps every app, hidden ones included, when the flag is absent (master data / reports)", async () => {
    const { service, apps } = makeService({ apps: [POS, CRM_OFF], rows: [] });

    const res = await service.findAll(params);

    expect(res.data.map((a) => a.name)).toEqual(["POS", "CRM Classic"]);
    // the un-scoped path reads straight from the table — no picker query at all
    expect(apps.createQueryBuilder).not.toHaveBeenCalled();
    expect(apps.find).toHaveBeenCalledWith({ order: { id: "ASC" } });
  });
});

/**
 * **`?mine=1` — dropdown ของฟอร์มแจ้งปัญหากรองตามบริษัทผู้แจ้ง** (`fetchVisibleApps()`
 * ส่งคู่กับ `visible=1`) — เอาเฉพาะแอปที่ผูกกับ `contract.companyId` แล้ว
 * **fail-open ทุกทาง** ที่รายการจะว่างลง: ไม่มีบริษัท / ไม่มีแถวผูก / สตาฟฟ์
 * (`mode: "all"` → `callerLinks` ว่าง) / แอปที่ผูกถูกปิดหมด (`linked` ว่าง) →
 * คืนรายการเต็มเหมือนไม่ได้กรอง — ช่องแอปบังคับ การกรองจึงห้ามทำให้ว่าง
 */
describe("AppsService.findAll — ?mine=1 (กรองแอปตามบริษัทผู้แจ้ง + fail-open)", () => {
  const params = { page: 1, limit: 100 };
  /** `GET /apps` ของฟอร์มแจ้งปัญหา = `viewerScope(user, "none")` — คง `companyId` ไว้ */
  const reportScope = (companyId: number | null) => ({ mode: "none" as const, companyId });

  it("keeps only apps linked to the caller's company (ผูก = เห็น, ไม่ผูก = ไม่เห็น)", async () => {
    const { service, apps } = makeService({
      apps: [POS, CRM],
      rows: [
        row({ id: 11, appId: 7, companyId: 1 }), // POS ↔ บริษัท 1
        row({ id: 12, appId: 11, companyId: 2 }), // CRM ↔ บริษัทอื่น
      ],
    });

    const res = await service.findAll(params, {
      visible: true,
      mine: true,
      contract: reportScope(1),
    });

    expect(res.data.map((a) => a.name)).toEqual(["POS"]);
    expect(res.total).toBe(1); // pagination นับจากหลังกรอง
    // กรองใน JS หลัง query — เงื่อนไขบริษัทห้ามหลุดเข้า SQL (stub ไม่มี andWhere)
    expect(apps.createQueryBuilder.mock.results[0].value.where).toHaveBeenCalledWith(
      "app.is_visible = true",
    );
    // และยังคงตัดแถวด้านในตาม viewer-scope (ไม่รั่ววันที่สัญญา)
    expect(res.data[0].companies).toEqual([]);
  });

  it("fail-open: customer with NO company sees every switched-on app (ไม่มีบริษัท = ไม่กรอง)", async () => {
    const { service } = makeService({
      apps: [POS, CRM],
      rows: [row({ id: 11, appId: 7, companyId: 2 })],
    });

    const res = await service.findAll(params, {
      visible: true,
      mine: true,
      contract: reportScope(null),
    });

    expect(res.data.map((a) => a.name)).toEqual(["POS", "CRM"]);
  });

  it("fail-open: a company with no linked rows keeps the full list (ยังไม่ผูกแอป = ไม่กรอง)", async () => {
    const { service } = makeService({ apps: [POS, CRM], rows: [] });

    const res = await service.findAll(params, {
      visible: true,
      mine: true,
      contract: reportScope(1),
    });

    expect(res.data.map((a) => a.name)).toEqual(["POS", "CRM"]);
  });

  it("fail-open: staff (`all` scope) is never filtered even with ?mine=1 (สตาฟฟ์เห็นทุกแอป)", async () => {
    const { service } = makeService({
      apps: [POS, CRM],
      rows: [row({ id: 11, appId: 7, companyId: 1 })],
    });

    const res = await service.findAll(params, {
      visible: true,
      mine: true,
      contract: { mode: "all", companyId: null },
    });

    expect(res.data.map((a) => a.name)).toEqual(["POS", "CRM"]);
  });

  it("fail-open: when every linked app is switched off the full visible list comes back (ผูกแต่ปิดหมด = ไม่กรอง)", async () => {
    // บริษัท 1 ผูกแค่ CRM Classic ที่ปิดอยู่ → `linked` ว่าง (visible query ไม่คืนมัน)
    // → ต้องได้ POS กลับมา ไม่ใช่ dropdown ว่าง
    const { service } = makeService({
      apps: [POS, CRM_OFF],
      rows: [row({ id: 11, appId: 12, companyId: 1 })],
    });

    const res = await service.findAll(params, {
      visible: true,
      mine: true,
      contract: reportScope(1),
    });

    expect(res.data.map((a) => a.name)).toEqual(["POS"]);
  });

  it("without the flag nothing changes even when a company is set (ไม่ส่ง `mine` = ไม่แตะ)", async () => {
    const { service } = makeService({
      apps: [POS, CRM],
      rows: [row({ id: 11, appId: 7, companyId: 1 })],
    });

    const res = await service.findAll(params, { visible: true, contract: reportScope(1) });

    expect(res.data.map((a) => a.name)).toEqual(["POS", "CRM"]);
  });

  it("maExpired still flags the caller's expired pair on the FILTERED list (ธงบล็อกไม่หาย)", async () => {
    const { service } = makeService({
      apps: [POS, CRM],
      rows: [
        row({ id: 11, appId: 7, companyId: 1, expiresAt: "2020-01-01" }), // ผูก + หมดอายุ
        row({ id: 12, appId: 11, companyId: 2 }), // ของบริษัทอื่น → ถูกกรองทิ้ง
      ],
    });

    const res = await service.findAll(params, {
      visible: true,
      mine: true,
      contract: reportScope(1),
    });

    expect(res.data.map((a) => a.name)).toEqual(["POS"]);
    expect(res.data[0].maExpired).toBe(true);
  });
});

/**
 * **ขอบเขตสัญญาของลูกค้า** (`apps/viewer-scope.ts`) — เหตุผลที่ยก `system.view`
 * ให้ role `customer` ได้โดยไม่รั่ว: หน้า `/systems` ของลูกค้าต้องเห็นเฉพาะคู่
 * แอป×บริษัทของตัวเอง และ `GET /apps` ต้องไม่คืนแถวด้านในให้อ่านสัญญาคนอื่น
 */
describe("AppsService.findAll — contract scope (ลูกค้าเห็นเฉพาะของตัวเอง)", () => {
  const params = { page: 1, limit: 100 };

  it("own scope keeps the caller's pairs, drops everyone else's, reconciles only its own", async () => {
    const { service, expiry } = makeService({
      apps: [POS, CRM],
      rows: [
        row({ id: 11, appId: 7, companyId: 1 }),
        row({ id: 12, appId: 11, companyId: 2 }),
      ],
    });

    const res = await service.findAll(params, { contract: { mode: "own", companyId: 1 } });

    // รายการชื่อแอป**ไม่ถูกจำกัด** — ทุกตัวยังอยู่ (ไม่ส่ง `mine` → ไม่กรอง;
    // ฟอร์มแจ้งปัญหาจะกรองก็ต่อเมื่อส่ง `?mine=1` — ดู describe `?mine=1` ล่างสุด)
    expect(res.data.map((a) => a.name)).toEqual(["POS", "CRM"]);
    expect(res.data[0].companies.map((c) => c.id)).toEqual([1]);
    // CRM มีแค่แถวของบริษัท 2 → ของบริษัท 1 ไม่มีให้เห็น
    expect(res.data[1].companies).toEqual([]);
    // และห้ามไป reconcile แถวของบริษัทอื่น (ไม่งั้นการเปิดหน้าลูกค้าจะยิง
    // กระดิ่ง "ใกล้หมดอายุ" ของบริษัทอื่นด้วย)
    expect(expiry.reconcile).toHaveBeenCalledTimes(1);
    expect(expiry.reconcile.mock.calls[0][0].companyId).toBe(1);
  });

  it("own scope with NO company returns an empty page without touching the app table", async () => {
    const { service, apps, expiry } = makeService({
      apps: [POS, CRM],
      rows: [row({ id: 11, appId: 7, companyId: 1 })],
    });

    const res = await service.findAll(params, { contract: { mode: "own", companyId: null } });

    expect(res.data).toEqual([]);
    expect(res.total).toBe(0);
    // ไม่ query รายการแอปเลย และไม่ reconcile อะไรทั้งสิ้น
    expect(apps.find).not.toHaveBeenCalled();
    expect(apps.createQueryBuilder).not.toHaveBeenCalled();
    expect(expiry.reconcile).not.toHaveBeenCalled();
  });

  it("none scope strips every contract row while the app list stays complete (ฟอร์มแจ้งปัญหา)", async () => {
    const { service, expiry } = makeService({
      apps: [POS, CRM],
      rows: [
        row({ id: 11, appId: 7, companyId: 1 }),
        row({ id: 12, appId: 11, companyId: 2 }),
      ],
    });

    const res = await service.findAll(params, {
      contract: { mode: "none", companyId: null },
    });

    // ชื่อแอปยังครบ (ไม่ส่ง `mine` → ไม่กรอง — ฟอร์มส่ง `mine=1` จึงจะกรอง)
    // แต่**ทุกแถวสัญญาหายหมด**
    expect(res.data.map((a) => a.name)).toEqual(["POS", "CRM"]);
    expect(res.data.every((a) => a.companies.length === 0)).toBe(true);
    expect(expiry.reconcile).not.toHaveBeenCalled();
  });

  it("all scope is untouched — แอดมิน/โปรแกรมเมอร์ยังเห็นทุกบริษัท", async () => {
    const { service, expiry } = makeService({
      apps: [POS],
      rows: [row({ id: 11, appId: 7, companyId: 1 })],
    });

    const res = await service.findAll(params, { contract: { mode: "all", companyId: null } });

    expect(res.data[0].companies.map((c) => c.id)).toEqual([1]);
    expect(expiry.reconcile).toHaveBeenCalledTimes(1);
  });
});

/**
 * **ธง `maExpired`** — ฟอร์มแจ้งปัญหา (`/issues/new`) บล็อกการแจ้งเมื่อ "คู่ของ
 * ผู้เรียก" หมดอายุ แต่ `GET /apps` ของลูกค้าถูกตัด `companies` ทิ้งหมด
 * (`viewer-scope.ts`) → เซิร์ฟเวอร์จึงคำนวณเป็น boolean ส่งกลับไปแทน
 * (ไม่มีวันที่/ชั่วโมงรั่วออกมา และไม่ reconcile อะไรทั้งสิ้น)
 */
describe("AppsService.findAll — maExpired (บล็อกฟอร์มแจ้งปัญหา)", () => {
  const params = { page: 1, limit: 100 };
  /** วันหมดอายุในอดีต/อนาคตแบบตายตัว — ไม่เน่าตามเวลาที่เทสต์รัน */
  const PAST = "2020-01-01";
  const FUTURE = "2999-12-31";
  /** `GET /apps` ของลูกค้า = `viewerScope(user, "none")` — ยังคง `companyId` ด้วย */
  const reportScope = (companyId: number | null) => ({ mode: "none" as const, companyId });

  it("none scope raises the flag for the caller's expired pair while stripping every row", async () => {
    const { service, expiry } = makeService({
      apps: [POS, CRM],
      rows: [row({ id: 11, appId: 7, companyId: 1, expiresAt: PAST })],
    });

    const res = await service.findAll(params, { contract: reportScope(1) });

    const pos = res.data.find((a) => a.name === "POS")!;
    const crm = res.data.find((a) => a.name === "CRM")!;
    expect(pos.maExpired).toBe(true);
    // ไม่มีแถวคู่ของแอปนี้ → fail-open (ไม่บล็อก)
    expect(crm.maExpired).toBe(false);
    // ยังคงไม่คืนแถวสัญญา (ข้อตกลง viewer-scope) และไม่ reconcile อะไรเลย
    expect(res.data.every((a) => a.companies.length === 0)).toBe(true);
    expect(expiry.reconcile).not.toHaveBeenCalled();
  });

  it("a foreign company's expiry never flags the caller's list (ไม่บล็อกคนอื่น)", async () => {
    const { service } = makeService({
      apps: [POS],
      rows: [row({ id: 11, appId: 7, companyId: 2, expiresAt: PAST })],
    });

    const res = await service.findAll(params, { contract: reportScope(1) });

    expect(res.data[0].maExpired).toBe(false);
  });

  it("only the LATEST period counts — an old expired row with a renewal is not expired", async () => {
    const { service } = makeService({
      apps: [POS],
      rows: [
        row({ id: 11, appId: 7, companyId: 1, expiresAt: PAST }), // ช่วงเก่า หมดอายุ
        row({ id: 12, appId: 7, companyId: 1, expiresAt: FUTURE }), // เพิ่งต่ออายุ
      ],
    });

    const res = await service.findAll(params, { contract: reportScope(1) });

    expect(res.data[0].maExpired).toBe(false);

    // กลับด้าน: ช่วง**ใหม่**หมดอายุ → ต้องบล็อก (แม้ช่วงแรกยังไม่หมดก็ตาม)
    const { service: renewed } = makeService({
      apps: [POS],
      rows: [
        row({ id: 11, appId: 7, companyId: 1, expiresAt: FUTURE }),
        row({ id: 12, appId: 7, companyId: 1, expiresAt: PAST }),
      ],
    });
    const res2 = await renewed.findAll(params, { contract: reportScope(1) });
    expect(res2.data[0].maExpired).toBe(true);
  });

  it("expires TODAY counts as expired (<= 0) and a missing date fails open", async () => {
    const { service } = makeService({
      apps: [POS, CRM],
      rows: [
        row({ id: 11, appId: 7, companyId: 1, expiresAt: todayIso() }), // หมดอายุวันนี้พอดี
        row({ id: 12, appId: 11, companyId: 1, expiresAt: null }), // ไม่กรอกวัน
      ],
    });

    const res = await service.findAll(params, { contract: reportScope(1) });

    expect(res.data.find((a) => a.name === "POS")!.maExpired).toBe(true);
    expect(res.data.find((a) => a.name === "CRM")!.maExpired).toBe(false);
  });

  it("staff (`all`) never gets the flag; a company-less customer gets an empty page", async () => {
    const { service } = makeService({
      apps: [POS],
      rows: [row({ id: 11, appId: 7, companyId: 1, expiresAt: PAST })],
    });

    const res = await service.findAll(params, { contract: { mode: "all", companyId: null } });

    expect(res.data[0].maExpired).toBe(false);

    // ลูกค้าไม่มีบริษัท (`own` + null) → หน้าว่างตามเดิม ไม่มีทางได้ true
    const { service: noCompany } = makeService({
      apps: [POS],
      rows: [row({ id: 11, appId: 7, companyId: 1, expiresAt: PAST })],
    });
    const res2 = await noCompany.findAll(params, { contract: { mode: "own", companyId: null } });
    expect(res2.data).toEqual([]);
  });

  it("`own` scope (หน้า /systems ของลูกค้า) carries the same flag", async () => {
    const { service } = makeService({
      apps: [POS],
      rows: [row({ id: 11, appId: 7, companyId: 1, expiresAt: PAST })],
    });

    const res = await service.findAll(params, { contract: { mode: "own", companyId: 1 } });

    expect(res.data[0].maExpired).toBe(true);
  });
});

/**
 * `isPairExpired()` — จุดถามของ `IssuesService.update()` (ตาข่าย "MA หมดอายุ →
 * รับงาน MA/Requirement ไม่ได้") ต้องตอบ**ตรงกับธง `maExpired`** เป๊ะ เพราะ
 * ทั้งคู่ใช้ `isPeriodExpired()` ตัวเดียวกัน (วันหมดอายุวันนี้ = หมดอายุ)
 */
describe("AppsService.isPairExpired — ตาข่ายตอนทีมตั้งประเภทงาน", () => {
  const PAST = "2020-01-01";
  const FUTURE = "2999-12-31";

  it("true when the pair's LATEST period is past expiry", async () => {
    const { service } = makeService({
      rows: [row({ id: 11, appId: 7, companyId: 1, expiresAt: PAST })],
    });

    expect(await service.isPairExpired(7, 1)).toBe(true);
  });

  it("false when a renewal sits on top of an old expired period (ช่วงล่าสุดชนะ)", async () => {
    const { service } = makeService({
      rows: [
        row({ id: 11, appId: 7, companyId: 1, expiresAt: PAST }),
        row({ id: 12, appId: 7, companyId: 1, expiresAt: FUTURE }),
      ],
    });

    expect(await service.isPairExpired(7, 1)).toBe(false);
  });

  it("false for a pair with no row, a missing date, or another company's row", async () => {
    const { service, expiry } = makeService({
      rows: [
        row({ id: 11, appId: 7, companyId: 2, expiresAt: PAST }), // ของบริษัทอื่น
        row({ id: 12, appId: 11, companyId: 1, expiresAt: null }), // ไม่กรอกวัน
      ],
    });

    expect(await service.isPairExpired(7, 1)).toBe(false); // คู่นี้ไม่มีแถว
    expect(await service.isPairExpired(11, 1)).toBe(false); // มีแถวแต่ไม่กรอกวัน
    // อ่านอย่างเดียว — ไม่ reconcile ไม่ยิงกระดิ่ง (หน้าที่ cron 09:00)
    expect(expiry.reconcile).not.toHaveBeenCalled();
  });

  it("false without an app or a company — and never queries (fail-open)", async () => {
    const { service, appCompanies } = makeService({
      rows: [row({ id: 11, appId: 7, companyId: 1, expiresAt: PAST })],
    });

    expect(await service.isPairExpired(null, 1)).toBe(false);
    expect(await service.isPairExpired(7, null)).toBe(false);
    expect(appCompanies.findOne).not.toHaveBeenCalled();
  });
});

describe("AppsService.cancelContract / restoreContract — ยกเลิกทั้งคู่, ย้อนได้", () => {
  it("stamps cancelledAt on EVERY row of the pair, not just the pointed one", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [
        row({ id: 10, appId: 7, companyId: 1 }),
        row({ id: 11, appId: 7, companyId: 1 }),
        row({ id: 12, appId: 7, companyId: 2 }),
        row({ id: 13, appId: 11, companyId: 1 }),
      ],
    });

    const payload = await service.cancelContract(7, 10);

    expect(state.rows.slice(0, 2).every((r) => r.cancelledAt instanceof Date)).toBe(true);
    // คู่อื่น/แอปอื่นไม่ถูกแตะ
    expect(state.rows[2].cancelledAt).toBeNull();
    expect(state.rows[3].cancelledAt).toBeNull();
    expect(payload.companies[0].cancelledAt).toEqual(expect.any(String));
  });

  it("restore clears every row of the pair and keeps the old latches (no double bell)", async () => {
    const stamp = new Date("2026-11-20T00:00:00Z");
    const { service, state } = makeService({
      apps: [POS],
      rows: [
        row({
          id: 10,
          appId: 7,
          companyId: 1,
          cancelledAt: stamp,
          expiryNotified: "d30",
          maNotifiedAt: stamp,
        }),
        row({ id: 11, appId: 7, companyId: 1, cancelledAt: stamp }),
      ],
    });

    await service.restoreContract(7, 11);

    expect(state.rows.every((r) => r.cancelledAt === null)).toBe(true);
    expect(state.rows[0].expiryNotified).toBe("d30");
    expect(state.rows[0].maNotifiedAt).toBe(stamp);
  });

  it("rejects an unknown app or a record belonging to another app", async () => {
    const { service } = makeService({
      apps: [POS],
      rows: [row({ id: 10, appId: 7, companyId: 1 })],
    });
    await expect(service.cancelContract(999, 10)).rejects.toThrow(NotFoundException);
    await expect(service.cancelContract(11, 10)).rejects.toThrow(NotFoundException);
    await expect(service.restoreContract(7, 999)).rejects.toThrow(NotFoundException);
  });
});

describe("viewerScope — role customer เท่านั้นที่ถูกจำกัด", () => {
  const user = (roleName: string | null, companyId: number | null): AuthUser => ({
    id: "1",
    email: "x@example.com",
    name: "X",
    roleId: 1,
    roleName,
    positionId: null,
    companyId,
  });

  it("a customer is scoped to their own company (own mode)", () => {
    expect(viewerScope(user("customer", 6), "own")).toEqual({ mode: "own", companyId: 6 });
    expect(viewerScope(user("customer", null), "none")).toEqual({ mode: "none", companyId: null });
  });

  it("every other role gets `all` — the requested mode is ignored", () => {
    expect(viewerScope(user("admin", null), "own")).toEqual({ mode: "all", companyId: null });
    expect(viewerScope(user("programmer", 9), "none")).toEqual({ mode: "all", companyId: null });
    expect(viewerScope(user(null, 9), "own")).toEqual({ mode: "all", companyId: null });
  });
});
