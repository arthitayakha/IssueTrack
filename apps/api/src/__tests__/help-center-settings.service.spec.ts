import { BadRequestException } from "@nestjs/common";
import { HelpCenterSettingsService } from "../modules/help-center-settings/help-center-settings.service";

/**
 * ช่องทางติดต่อบน `/systems` — แอดมินเลือกโปรแกรมเมอร์ได้หลายคน
 * Spec ใช้ repository stub ล้วน → ปลอดภัยรันคู่ `npm run dev`
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
  const service = new HelpCenterSettingsService(
    repo as never,
    users as never,
  );
  return { service, repo, users, saved };
}

describe("HelpCenterSettingsService — selected programmer contacts", () => {
  it("ไม่มีใครเลือก → contacts ว่าง + ใช้ข้อมูลติดต่อกลางเป็น fallback", async () => {
    const { service } = makeService({ row: { id: 1, contactUserIds: [] } });

    const result = await service.get();

    expect(result.contactUserIds).toEqual([]);
    expect(result.contacts).toEqual([]);
    expect(result.supportEmail).toBeTruthy();
    expect(result.workingHours).toBeTruthy();
  });

  it("เลือกหลายคน → resolve เป็นการ์ดตามลำดับที่เลือก", async () => {
    const { service } = makeService({
      row: { id: 1, contactUserIds: [13, 23, 7] },
      users: [user(7, "seven"), user(13, "programmer"), user(23, "b")],
    });

    const result = await service.get();

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
      row: { id: 1, contactUserIds: [13, 22] },
      users: [user(13, "programmer")],
    });

    const result = await service.get();

    expect(result.contactUserIds).toEqual([13, 22]);
    expect(result.contacts.map((c) => c.userId)).toEqual([13]);
  });

  it("lookup พัง → fail-open ได้การ์ดว่าง ไม่ทำให้หน้า /systems พัง", async () => {
    const { service } = makeService({
      row: { id: 1, contactUserIds: [13] },
      usersError: true,
    });

    await expect(service.get()).resolves.toMatchObject({ contacts: [] });
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

  it("update() บันทึก contactUserIds และล้างข้อมูลกลางด้วย array ว่างได้", async () => {
    const { service, saved } = makeService({ row: { id: 1, contactUserIds: [13] } });

    await service.update({ contactUserIds: [23, 23, 13], workingHours: "" });

    const row = saved.mock.calls[0][0] as { contactUserIds: number[]; workingHours: string | null };
    expect(row.contactUserIds).toEqual([23, 13]);
    expect(row.workingHours).toBeNull();
  });
});

describe("HelpCenterSettingsService — contacts แยกตามบริษัท (global เป็น fallback)", () => {
  it("บริษัทที่มี mapping → เห็นชุดของตัวเอง ไม่ใช่รายชื่อหลัก", async () => {
    const { service } = makeService({
      row: { id: 1, contactUserIds: [13], contactUsersByCompany: { "2": [23] } },
      users: [user(23, "b")],
    });

    const result = await service.get(2);

    expect(result.contactUserIds).toEqual([23]);
    expect(result.contacts.map((c) => c.userId)).toEqual([23]);
    expect(result.scopedByCompany).toBe(true);
  });

  it("บริษัทที่ไม่มี mapping → ใช้ contactUserIds เดิมเป็น fallback", async () => {
    const { service } = makeService({
      row: { id: 1, contactUserIds: [13], contactUsersByCompany: { "2": [23] } },
      users: [user(13, "programmer")],
    });

    const result = await service.get(5);

    expect(result.contactUserIds).toEqual([13]);
    expect(result.scopedByCompany).toBe(false);
  });

  it("mapping เป็น array ว่าง → บริษัทนั้นไม่เห็นโปรแกรมเมอร์ (ตกไปข้อมูลกลาง)", async () => {
    const { service } = makeService({
      row: { id: 1, contactUserIds: [13], contactUsersByCompany: { "2": [] } },
      users: [user(13, "programmer")],
    });

    const result = await service.get(2);

    expect(result.contacts).toEqual([]);
    expect(result.scopedByCompany).toBe(true);
  });

  it("config() คืน mapping ดิบให้ dialog (คนละชุดกับ get() ที่กรองตามคนเรียก)", async () => {
    const { service } = makeService({
      row: {
        id: 1,
        contactUserIds: [13],
        contactUsersByCompany: { "2": [23, 7, "oops"] },
      },
    });

    const result = await service.config();

    expect(result.contactUserIds).toEqual([13]);
    expect(result.contactUsersByCompany).toEqual({ "2": [23, 7] });
  });

  it("update() เก็บ mapping แบบตัดซ้ำ + เก็บ array ว่างไว้ (ไม่ให้หลุดไป global)", async () => {
    const { service, saved } = makeService({ row: { id: 1, contactUserIds: [13] } });

    await service.update({
      contactUsersByCompany: { "2": [23, 23], "3": [] },
    });

    const row = saved.mock.calls[0][0] as {
      contactUsersByCompany: Record<string, number[]>;
    };
    expect(row.contactUsersByCompany).toEqual({ "2": [23], "3": [] });
  });

  it("update() ปฏิเสธ company id/user id ที่เพี้ยน (400)", async () => {
    const { service } = makeService({ row: { id: 1, contactUserIds: [13] } });

    await expect(
      service.update({ contactUsersByCompany: { abc: [1] } }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.update({ contactUsersByCompany: { "2": [-1, 1.5] } }),
    ).rejects.toThrow(BadRequestException);
  });
});
