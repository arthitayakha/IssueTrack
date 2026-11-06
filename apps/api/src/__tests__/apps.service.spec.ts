import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { AppsService } from "../modules/apps/apps.service";

/**
 * AppsService with in-memory stub repositories — no database, no Nest testing
 * module, safe to run next to a live `npm run dev`.
 *
 * Guards the contract the `/systems` page relies on after migration 1812
 * (surrogate key → **1 คู่ มีได้หลายแถว**):
 *
 * - `addRecord()` **appends** — adding the same app×company pair a second time
 *   must create a *new* row and leave the old one untouched (the whole point
 *   of "เพิ่มข้อมูลใหม่ โดยให้ข้อมูลเก่าอยู่ของมัน")
 * - `updateRecord()` / `removeRecord()` touch **exactly one row**, and only
 *   when that row belongs to the app in the path (no cross-app editing)
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
    findOne: jest.fn().mockImplementation((opts: { where: Partial<AppRow> }) => {
      const { id, name } = opts.where;
      const found = state.apps.find(
        (a) => (id === undefined || a.id === id) && (name === undefined || a.name === name),
      );
      return Promise.resolve(found ? { ...found } : null);
    }),
    create: jest.fn().mockImplementation((value: Partial<AppRow>) => value),
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
    find: jest
      .fn()
      .mockImplementation((opts?: { where?: { appId?: number } }) => {
        const appId = opts?.where?.appId;
        const list =
          typeof appId === "number"
            ? state.rows.filter((r) => r.appId === appId)
            : state.rows;
        return Promise.resolve(list.map((r) => ({ ...r })));
      }),
    findOne: jest.fn().mockImplementation((opts: { where: { id: number } }) => {
      const found = state.rows.find((r) => r.id === opts.where.id);
      return Promise.resolve(found ? { ...found } : null);
    }),
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
    delete: jest.fn().mockImplementation((where: { id: number }) => {
      state.rows = state.rows.filter((r) => r.id !== where.id);
      return Promise.resolve();
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

  const service = new AppsService(
    apps as unknown as never,
    appCompanies as unknown as never,
    issues as unknown as never,
    companies as unknown as never,
    expiry as unknown as never,
  );

  return { service, apps, appCompanies, expiry, state };
}

const POS: AppRow = { id: 7, name: "POS", isVisible: true };

describe("AppsService.addRecord — append, never overwrite", () => {
  it("creates a new row for a pair that already has one (ช่วงใหม่ไม่เขียนทับช่วงเก่า)", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, companyId: 1, maHours: 40, expiresAt: "2026-11-08" })],
    });

    await service.addRecord(7, { companyId: 1, maHours: 60, expiresAt: "2027-11-08" });

    expect(state.rows).toHaveLength(2);
    // the old period is byte-for-byte untouched
    expect(state.rows[0]).toMatchObject({ id: 11, companyId: 1, maHours: 40, expiresAt: "2026-11-08" });
    expect(state.rows[1]).toMatchObject({ companyId: 1, maHours: 60, expiresAt: "2027-11-08" });
    expect(state.rows[1].id).not.toBe(11);
  });

  it("rejects an app that does not exist", async () => {
    const { service, state } = makeService({ apps: [POS] });

    await expect(service.addRecord(999, { companyId: 1 })).rejects.toThrow(NotFoundException);
    expect(state.rows).toHaveLength(0);
  });

  it("rejects a company that does not exist and writes nothing", async () => {
    const { service, state } = makeService({ apps: [POS] });

    await expect(service.addRecord(7, { companyId: 999 })).rejects.toThrow(BadRequestException);
    await expect(service.addRecord(7, {})).rejects.toThrow(BadRequestException);
    expect(state.rows).toHaveLength(0);
  });

  it("normalizes the dates and hours before they reach the row", async () => {
    const { service, state } = makeService({ apps: [POS] });

    await service.addRecord(7, {
      companyId: 2,
      startedAt: "",
      expiresAt: "2027-01-01",
      maHours: "12",
    });

    expect(state.rows[0]).toMatchObject({
      startedAt: null,
      expiresAt: "2027-01-01",
      maHours: 12,
      // a fresh row starts with no announcements to its name
      expiryStatus: "none",
      expiryNotified: "none",
    });
  });

  it("rejects a bad date and a negative/non-integer hour count", async () => {
    const { service, state } = makeService({ apps: [POS] });

    await expect(
      service.addRecord(7, { companyId: 1, expiresAt: "31/12/2027" }),
    ).rejects.toThrow(BadRequestException);
    await expect(service.addRecord(7, { companyId: 1, maHours: -1 })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.addRecord(7, { companyId: 1, maHours: 1.5 })).rejects.toThrow(
      BadRequestException,
    );
    expect(state.rows).toHaveLength(0);
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

describe("AppsService.removeRecord — deletes the row, not the app", () => {
  it("removes exactly one row and keeps the rest", async () => {
    const { service, state } = makeService({
      apps: [POS],
      rows: [row({ id: 11, companyId: 1 }), row({ id: 12, companyId: 2 })],
    });

    await expect(service.removeRecord(7, 11)).resolves.toEqual({ deleted: true });

    expect(state.rows.map((r) => r.id)).toEqual([12]);
    expect(state.apps).toHaveLength(1);
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
