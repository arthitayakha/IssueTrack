import { redirect } from "@/i18n/navigation";

/**
 * หน้ากล่องข้อความเต็ม `/notifications` **ถูกถอดออก** — โนติมีที่เดียวคือ
 * popover ของกระดิ่งใน navbar (อ่าน = ลบ, badge ทุก 30 วิ, mark-all) หน้าเต็ม
 * ไม่มีฟีเจอร์อะไรที่ popover ไม่มี จึงเป็นของซ้ำ
 *
 * URL เก่า (ลิงก์ในอีเมลเตือนที่เคยส่งไปแล้ว + bookmark) ไป
 * หน้าแรก จะได้ไม่โดน 404
 */
export default function NotificationsIndexPage({ params }: { params: { locale: string } }) {
  redirect({ href: "/", locale: params.locale });
}
