/**
 * **ประเภทงาน** (`issues.task_type`) — whitelist เดียวของทั้ง API
 *
 * `GET /issues` (มุมมอง "รายการปัญหา" บนหน้ารายงาน) กับ `GET /reports/summary`
 * (มุมมอง "ตามผู้รับผิดชอบ" / "ตามแอป") ต้องกรองด้วยค่าชุดเดียวกันเป๊ะ
 * ไม่งั้นสองมุมมองของหน้ารายงานเดียวกันจะนับงานคนละชุด — จึงแยกมาไว้
 * ตรงนี้ให้ controller ทั้งสอง import แทนการเขียน whitelist ซ้ำ
 * (ของเดิมเคยอยู่ใน `reports.controller.ts`).
 *
 * ค่าที่รับ: `bug` / `ma` / `requirement` — **ไม่รวม NULL** (ยังไม่ระบุ) ซึ่งต้อง
 * ส่งผ่าน flag `?noTaskType=1` แยกต่างหาก เพราะ `IN (...)` จับ NULL ไม่ได้
 */

export const TASK_TYPES = ["bug", "ma", "requirement"] as const;

const TASK_TYPE_SET: ReadonlySet<string> = new Set(TASK_TYPES);

/**
 * `?taskTypes=bug,ma` → array ของค่าที่รู้จัก (ของปลอม / ว่าง / มีช่องว่าง
 * หลุดทั้งหมด) · คืน `undefined` เมื่อไม่มีค่าที่ใช้ได้ เพื่อให้ service
 * ตีความเป็น "ไม่ได้กรอง" (fail-open) เหมือนเดิม
 */
export function parseTaskTypes(value?: string): string[] | undefined {
  const list = (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => TASK_TYPE_SET.has(s));
  return list.length ? list : undefined;
}

/** `?noTaskType=1|true` → boolean — bucket "ยังไม่ระบุ" ของ dimension เดียวกัน. */
export function parseNoTaskType(value?: string): boolean {
  return value === "1" || value === "true";
}
