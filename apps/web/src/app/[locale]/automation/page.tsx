import { redirect } from "@/i18n/navigation";

/**
 * หน้า list `/automation` ถูกถอดออก — รายการกฎมีที่เดียวคือแท็บ "ระบบอัตโนมัติ"
 * ใน `/master-data` (RulesPanel ตัวเดียวกัน ไม่มีเหตุผลต้องมี 2 หน้า)
 * URL เก่า (bookmark/ลิงก์เก่า) redirect ไปแท็บนั้นตรง ๆ จะได้ไม่โดน 404
 * — `/automation/new` กับ `/automation/[id]` ถูกถอดแบบเดียวกัน ( wizard + ปุ่ม
 * "สร้างกฎ"/"แก้ไข" ย้ายไปป๊อปอัพ `RuleWizardDialog` ใน RulesPanel แล้ว)
 * เหลือ `/automation/runs` (ประวัติ) ที่ยังเป็นหน้าเต็ม
 */
export default function AutomationIndexPage({ params }: { params: { locale: string } }) {
  redirect({
    href: { pathname: "/master-data", query: { tab: "automation" } },
    locale: params.locale,
  });
}
