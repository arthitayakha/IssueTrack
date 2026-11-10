/**
 * **ผูกชั่วโมง MA เข้า "รอบ" สัญญา** — pure functions ล้วน (ไม่พึ่ง DI จึงเทสต์ตรง ๆ ได้)
 *
 * คู่ แอป×บริษัท (`app_companies`) เก็บได้ **หลายช่วง** — 1 แถว = 1 รอบ (append ไม่เขียนทับ)
 * แต่ `issues` ไม่มี FK ชี้ไปแถวพวกนั้น มีแค่ `actual_fix_at` (migration 1822) ว่า
 * *ชั่วโมงถูกกรอกตอนไหน* ดังนั้นกติกาการผูกจึงเป็น:
 *
 * > ชั่วโมงของงานเป็นของ **รอบที่ "มีผล" อยู่ ณ ตอนที่กรอกชั่วโมงนั้น**
 * > = แถวของคู่เดียวกันที่ `created_at <= actual_fix_at` แล้วเอา **`created_at` มากสุด**
 * >   (เสมอ → `id` มากสุด) = "แถวที่เพิ่งถูกสร้างล่าสุด ณ เวลานั้น"
 *
 * เงื่อนไข `created_at <= at` คือหัวใจ: **แถวที่ยังไม่ถูกสร้างเป็นเจ้าของชั่วโมงก่อนหน้าไม่ได้**
 * เมื่อมีเงื่อนไขนี้แล้ว เลือก `created_at` มากสุด (ซึ่งตรงกับ `id` มากสุด เพราะ id เป็น
 * sequence ที่เพิ่มตามลำดับ insert) ก็ให้คำตอบถูกครบทุกเคส:
 *
 * - **ต่ออายุ** → แถวใหม่ถูกสร้าง *หลัง* ชั่วโมงเก่าถูกกรอก → ชั่วโมงเก่าอยู่รอบเก่าถูกต้อง
 *   (ไม่ว่าผู้ใช้จะตั้ง `started_at` ย้อนหลังแค่ไหน — จึง**ไม่ใช้** `started_at` ตัดสิน)
 * - **ซื้อชั่วโมง** → คัดลอกวันที่ของแถวต้นทางมาเป๊ะ (`kind = 'buy'`) แยกรอบจากวันที่ไม่ได้
 *   แต่ถูกสร้าง*ทีหลัง* → ชั่วโมงที่กรอกก่อนหน้าตกเป็นของแถวเดิม ส่วนชั่วโมงหลังจากนั้น
 *   ตกเป็นของแถว `buy` ซึ่งถือ `ma_hours` รวมอยู่แล้ว (แถวที่ "มีผล" จริงในตอนนั้น)
 * - **ระหว่างรอบ** (หมดอายุแล้วแต่ยังไม่ต่ออายุ) → ยังไม่มีแถวใหม่ ชั่วโมงจึงอยู่รอบเก่า
 *
 * **Invariant ที่ต้องคงไว้** (มีเทสต์คุม): ผลรวม `periodUsedHours` ทุกแถวของคู่
 * + `unattributedHours` (งานที่ `actual_fix_at IS NULL` = ข้อมูลก่อนระบบ / ยังไม่กรอก)
 * = `pairUsedHours` ตัวเดียวกับ "ใช้ไป" ที่ `/systems` โชว์อยู่ทุกวันนี้
 *
 * `NULL` ไม่เคยถูกเดา — ถ้าไม่รู้ว่ากรอกตอนไหน ก็ไม่ระบุรอบ แล้วให้ UI เล่าค่านี้ตรง ๆ
 */

/** คอลัมน์ของ `app_companies` ที่กติกานี้ใช้ — ระบุเองเพื่อให้เทสต์สร้าง object เล็ก ๆ ได้ */
export interface PeriodRow {
  id: number;
  /** `app_companies.created_at` — เวลาที่แถวถูกสร้าง (ไม่ใช่วันที่ของสัญญา) */
  createdAt: Date | string;
}

/** ค่าเวลาที่แปลงไม่ได้ → `fallback` (แทนที่จะโยนทิ้งแถวแบบเงียบ ๆ) */
function toTime(value: Date | string | null | undefined, fallback: number): number {
  if (value == null) return fallback;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? fallback : time;
}

/**
 * แถวของรอบไหนที่ "มีผล" อยู่ ณ เวลา `at` — คืน `recordId` ของรอบนั้น
 *
 * คืน `null` เมื่อ: ยังไม่มีเวลา (`at` เป็น `NULL` — ข้อมูลก่อนระบบหรือยังไม่กรอกเวลา),
 * เวลาแปลงไม่ได้, หรือยังไม่มีรอบไหนถูกสร้างขึ้นก่อนเวลานั้น
 * → ทั้งหมดตกไปเป็น "ไม่ระบุรอบ" (`unattributedHours`) ไม่ถูกเดาสุ่ม
 */
export function pickPeriodId(
  rows: PeriodRow[],
  at: Date | string | null | undefined,
): number | null {
  const atTime = toTime(at, Number.NaN);
  if (Number.isNaN(atTime)) return null;

  let bestId: number | null = null;
  let bestCreated = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    // `created_at` พัง → ถือว่าแถวนี้ยังไม่มีตัวตน ไม่ให้เป็นเจ้าของชั่วโมงแบบเดา ๆ
    const created = toTime(row.createdAt, Number.POSITIVE_INFINITY);
    if (created > atTime) continue; // แถวนี้ยังไม่ถูกสร้าง ณ เวลานั้น
    if (bestId === null || created > bestCreated || (created === bestCreated && row.id > bestId)) {
      bestId = row.id;
      bestCreated = created;
    }
  }

  return bestId;
}

/** คีย์ระดับคู่ แอป×บริษัท — ตรงกับ `pairKey()` ฝั่งเว็บ (`appId:companyId`) */
export function pairKey(appId: number, companyId: number): string {
  return `${appId}:${companyId}`;
}
