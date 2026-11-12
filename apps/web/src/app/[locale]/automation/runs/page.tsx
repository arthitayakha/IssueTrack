import { redirect } from "@/i18n/navigation";

/**
 * หน้าประวัติการทำงาน `/automation/runs` ถูกถอดออก — "ดูประวัติการทำงาน" เปิด
 * **ป๊อปอัพ** (RunHistoryDialog ใน RulesPanel ของแท็บ "ระบบอัตโนมัติ" ใน /master-data)
 * แทน — เหมือนหน้า list/wizard/edit ที่ถอดไปก่อนหน้า: URL เก่า (bookmark/ที่
 * แชร์ไว้) redirect ไปแท็บเดียวกันจะได้ไม่โดน 404
 *   โดย **ไม่ auto-open** ป๊อปอัพ (เลือกแบบ redirect ตรง ๆ เหมือน create/edit)
 * — `loading.tsx` ของ route นี้ถูกลบไปพร้อมกัน (ไม่มีอะไรโหลดแล้ว)
 */
export default function RunHistoryPage({ params }: { params: { locale: string } }) {
  redirect({
    href: { pathname: "/master-data", query: { tab: "automation" } },
    locale: params.locale,
  });
}
