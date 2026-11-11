import { redirect } from "@/i18n/navigation";

/**
 * หน้า wizard สร้างกฎ `/automation/new` ถูกถอดออก — "สร้างกฎ" เปิด **ป๊อปอัพ**
 * (RuleWizardDialog ใน RulesPanel ของแท็บ "ระบบอัตโนมัติ" ใน /master-data) แทน
 * URL เก่า (bookmark/ลิงก์เก่า) redirect ไปแท็บนั้นตรง ๆ จะได้ไม่โดน 404
 * — `/automation/runs` (ประวัติ) ยังเป็นหน้าเต็มเหมือนเดิม
 */
export default function NewRulePage({ params }: { params: { locale: string } }) {
  redirect({
    href: { pathname: "/master-data", query: { tab: "automation" } },
    locale: params.locale,
  });
}
