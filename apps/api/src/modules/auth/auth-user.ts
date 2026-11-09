export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: number | null;
  roleName: string | null;
  positionId: number | null;
  /**
   * บริษัทของผู้ใช้ (`users.company_id`) — `null` เกือบทุกบทบาท ยกเว้น
   * `customer` ที่ถูกผูกไว้ในฟอร์มผู้ใช้
   *
   * **ตอนนี้เป็นข้อมูลอ้างอิงเท่านั้น** — เดิมใช้กรอง dropdown แอปของฟอร์ม
   * รายงานปัญหา (`GET /apps?mine=1`) และเช็กตอนสร้างงาน (`IssuesService.create`)
   * แต่ถูกถอดออกแล้วตามข้อสรุปจากพี่: เชื่อมหรือไม่เชื่อม ลูกค้าก็เห็นแอปทุก
   * ตัว — **อย่าเพิ่มการบังคับกลับโดยไม่ถามก่อน**
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
