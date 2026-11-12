import { NotFoundException } from "@nestjs/common";
import { MaUsageService } from "../modules/apps/ma-usage.service";
import { pickPeriodId, type PeriodRow } from "../modules/apps/ma-attribution";

/**
 * การผูกชั่วโมงเข้า **รอบ** สัญญา + invariant ที่ `/systems` กับรายงานพึ่ง —
 * in-memory stubs ล้วน ไม่มี DB ไม่มี Nest testing module รันคู่กับ `npm run dev` ได้
 *
 * คุมไว้ 4 เรื่อง:
 *
 * 1. **กติกาผูก** (`pickPeriodId`) — ชั่วโมงเป็นของแถวที่ `created_at <= เวลากรอก`
 *    แล้วเอา `created_at` มากสุด (เสมอ → `id` มากสุด)
 * 2. **ต่ออายุไม่ขโมยชั่วโมงเก่า** / **แถว `buy` ที่สร้างทีหลังไม่ขโมยของก่อนหน้า**
 * 3. **Invariant**: `Σ(periodUsedHours ทุกรอบ) + unattributedHours = pairUsedHours`
 *    (ตัวเดียวกับ "ใช้ไป" ที่หน้าจอโชว์ — ถ้าใครทำให้ผลรวมชนกัน เทสต์นี้งอก)
 * 4. **ไม่เดา** — `actual_fix_at` เป็น `NULL` / อยู่ก่อนรอบแรก → ไม่ระบุรอบเสมอ
 */

const HOUR = 3600;

/* ------------------------------- fixtures ------------------------------- */

interface PeriodFixture extends PeriodRow {
  appId: number;
  companyId: number;
  startedAt: Date | string | null;
  expiresAt: Date | string | null;
  maHours: number | null;
  kind: "renew" | "buy";
}

interface DeductionFixture {
  id: number;
  appId: number;
  companyId: number;
  seconds: number;
  /** `null` = ข้อมูลก่อนระบบ */
  at: string | null;
}

interface IssueFixture {
  id: number;
  issueNumber: string | null;
  title: string;
  taskType: string | null;
  actualFixDuration: number | null;
  actualFixAt: Date | null;
  status?: { name: string } | null;
  programmer?: { name: string } | null;
}

function period(overrides: Partial<PeriodFixture>): PeriodFixture {
  return {
    id: 100,
    appId: 7,
    companyId: 3,
    createdAt: "2026-01-01T00:00:00Z",
    startedAt: "2026-01-01",
    expiresAt: "2026-12-31",
    maHours: 40,
    kind: "renew",
    ...overrides,
  };
}

function makeService(periods: PeriodFixture[], deductions: DeductionFixture[]) {
  /** แถวที่ `loadIssues` คืน — ดึงจาก deductions ให้ตรง id เสมอ */
  const issueRows: IssueFixture[] = deductions.map((d) => ({
    id: d.id,
    issueNumber: `#${d.id}`,
    title: `งาน ${d.id}`,
    taskType: "ma",
    actualFixDuration: d.seconds,
    actualFixAt: d.at == null ? null : new Date(d.at),
    status: { name: "กำลังดำเนินการ" },
    programmer: { name: "โปรแกรมเมอร์" },
  }));

  const links = {
    findOne: jest.fn(async (opts: { where: { id: number } }) => {
      const found = periods.find((p) => p.id === opts.where.id);
      return found ? { ...found } : null;
    }),
    // เรียก 3 แบบ: array (OR ของหลายคู่ — usageCounts), `id: In(...)` (lookup แถว),
    // หรือ object คู่เดียว (periodUsage)
    find: jest.fn(async (opts: { where: unknown }) => {
      const where = opts.where;
      if (Array.isArray(where)) {
        return periods
          .filter((p) => where.some((w) => w.appId === p.appId && w.companyId === p.companyId))
          .map((p) => ({ ...p }));
      }
      const w = where as { appId?: number; companyId?: number; id?: unknown };
      let rows = periods;
      if (w.id !== undefined) {
        const raw = w.id as unknown;
        const ids: number[] = Array.isArray(raw)
          ? raw
          : ((raw as { value?: number[] }).value ?? []);
        rows = rows.filter((p) => ids.includes(p.id));
      } else {
        rows = rows.filter(
          (p) =>
            (w.appId === undefined || p.appId === w.appId) &&
            (w.companyId === undefined || p.companyId === w.companyId),
        );
      }
      return rows.map((p) => ({ ...p }));
    }),
    update: jest.fn(async () => undefined),
  };

  /** fake QB ของ `deductionRows` — คืนทุกแถว (service กรองคู่ใน JS เอง) */
  const qb = {
    leftJoin: jest.fn((): unknown => qb),
    where: jest.fn((): unknown => qb),
    andWhere: jest.fn((): unknown => qb),
    select: jest.fn((): unknown => qb),
    addSelect: jest.fn((): unknown => qb),
    getRawMany: jest.fn(async () =>
      deductions.map((d) => ({
        id: String(d.id),
        app_id: String(d.appId),
        company_id: String(d.companyId),
        seconds: String(d.seconds),
        at: d.at,
      })),
    ),
  };

  const issues = {
    createQueryBuilder: jest.fn(() => qb),
    /** `loadIssues` — `In(ids)` ของ TypeORM เป็น FindOperator มี `.value` */
    find: jest.fn(async (opts: { where: { id: unknown } }) => {
      const raw = opts.where.id as unknown;
      const ids: number[] = Array.isArray(raw)
        ? raw
        : ((raw as { value?: number[] }).value ?? []);
      return issueRows
        .filter((row) => ids.includes(row.id))
        .map((row) => ({ ...row }));
    }),
  };

  const service = new MaUsageService(
    links as unknown as never,
    { findOne: jest.fn() } as unknown as never,
    { findOne: jest.fn() } as unknown as never,
    issues as unknown as never,
    { findOne: jest.fn() } as unknown as never,
    { notifyMaDepleted: jest.fn() } as unknown as never,
  );

  return { service };
}

/* --------------------------- กติกาผูก (pure) --------------------------- */

describe("pickPeriodId — รอบที่มีผล ณ ตอนกรอกชั่วโมง", () => {
  const round1: PeriodRow = { id: 10, createdAt: "2026-01-01T00:00:00Z" };
  const round2: PeriodRow = { id: 20, createdAt: "2026-06-01T00:00:00Z" };

  it("คืน null เมื่อไม่มีเวลา (ข้อมูลก่อนระบบ) หรือไม่มีแถวเลย", () => {
    expect(pickPeriodId([round1], null)).toBeNull();
    expect(pickPeriodId([round1], undefined)).toBeNull();
    expect(pickPeriodId([], "2026-07-01T00:00:00Z")).toBeNull();
  });

  it("คืน null เมื่อยังไม่มีแถวไหนถูกสร้างก่อนเวลานั้น", () => {
    expect(pickPeriodId([round1], "2025-12-31T23:59:59Z")).toBeNull();
  });

  it("เลือกแถวที่ถูกสร้างแล้ว ณ เวลานั้น — ไปไม่ถึงแถวที่ยังไม่มีตัวตน", () => {
    expect(pickPeriodId([round1, round2], "2026-03-01T00:00:00Z")).toBe(10);
    expect(pickPeriodId([round1, round2], "2026-07-01T00:00:00Z")).toBe(20);
  });

  it("เวลาเท่ากันพอดีที่แถวใหม่ถูกสร้าง → ถือว่าแถวนั้นมีผลแล้ว", () => {
    expect(pickPeriodId([round1, round2], "2026-06-01T00:00:00Z")).toBe(20);
  });

  it("สร้างเวลาเดียวกัน → ใช้ id มากสุดตัด (tie-break)", () => {
    const a: PeriodRow = { id: 1, createdAt: "2026-01-01T00:00:00Z" };
    const b: PeriodRow = { id: 2, createdAt: "2026-01-01T00:00:00Z" };
    expect(pickPeriodId([a, b], "2026-02-01T00:00:00Z")).toBe(2);
  });

  it("`createdAt` พัง → แถวนั้นถูกตัดทิ้ง ไม่ถูกเดาให้เป็นเจ้าของ", () => {
    const broken: PeriodRow = { id: 99, createdAt: "not-a-date" };
    expect(pickPeriodId([broken, round1], "2026-07-01T00:00:00Z")).toBe(10);
  });
});

/* ------------------------- periodUsage / invariant ------------------------- */

describe("MaUsageService.periodUsage — ผูกเข้ารอบ + invariant", () => {
  /** คู่เดียว 2 รอบ + ชั่วโมงที่กระจัดอยู่ 3 ที่ (รอบ1 / รอบ2 / ไม่ระบุ) */
  const periods = [
    period({ id: 100, createdAt: "2026-01-01T00:00:00Z", maHours: 40 }),
    period({ id: 200, createdAt: "2026-06-01T00:00:00Z", maHours: 50 }),
  ];
  const deductions: DeductionFixture[] = [
    { id: 1, appId: 7, companyId: 3, seconds: 30 * HOUR, at: "2026-03-01T00:00:00Z" },
    { id: 2, appId: 7, companyId: 3, seconds: 10 * HOUR, at: "2026-07-01T00:00:00Z" },
    { id: 3, appId: 7, companyId: 3, seconds: 5 * HOUR, at: null },
  ];

  it("รอบ 1 ได้เฉพาะชั่วโมงที่กรอกก่อนรอบ 2 ถูกสร้าง", async () => {
    const { service } = makeService(periods, deductions);
    const result = await service.periodUsage(7, 100);

    expect(result.round).toBe(1);
    expect(result.periodUsedHours).toBe(30);
    expect(result.count).toBe(1);
    expect(result.issues.map((i) => i.id)).toEqual([1]);
    expect(result.issues[0]).toMatchObject({
      issueNumber: "#1",
      taskType: "ma",
      hours: 30,
      statusName: "กำลังดำเนินการ",
      assigneeName: "โปรแกรมเมอร์",
    });
  });

  it("รอบ 2 ได้เฉพาะชั่วโมงที่กรอกหลังรอบ 2 ถูกสร้าง", async () => {
    const { service } = makeService(periods, deductions);
    const result = await service.periodUsage(7, 200);

    expect(result.round).toBe(2);
    expect(result.periodUsedHours).toBe(10);
    expect(result.count).toBe(1);
    expect(result.maHours).toBe(50);
  });

  it("INVARIANT — ทุกรอบ + ไม่ระบุรอบ = ใช้ไปทั้งคู่ (ตัวเดียวกับที่จอโชว์)", async () => {
    const { service } = makeService(periods, deductions);

    const r1 = await service.periodUsage(7, 100);
    const r2 = await service.periodUsage(7, 200);

    // ทุกแถวต้องรายงาน `pairUsedHours` ชุดเดียวกัน
    expect(r1.pairUsedHours).toBe(45);
    expect(r2.pairUsedHours).toBe(45);
    expect(r1.unattributedHours).toBe(5);
    expect(r2.unattributedHours).toBe(5);

    expect(r1.periodUsedHours + r2.periodUsedHours + r1.unattributedHours).toBe(
      r1.pairUsedHours,
    );
  });

  it("โยน 404 เมื่อ recordId ไม่ใช่ของแอปที่ขอ (กันอ่านข้ามคู่)", async () => {
    const { service } = makeService(periods, deductions);
    await expect(service.periodUsage(99, 100)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("คืนรายการว่าง + count 0 เมื่อทุกชั่วโมงถูกกรอกก่อนรอบนี้ถูกสร้าง", async () => {
    const { service } = makeService(
      [period({ id: 300, createdAt: "2026-08-01T00:00:00Z" })],
      deductions,
    );
    const result = await service.periodUsage(7, 300);

    expect(result.count).toBe(0);
    expect(result.periodUsedHours).toBe(0);
    expect(result.issues).toEqual([]);
    // ชั่วโมงทั้ง 45 ชม. กรอกก่อนรอบนี้มีตัวตน → ตกเป็น "ไม่ระบุรอบ" ทั้งหมด
    // (ไม่ถูกเดาใส่รอบ 300) แต่ยอดรวมของคู่ยังครบตาม invariant
    expect(result.pairUsedHours).toBe(45);
    expect(result.unattributedHours).toBe(45);
    expect(result.periodUsedHours + result.unattributedHours).toBe(result.pairUsedHours);
  });
});

/* ------------------------- แถว buy ไม่ขโมยของก่อนหน้า ------------------------- */

describe("MaUsageService.periodUsage — แถวซื้อชั่วโมง (kind = buy)", () => {
  const periods = [
    period({ id: 100, createdAt: "2026-01-01T00:00:00Z", maHours: 40 }),
    // คัดลอกวันที่มาเป๊ะ แต่ถูกสร้างทีหลัง — แยกรอบจากวันที่ไม่ได้
    period({ id: 200, kind: "buy", createdAt: "2026-06-01T00:00:00Z", maHours: 60 }),
  ];
  const deductions: DeductionFixture[] = [
    { id: 1, appId: 7, companyId: 3, seconds: 10 * HOUR, at: "2026-03-01T00:00:00Z" },
    { id: 2, appId: 7, companyId: 3, seconds: 7 * HOUR, at: "2026-06-15T00:00:00Z" },
  ];

  it("ชั่วโมงก่อนซื้อยังอยู่รอบแรก ชั่วโมงหลังซื้อไปอยู่แถว buy", async () => {
    const { service } = makeService(periods, deductions);

    const before = await service.periodUsage(7, 100);
    const after = await service.periodUsage(7, 200);

    expect(before.periodUsedHours).toBe(10);
    expect(before.count).toBe(1);
    expect(after.periodUsedHours).toBe(7);
    expect(after.count).toBe(1);
    expect(after.kind).toBe("buy");
    expect(before.periodUsedHours + after.periodUsedHours).toBe(before.pairUsedHours);
  });
});

/* ----------------------------- usageCounts (batch) ----------------------------- */

describe("MaUsageService.usageCounts — นับหลายรอบครั้งเดียว", () => {
  const periods = [
    period({ id: 100, createdAt: "2026-01-01T00:00:00Z" }),
    period({ id: 200, createdAt: "2026-06-01T00:00:00Z" }),
  ];
  const deductions: DeductionFixture[] = [
    { id: 1, appId: 7, companyId: 3, seconds: 30 * HOUR, at: "2026-03-01T00:00:00Z" },
    { id: 2, appId: 7, companyId: 3, seconds: 10 * HOUR, at: "2026-07-01T00:00:00Z" },
    { id: 3, appId: 7, companyId: 3, seconds: 5 * HOUR, at: null },
  ];

  it("คืนเฉพาะแถวที่มีจริง — id ที่ไม่มีใน DB ไม่ถูกเดาเป็น 0 (เว็บอ่านเป็น `—`)", async () => {
    const { service } = makeService(periods, deductions);
    const counts = await service.usageCounts([100, 200, 999]);

    const byId = new Map(counts.map((c) => [c.recordId, c]));
    expect(byId.get(100)).toEqual({ recordId: 100, count: 1, periodUsedHours: 30 });
    expect(byId.get(200)).toEqual({ recordId: 200, count: 1, periodUsedHours: 10 });
    // ไม่มี entry = "ไม่รู้" → ฝั่งเว็บโชว์ `—` (ห้ามโชว์ "0 รายการ" เพราะนั่นคือการโกง)
    expect(byId.has(999)).toBe(false);
    expect(counts).toHaveLength(2);
  });

  it("รวม id ซ้ำและคัด id ที่ไม่ใช่จำนวนเต็มบวกทิ้ง", async () => {
    const { service } = makeService(periods, deductions);
    const counts = await service.usageCounts([100, 100, -1, Number.NaN]);

    expect(counts).toHaveLength(1);
    expect(counts[0].recordId).toBe(100);
  });

  it("ไม่ยิง query เลยเมื่อไม่มี recordId (หน้ารายงานยังไม่มีแถว)", async () => {
    const { service } = makeService(periods, deductions);
    await expect(service.usageCounts([])).resolves.toEqual([]);
  });
});
