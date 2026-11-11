import { redirect } from "@/i18n/navigation";

/**
 * หน้าแก้ไขกฎ `/automation/[id]` ถูกถอดออก — "แก้ไข" เปิด **ป๊อปอัพ**
 * (RuleWizardDialog ใน RulesPanel) แทน
 * — redirect ไปแท็บ "ระบบอัตโนมัติ" ใน /master-data: ลิงก์จาก notification
 * (`link: /automation/{id}` ที่ RulesService สร้าง) จึงยังพาไปรายการกฎได้
 *   โดยไม่ 404 (ยังไม่ auto-open ป๊อปอัพ — เลือกแบบ redirect ตรง ๆ)
 */
export default function EditRulePage({ params }: { params: { locale: string; id: string } }) {
  redirect({
    href: { pathname: "/master-data", query: { tab: "automation" } },
    locale: params.locale,
  });
}
