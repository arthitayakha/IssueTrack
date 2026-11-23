import { NotFoundException } from "@nestjs/common";
import { SystemReportsService } from "../modules/system-reports/system-reports.service";
import { AttachmentsService } from "../modules/attachments/attachments.service";
import type { AuthUser } from "../modules/auth/auth-user";
import type { CreateSystemReportDto } from "../modules/system-reports/dto/system-report.dto";

/**
 * ไฟล์แนบของรายงานบั๊กตอนนี้เก็บในตาราง `attachments` เดียวกับของงาน (migration 1843)
 * — สองจุดที่ต้องไม่เพี้ยน: เขียนโดยใช้ `systemReportId` (ไม่ใช่ `reportId` ที่หายไป
 * พร้อมตารางเก่า) และ response ไม่หลุด `filePath`/`uploadedBy` · รวมถึงการที่ endpoint
 * ของงาน (`GET/DELETE /attachments/:id`) ต้องมองไม่เห็นไฟล์ของรายงาน
 *
 * Stub repositories only — no DB, safe next to `npm run dev`.
 */

interface RepoStub {
  find: jest.Mock;
  findOne: jest.Mock;
  save: jest.Mock;
  create: jest.Mock;
}

function repo(overrides: Partial<RepoStub> = {}): RepoStub {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(async (value: unknown) => value),
    create: jest.fn((value: unknown) => value),
    ...overrides,
  };
}

function userOf(id: number): AuthUser {
  return {
    id: String(id),
    email: `${id}@example.com`,
    name: `user ${id}`,
    roleId: 3,
    roleName: "customer",
    positionId: null,
    companyId: null,
  };
}

const SHARED_ATTACHMENT = {
  id: 11,
  issueId: null,
  systemReportId: 7,
  fileName: "shot.png",
  filePath: "IssueTrack\\backend\\uploads\\secret.png",
  fileType: "image/png",
  fileSize: 10,
  uploadedBy: 2,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

function makeReportsService() {
  const reports = repo();
  const attachments = repo();
  const permissions = { hasPermission: jest.fn().mockResolvedValue(false) };
  const notifications = { notifyAdmins: jest.fn().mockResolvedValue(undefined) };
  const service = new SystemReportsService(
    ...([reports, attachments, permissions, notifications] as unknown as ConstructorParameters<
      typeof SystemReportsService
    >),
  );
  return { service, reports, attachments, notifications };
}

describe("SystemReportsService — shared attachments table", () => {
  it("create() writes with systemReportId and never leaks filePath/uploadedBy", async () => {
    const { service, reports, attachments } = makeReportsService();
    reports.create.mockImplementation((value: unknown) => ({ id: 7, ...(value as object) }));
    reports.save.mockImplementation(async (value: unknown) => value);
    reports.findOne.mockResolvedValue({
      id: 7,
      title: "title",
      description: "desc",
      pageUrl: null,
      problemType: "bug",
      status: "open",
      reporterId: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      reporter: { name: "n", email: "e", phone: null },
      attachments: [SHARED_ATTACHMENT],
    });

    const file = {
      originalname: "shot.png",
      filename: "random.png",
      mimetype: "image/png",
      size: 10,
    } as unknown as Express.Multer.File;
    const dto = {
      title: "title",
      description: "desc",
      problemType: "bug",
    } as unknown as CreateSystemReportDto;

    const result = await service.create(dto, [file], userOf(2));

    expect(attachments.create).toHaveBeenCalledWith(
      expect.objectContaining({ systemReportId: 7, fileName: "shot.png" }),
    );
    expect(attachments.create.mock.calls[0][0]).not.toHaveProperty("reportId");
    expect(result.attachments).toEqual([
      {
        id: 11,
        fileName: "shot.png",
        fileType: "image/png",
        fileSize: 10,
        createdAt: SHARED_ATTACHMENT.createdAt,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain(SHARED_ATTACHMENT.filePath);
  });

  it("download() scopes the lookup to the report's systemReportId", async () => {
    const { service, reports, attachments } = makeReportsService();
    reports.findOne.mockResolvedValue({
      id: 7,
      reporterId: 2,
      attachments: [],
    });
    attachments.findOne.mockResolvedValue(null);

    await expect(
      service.download(7, 999, {} as unknown as import("express").Response, userOf(2)),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(attachments.findOne).toHaveBeenCalledWith({
      where: { id: 999, systemReportId: 7 },
    });
  });
});

describe("AttachmentsService.findOne — issue endpoints cannot reach system-report files", () => {
  it("throws 404 for a row whose issueId is null", async () => {
    const attachments = repo();
    attachments.findOne.mockResolvedValue(SHARED_ATTACHMENT);
    const issues = repo();
    const users = repo();
    const service = new AttachmentsService(
      ...([attachments, issues, users, {}, {}] as unknown as ConstructorParameters<
        typeof AttachmentsService
      >),
    );

    await expect(service.findOne(11, userOf(2))).rejects.toBeInstanceOf(NotFoundException);
    expect(issues.findOne).not.toHaveBeenCalled();
  });
});
