import { AuthUser } from "../auth/auth-user";

/**
 * **ขอบเขตข้อมูลสัญญา (คู่ แอป×บริษัท) ที่ผู้เรียกมีสิทธิ์เห็น** — ค่าที่เป็น
 * ไปได้และเหตุผลของแต่ละค่าอยู่ใน `ViewerScope` ด้านล่าง
 */
export type ContractMode = "all" | "own" | "none";

/**
 * ขอบเขตที่ controller คำนวณไว้ให้ service — **จุดเดียว**ที่รู้ว่า
 * "ลูกค้าเห็นเฉพาะของตัวเอง"
 *
 * - `all`  — ไม่จำกัด:ทุกคนที่**ไม่ใช่** role `customer` (แอดมิน/โปรแกรมเมอร์
 *            เห็นทุกบริษัท เหมือนที่เป็นอยู่ทุกวันนี้)
 * - `own`  — เฉพาะคู่ของ `companyId` ผู้เรียก: หน้า `/systems` ของลูกค้า และ
 *            2 endpoint สถิติชั่วโมง MA · ลูกค้า**ไม่มี**บริษัท (`companyId: null`)
 *            = ไม่เห็นอะไรเลย (ผู้ใช้เลือกให้โชว์ตารางว่างแทนการเห็นของคนอื่น)
 * - `none` — ไม่คืนแถวสัญญา**เลย**: `GET /apps` ของลูกค้า — รายชื่อแอปยังครบ
 *            ทุกตัว ณ จุดนี้ (การกรองตามบริษัทของฟอร์มแจ้งปัญหาทำผ่าน
 *            `?mine=1` ใน `AppsService.findAll` — fail-open — คนละเรื่องกับ
 *            การตัดแถวด้านใน) แต่วันที่/ชั่วโมง MA ของบริษัท**ไหนก็ตาม**
 *            อ่านไม่ได้จากช่องนี้ (ของตัวเองดูที่ `/systems` แทน)
 *
 * **ทำไมต้องมี**: `GET /systems` เดิมคืนทุกบริษัท และ `GET /apps` — ไม่มี guard
 * เลยเพราะฟอร์มแจ้งปัญหาต้องใช้ — คืน `companies` พร้อมวันที่สัญญา + ชั่วโมง MA
 * ของ**ทุก**บริษัท จึงเป็นประตูที่สองที่ลูกค้าอ่านข้อมูลสัญญาของบริษัทอื่นได้
 * โดยไม่ต้องผ่านหน้า `/systems`
 *
 * **เช็ค role `customer` เท่านั้น** (ข้อสรุปจากผู้ใช้) — ไม่ใช่การเช็ค permission:
 * `system.view` เป็น "ทางเข้าหน้า" ส่วน "เห็นได้แค่ไหน" เป็นคนละเรื่องกัน
 */
export interface ViewerScope {
  mode: ContractMode;
  /** `users.company_id` ของผู้เรียก — มีค่าก็ต่อเมื่อ `mode === "own"` */
  companyId: number | null;
}

/**
 * คำนวณขอบเขตจากผู้เรียก — ใช้โดย `GET /systems`, `GET /apps`,
 * `GET /apps/usage-counts` และ `GET /apps/:id/companies/:recordId/usage`
 *
 * @param mode `"own"` = เฉพาะคู่ของบริษัทตัวเอง · `"none"` = ไม่คืนแถวสัญญาเลย
 *             (ค่าที่ส่งมา**ถูกยกเลิก**ทันทีถ้าผู้เรียกไม่ใช่ลูกค้า → `all`)
 */
export function viewerScope(
  user: AuthUser | null | undefined,
  mode: Exclude<ContractMode, "all">,
): ViewerScope {
  if (user?.roleName !== "customer") return { mode: "all", companyId: null };
  return { mode, companyId: user.companyId ?? null };
}
