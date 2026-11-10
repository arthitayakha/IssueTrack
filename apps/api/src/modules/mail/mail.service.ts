import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

const RESET_TTL_MINUTES = 30;

/** What the "your issue changed status" mail needs to be built. */
export interface StatusMailParams {
  to: string;
  name: string;
  title: string;
  /** `ISS-001`-style number — absent on old cards, then only the title shows. */
  issueNumber?: string | null;
  /** The target column's real name (admins may rename columns by hand). */
  statusName: string;
  /** Absolute URL of the card (APP_URL + /boards?issue=id). */
  url: string;
}

/** What the "your MA hours ran out" mail needs — fired once per exhaustion episode. */
export interface MaDepletedMailParams {
  to: string;
  name: string;
  appName: string;
  /** คู่ แอป×บริษัทของแถวนั้น — หนึ่งแอปมีได้หลายบริษัทคนละเพดาน */
  companyName: string;
  maHours: number;
  usedHours: number;
  /** Absolute URL — `/systems` for staff, `/boards` for customers. */
  url: string;
}

/**
 * The app's single e-mail sender: the "forgot password" link (AuthModule) and
 * the milestone status updates to the customer (NotificationsModule).
 *
 * SMTP comes from `apps/api/.env` (`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` /
 * `SMTP_PASS` / `MAIL_FROM`). With no `SMTP_HOST` every send falls back to
 * printing to the API console instead — fill the values in and the very same
 * calls send a real e-mail, no code change needed.
 *
 * Mail failures never fail the request that triggered them: every public
 * method swallows its own errors, so a broken transport is only visible in
 * the logs (and a password reset still answers the same generic `{ ok: true }`,
 * anti-enumeration).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor() {
    const host = process.env.SMTP_HOST?.trim();
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: parseInt(process.env.SMTP_PORT ?? "587", 10),
          secure: parseInt(process.env.SMTP_PORT ?? "587", 10) === 465,
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
          // a dead SMTP must never stall the request that triggered the mail
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        })
      : null;
  }

  /** The link is Thai-content, English-locale-agnostic; body is Thai by design. */
  async sendPasswordReset(to: string, name: string, resetUrl: string): Promise<void> {
    const subject = "ตั้งรหัสผ่านใหม่ — Kanban Issue Tracker";
    const text = [
      `สวัสดี ${name},`,
      "",
      "มีคำขอเปลี่ยนรหัสผ่านสำหรับบัญชีนี้",
      "",
      `เปิดลิงก์นี้เพื่อตั้งรหัสผ่านใหม่ (อายุ ${RESET_TTL_MINUTES} นาที ใช้ได้ครั้งเดียว):`,
      resetUrl,
      "",
      "ถ้าคุณไม่ได้ขอ โปรดเพิกเฉยต่ออีเมลนี้ — รหัสผ่านจะไม่ถูกเปลี่ยน",
    ].join("\n");

    await this.send({
      to,
      subject,
      text,
      html: this.resetHtml(name, resetUrl),
      context: "password reset mail",
      // in dev the link IS the payload, so it must survive a failed send
      devNote: `password reset link for ${to}: ${resetUrl}`,
    });
  }

  /**
   * "your report moved" mail — sent to the reporter when a card lands in a
   * milestone column (รับเรื่อง / เสร็จสิ้น). Thai by design, same as the
   * reset mail; `statusName` is the live column name so a rename shows up here.
   */
  async sendIssueStatusUpdate(params: StatusMailParams): Promise<void> {
    const ref = params.issueNumber ? `${params.issueNumber} · ${params.title}` : params.title;
    const subject = `อัปเดตสถานะ ${params.statusName} — ${ref}`;
    const text = [
      `สวัสดี ${params.name},`,
      "",
      `เรื่อง "${ref}" เปลี่ยนสถานะเป็น "${params.statusName}" แล้ว`,
      "",
      "เปิดลิงก์นี้เพื่อดูรายละเอียด:",
      params.url,
      "",
      "อีเมลนี้ส่งอัตโนมัติจากระบบ Kanban Issue Tracker",
    ].join("\n");

    await this.send({
      to: params.to,
      subject,
      text,
      html: this.statusHtml(params, ref),
      context: "issue status mail",
      devNote: `issue status mail for ${params.to}: ${subject}`,
    });
  }

  /**
   * "ชั่วโมง MA หมดแล้ว" — ส่งถึงลูกค้าของบริษัทนั้น + แอดมินพร้อมกับ in-app
   * bell (`NotificationsService.notifyMaDepleted`) ครั้งเดียวต่อรอบการหมด ·
   * Thai by design like the other two; `url` ชี้ `/systems` สำหรับทีมงาน
   * และ `/boards` สำหรับลูกค้า (ไม่มี `system.view`)
   */
  async sendMaDepleted(params: MaDepletedMailParams): Promise<void> {
    const subject = `ชั่วโมง MA หมดแล้ว — ${params.appName}`;
    const scope = params.companyName ? ` (บริษัท ${params.companyName})` : "";
    const text = [
      `สวัสดี ${params.name},`,
      "",
      `ชั่วโมง MA ของแอป "${params.appName}"${scope} ใช้ครบ ${params.maHours} ชม. แล้ว (ใช้ไป ${params.usedHours} ชม.)`,
      "",
      "หากต้องการใช้งานต่อ กรุณาต่ออายุหรือซื้อชั่วโมงเพิ่ม",
      params.url,
      "",
      "อีเมลนี้ส่งอัตโนมัติจากระบบ Kanban Issue Tracker",
    ].join("\n");

    await this.send({
      to: params.to,
      subject,
      text,
      html: this.maDepletedHtml(params, scope),
      context: "ma depleted mail",
      devNote: `ma depleted mail for ${params.to}: ${subject}`,
    });
  }

  /** One door to the transport — no SMTP and send failures both end in the log. */
  private async send(opts: {
    to: string;
    subject: string;
    text: string;
    html: string;
    context: string;
    devNote: string;
  }): Promise<void> {
    if (!this.transporter) {
      this.logDevOnly(`${opts.devNote} (SMTP_HOST is not set)`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? "Kanban Issue Tracker <no-reply@localhost>",
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      this.logger.log(`${opts.context} sent to ${opts.to}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`${opts.context} to ${opts.to} failed: ${reason}`);
      // an SMTP outage must not break the flow while we are in dev
      this.logDevOnly(`${opts.devNote} (${reason})`);
    }
  }

  /** Console fallback — the dev flow until real SMTP credentials exist. */
  private logDevOnly(note: string) {
    if (process.env.NODE_ENV === "production") return; // never leak links in prod logs
    this.logger.warn(`[DEV] ${note}`);
  }

  private resetHtml(name: string, resetUrl: string): string {
    return [
      `<p>สวัสดี ${escapeHtml(name)},</p>`,
      `<p>มีคำขอเปลี่ยนรหัสผ่านสำหรับบัญชีนี้</p>`,
      `<p><a href="${escapeHtml(resetUrl)}">เปิดลิงก์เพื่อตั้งรหัสผ่านใหม่</a></p>`,
      `<p>ลิงก์อายุ ${RESET_TTL_MINUTES} นาทีและใช้ได้ครั้งเดียว ถ้าคุณไม่ได้ขอ โปรดเพิกเฉยต่ออีเมลนี้</p>`,
    ].join("");
  }

  private statusHtml(params: StatusMailParams, ref: string): string {
    return [
      `<p>สวัสดี ${escapeHtml(params.name)},</p>`,
      `<p>เรื่อง <strong>${escapeHtml(ref)}</strong> เปลี่ยนสถานะเป็น <strong>${escapeHtml(params.statusName)}</strong> แล้ว</p>`,
      `<p><a href="${escapeHtml(params.url)}">เปิดลิงก์นี้เพื่อดูรายละเอียด</a></p>`,
      `<p>อีเมลนี้ส่งอัตโนมัติจากระบบ Kanban Issue Tracker</p>`,
    ].join("");
  }

  private maDepletedHtml(params: MaDepletedMailParams, scope: string): string {
    return [
      `<p>สวัสดี ${escapeHtml(params.name)},</p>`,
      `<p>ชั่วโมง MA ของแอป <strong>${escapeHtml(params.appName)}</strong>${escapeHtml(scope)} ใช้ครบ <strong>${params.maHours} ชม.</strong> แล้ว (ใช้ไป ${params.usedHours} ชม.)</p>`,
      `<p>หากต้องการใช้งานต่อ กรุณาต่ออายุหรือซื้อชั่วโมงเพิ่ม</p>`,
      `<p><a href="${escapeHtml(params.url)}">เปิดลิงก์นี้</a></p>`,
      `<p>อีเมลนี้ส่งอัตโนมัติจากระบบ Kanban Issue Tracker</p>`,
    ].join("");
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
