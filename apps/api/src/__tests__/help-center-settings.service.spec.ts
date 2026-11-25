import { BadRequestException } from "@nestjs/common";
import { HelpCenterSettingsService } from "../modules/help-center-settings/help-center-settings.service";

/**
 * ช่องทางติดต่อบน `/systems` — แอดมินเลือกโปรแกรมเมอร์ **รายบริษัท**
 * ไม่มีรายชื่อหลัก/ข้อมูลติดต่อกลางแล้ว · Spec ใช้ repository stub ล้วน →
 * ปลอดภัยรันคู่ `npm run dev`
 */

function user(id: number, name: string, isActive = true) {
  return { id, name, email: `${name.toLowerCase()}@x.com`, phone: null, isActive };
}

function makeService(opts: { row?: unknown; users?: unknown[]; usersError?: boolean } = {}) {
  const saved = jest.fn().mockImplementation(async (r) => r);
  const repo = {
    findOne: jest.fn().mockResolvedValue(opts.row ?? null),
    create: jest.fn().mockImplementation((v) => ({ ...v })),
    save: saved,
  };
  const users = {
    find: jest.fn().mockImplementation(() => {
      if (opts.usersError) throw new Error("db down");
      return Promise.resolve(opts.users ?? []);
    }),
  };
  const service = new HelpCenterSettingsService(repo as never, users as never);
  return { service, repo, users, saved };
}

describe("HelpCenterSettingsService — per-company contacts", () => {
  it("บริษัทที่ไม่มี mapping → contacts ว่าง (ไม่มี global fallback)", async () => {
    const { service } = makeService({ row: { id: 1, contactUsersByCompany: {} } });

    const result = await service.get(5);

    expect(result.contacts).toEqual([]);
    expect(result.updatedAt).toBeNull();
  });

  it("บริษัทที่มี mapping → resolve เป็นการ์ดตามลำดับที่เลือก", async () => {
    const { service } = makeService({
      row: { id: 1, contactUsersByCompany: { "2": [13, 23, 7] } },
      users: [user(7, "seven"), user(13, "programmer"), user(23, "b")],
    });

    const result = await service.get(2);

    expect(result.contacts.map((c) => c.userId)).toEqual([13, 23, 7]);
    expect(result.contacts[0]).toEqual({
      userId: 13,
      name: "programmer",
      email: "programmer@x.com",
      phone: null,
    });
  });

  it("คนที่ถูกปิด/ลบ/เปลี่ยน role ตกออกจากการ์ด (id ยังอยู่ใน config)", async () => {
    const { service } = makeService({
      row: { id: 1, contactUsersByCompany: { "2": [13, 22] } },
      users: [user(13, "programmer")],
    });

    const result = await service.get(2);

    expect(result.contacts.map((c) => c.userId)).toEqual([13]);
  });

  it("mapping เป็น array ว่าง → บริษัทนั้นไม่เห็นโปรแกรมเมอร์", async () => {
    const { service } = makeService({
      row: { id: 1, contactUsersByCompany: { "2": [] } },
      users: [user(13, "programmer")],
    });

    await expect(service.get(2)).resolves.toMatchObject({ contacts: [] });
  });

  it("lookup พัง → fail-open ได้การ์ดว่าง ไม่ทำให้หน้า /systems พัง", async () => {
    const { service } = makeService({
      row: { id: 1, contactUsersByCompany: { "2": [13] } },
      usersError: true,
    });

    await expect(service.get(2)).resolves.toMatchObject({ contacts: [] });
  });

  it("programmers() คืนเฉพาะโปรแกรมเมอร์ active สำหรับตัวเลือกใน dialog", async () => {
    const { service, users } = makeService({ users: [user(13, "programmer")] });

    await expect(service.programmers()).resolves.toEqual([
      { userId: 13, name: "programmer", email: "programmer@x.com", phone: null },
    ]);
    expect(users.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, role: { name: "programmer" } } }),
    );
  });

  it("config() คืนเฉพาะ mapping (ไม่มีรายชื่อหลัก/ข้อมูลกลาง)", async () => {
    const { service } = makeService({
      row: {
        id: 1,
        contactUsersByCompany: { "2": [23, 7, "oops"] },
      },
    });

    const result = await service.config();

    expect(result).toEqual({
      id: 1,
      contactUsersByCompany: { "2": [23, 7] },
      updatedAt: null,
    });
  });

  it("update() เก็บ mapping แบบตัดซ้ำ + เก็บ array ว่างไว้", async () => {
    const { service, saved } = makeService({ row: { id: 1, contactUsersByCompany: {} } });

    await service.update({ contactUsersByCompany: { "2": [23, 23], "3": [] } });

    const row = saved.mock.calls[0][0] as {
      contactUsersByCompany: Record<string, number[]>;
    };
    expect(row.contactUsersByCompany).toEqual({ "2": [23], "3": [] });
  });

  it("update() ปฏิเสธ company id/user id ที่เพี้ยน (400)", async () => {
    const { service } = makeService({ row: { id: 1, contactUsersByCompany: {} } });

    await expect(
      service.update({ contactUsersByCompany: { abc: [1] } }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.update({ contactUsersByCompany: { "2": [-1, 1.5] } }),
    ).rejects.toThrow(BadRequestException);
  });
});
