import { UsersService } from "../modules/users/users.service";

/**
 * `GET /users` filters (บริษัท / บทบาท / ตำแหน่ง) — the three sections of the
 * filter popover on the user-management page. Each filter is a multi-select, so
 * the service receives **arrays** and turns them into `IN (...)` clauses.
 *
 * The query builder chain is stubbed so each WHERE clause can be asserted
 * without a database, and so the suite stays safe to run while `npm run dev`
 * is up.
 */

interface QbStub {
  leftJoinAndSelect: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  getMany: jest.Mock;
}

function qbStub(rows: Record<string, unknown>[] = []): QbStub {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
}

type ServiceArgs = ConstructorParameters<typeof UsersService>;

function makeService(rows: Record<string, unknown>[] = []) {
  const qb = qbStub(rows);
  const users = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
  const service = new UsersService(...([users, {}, {}, {}] as unknown as ServiceArgs));
  return { service, qb };
}

const USER = {
  id: 7,
  email: "x@example.com",
  name: "X",
  roleId: 2,
  positionId: 3,
  companyId: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("UsersService.findAll — filters", () => {
  it("adds no WHERE clause when no filter is sent", async () => {
    const { service, qb } = makeService([USER]);

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(qb.andWhere).not.toHaveBeenCalled();
    expect(result).toMatchObject({ total: 1, page: 1, limit: 10, totalPages: 1 });
    expect(result.data).toHaveLength(1);
  });

  it("filters by company / role / position when ids are sent", async () => {
    const { service, qb } = makeService([USER]);

    await service.findAll({ page: 1, limit: 10 }, { companyIds: [4], roleIds: [2], positionIds: [3] });

    expect(qb.andWhere).toHaveBeenCalledWith("user.companyId IN (:...companyIds)", {
      companyIds: [4],
    });
    expect(qb.andWhere).toHaveBeenCalledWith("user.roleId IN (:...roleIds)", { roleIds: [2] });
    expect(qb.andWhere).toHaveBeenCalledWith("user.positionId IN (:...positionIds)", {
      positionIds: [3],
    });
  });

  it("ORs a multi-select of ids inside one IN clause", async () => {
    const { service, qb } = makeService([USER]);

    await service.findAll({ page: 1, limit: 10 }, { roleIds: [1, 2, 3] });

    expect(qb.andWhere).toHaveBeenCalledTimes(1);
    expect(qb.andWhere).toHaveBeenCalledWith("user.roleId IN (:...roleIds)", {
      roleIds: [1, 2, 3],
    });
  });

  it("stays unfiltered for undefined and empty arrays (fail-open)", async () => {
    const { service, qb } = makeService([USER]);

    await service.findAll({ page: 1, limit: 10 }, {});
    await service.findAll({ page: 1, limit: 10 }, {
      companyIds: [],
      roleIds: [],
      positionIds: [],
    });

    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it("maps the joined role / position / company names onto the row", async () => {
    const { service } = makeService([
      {
        ...USER,
        role: { name: "customer" },
        position: { name: "Frontend" },
        company: { name: "ACME" },
      },
    ]);

    const result = await service.findAll({ page: 1, limit: 10 });

    expect(result.data[0]).toMatchObject({
      id: "7",
      roleName: "customer",
      positionName: "Frontend",
      companyName: "ACME",
    });
  });

  it("slices the requested page out of the full list", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ ...USER, id: i + 1 }));
    const { service } = makeService(rows);

    const page2 = await service.findAll({ page: 2, limit: 2 });

    expect(page2.data.map((u) => u.id)).toEqual(["3"]);
    expect(page2).toMatchObject({ total: 3, totalPages: 2, page: 2, limit: 2 });
  });
});
