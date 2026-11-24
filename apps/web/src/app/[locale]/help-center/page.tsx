import { redirect } from "@/i18n/navigation";

/**
 * ศูนย์ช่วยเหลือ **และฟีเจอร์แจ้งปัญหาระบบถูกถอดออกทั้งหมด** — ข้อมูลติดต่อ
 * ที่ลูกค้าเห็นอยู่ใน dialog "จัดการผู้ติดต่อ" บน `/systems` แทน
 *
 * กัน bookmark/ลิงก์เก่าไม่ให้ 404 → หน้าแรก
 */
export default function HelpCenterIndexPage({ params }: { params: { locale: string } }) {
  redirect({ href: "/", locale: params.locale });
}
