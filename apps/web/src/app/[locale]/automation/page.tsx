import { redirect } from "@/i18n/navigation";

/**
 * หน้า list `/automation` ถูกถอดออก — รายการกฎมีที่เดียวคือแท็บ "ระบบอัตโนมัติ"
 * ใน `/master-data` (RulesPanel ตัวเดียวกัน ไม่มีเหตุผลต้องมี 2 หน้า)
 * URL เก่า (bookmark/ลิงก์เก่า) redirect ไปแท็บนั้นตรง ๆ จะได้ไม่โดน 404
 * — `/automation/new`, `/automation/[id]` และ `/automation/runs` (ประวัติ) ถูกถอด
 * แบบเดียวกันทั้งหมด (wizard + ปุ่ม "สร้างกฎ"/"แก้ไข"/"ดูประวัติการทำงาน" ย้ายไป
 * ป๊อปอัพ `RuleWizardDialog` / `RunHistoryDialog` ใน RulesPanel แล้ว)
 */
export default function AutomationIndexPage({ params }: { params: { locale: string } }) {
  redirect({
    href: { pathname: "/master-data", query: { tab: "automation" } },
    locale: params.locale,
  });
}
