import { ReportsService } from "../modules/reports/reports.service";

/**
 * `/reports` company filter — the บริษัท column of the "รายการปัญหา" view and
 * its filter both follow the **reporter** (`issues.customer_id` →
 * `users.company_id`), the same path the board uses (`issues.service.spec.ts`
 * → "the company filter follows the REPORTER").
 *
 * The old path (card → app → `app_companies`) listed every company linked to
 * the issue's app on each row, so one app tied to 3 companies showed all 3
 * names in every row — and filtering by a company returned the same cards for
 * every selection. The `company` (ตามบริษัท) view still reads `app_companies`
 * client-side; only these issue-shaped queries changed.
 *
 * Stubbed repositories only — safe to run while `npm run dev` is up.
 */

interface Stub {
  createQueryBuilder: jest.Mock;
}

function builder() {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };
}

/** One shared builder per service so every `andWhere` call is observable. */
function makeService() {
  const qb = builder();
  const issues: Stub = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  const comments: Stub = { createQueryBuilder: jest.fn().mockReturnValue(builder()) };
  const attachments: Stub = { createQueryBuilder: jest.fn().mockReturnValue(builder()) };
  const apps: Stub = { createQueryBuilder: jest.fn().mockReturnValue(builder()) };
  const permissions = { getUserPermissions: jest.fn().mockResolvedValue([]) };
  const service = new ReportsService(
    ...( [issues, comments, attachments, apps, permissions] as unknown as ConstructorParameters<
      typeof ReportsService
    > ),
  );

  /** Every `andWhere` the shared builder received (fresh per service). */
  const whereCalls = (): unknown[][] => qb.andWhere.mock.calls;

  return { service, qb, whereCalls };
}

describe("ReportsService — the company filter follows the REPORTER", () => {
  it("narrows to issues whose reporter belongs to a selected company", async () => {
    const { service, whereCalls } = makeService();

    await service.summary("person", { companyIds: [6] });

    const clause = whereCalls().find(([sql]) => String(sql).includes("u.company_id"));
    expect(clause).toBeDefined();
    const [sql, params] = clause as [string, Record<string, unknown>];
    // issue → reporter → company, NOT issue → app → app_companies
    expect(sql).toContain("u.id = issue.customer_id");
    expect(sql).toContain("u.company_id IN (:...companyIds)");
    expect(sql).not.toContain("app_companies");
    expect(params.companyIds).toEqual([6]);
  });

  it("adds no company clause without the filter", async () => {
    const { service, whereCalls } = makeService();

    await service.summary("person", {});

    // a reporter-less issue can never satisfy the EXISTS → it is hidden only
    // while a company is actually selected
    expect(whereCalls().some(([sql]) => String(sql).includes("u.company_id"))).toBe(false);
  });

  it("keeps every selected company in ONE clause (multi-select)", async () => {
    const { service, whereCalls } = makeService();

    await service.summary("person", { companyIds: [4, 6] });

    const clauses = whereCalls().filter(([sql]) => String(sql).includes("u.company_id"));
    expect(clauses).toHaveLength(1);
    expect((clauses[0] as [string, Record<string, unknown>])[1].companyIds).toEqual([4, 6]);
  });

  it("uses the same clause for every issue-shaped reader (usage included)", async () => {
    const { service, whereCalls } = makeService();

    await service.usageByPair({ companyIds: [6] });

    const clause = whereCalls().find(([sql]) => String(sql).includes("u.company_id"));
    expect(clause).toBeDefined();
    expect(String((clause as [string])[0])).toContain("u.company_id IN (:...companyIds)");
    expect(whereCalls().some(([sql]) => String(sql).includes("app_companies"))).toBe(false);
  });
});
