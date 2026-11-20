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
   * ตอนนี้ถูก**อ่านจริง** 2 ที่: ฟิลเตอร์บริษัทบนบอร์ด/รายงาน และ
   * `GET /apps?mine=1` ของฟอร์มแจ้งปัญหา (`/issues/new`) ที่กรอง dropdown
   * เหลือเฉพาะแอปผูกกับบริษัทผู้เรียก — **fail-open** ทุกทาง (ไม่มีบริษัท /
   * ไม่มีแถวผูก / สตาฟฟ์ / แอปที่ผูกถูกปิดหมด → เห็นแอปทุกตัวเหมือนเดิม)
   *
   * ⚠️ **ยังไม่มี guard ตอนสร้างงาน** — `IssuesService.create` ไม่เช็กข้าม
   * บริษัทแล้ว (400 ตัวเดิมถูกถอดออก) การกรองนี้เป็น**การแสดงผลเท่านั้น** —
   * **อย่าเพิ่ม guard กลับโดยไม่ถามก่อน**
   */
  companyId: number | null;
  /** เบอร์ติดต่อ (nullable — แถวเก่ายังไม่มีเบอร์) */
  phone?: string | null;
}

export function actorInfo(user: AuthUser) {
  return {
    actorId: Number(user.id),
    actorName: user.name,
    actorRole: user.roleName ?? null,
  };
}
