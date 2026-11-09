export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: number | null;
  roleName: string | null;
  positionId: number | null;
  /**
   * บริษัทของผู้ใช้ (`users.company_id`) — `null` เกือบทุกบทบาท ยกเว้น
   * `customer` ที่ถูกผูกไว้ในฟอร์มผู้ใช้ ใช้กรองแอปตามบริษัทของผู้รายงาน
   * (`GET /apps?mine=1`) และเช็กตอนสร้างงาน (`IssuesService.create`)
   */
  companyId: number | null;
}

export function actorInfo(user: AuthUser) {
  return {
    actorId: Number(user.id),
    actorName: user.name,
    actorRole: user.roleName ?? null,
  };
}
