import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

const RESET_TTL_MINUTES = 30;

/**
 * Sends the "forgot password" mail. There is no SMTP configured yet, so the
 * default behaviour is to print the link to the API console instead — fill in
 * `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` in `apps/api/.env` and the very same
 * call sends a real e-mail, no code change needed.
 *
 * Mail failures never fail the request: `POST /auth/forgot-password` answers
 * the same generic `{ ok: true }` either way (anti-enumeration), so a broken
 * transport is only visible in the logs.
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

        if (!this.transporter) {
            this.logLinkOnly(to, resetUrl, "SMTP_HOST is not set");
            return;
        }

        try {
            await this.transporter.sendMail({
                from: process.env.MAIL_FROM ?? "Kanban Issue Tracker <no-reply@localhost>",
                to,
                subject,
                text,
                html: this.html(name, resetUrl),
            });
            this.logger.log(`password reset mail sent to ${to}`);
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            this.logger.error(`password reset mail to ${to} failed: ${reason}`);
            // an SMTP outage must not lock the user out while we are in dev
            this.logLinkOnly(to, resetUrl, reason);
        }
    }

    /** Console fallback — the dev flow until real SMTP credentials exist. */
    private logLinkOnly(to: string, resetUrl: string, reason: string) {
        if (process.env.NODE_ENV === "production") return; // never leak links in prod logs
        this.logger.warn(`[DEV] password reset link for ${to} (${reason}): ${resetUrl}`);
    }

    private html(name: string, resetUrl: string): string {
        return [
            `<p>สวัสดี ${escapeHtml(name)},</p>`,
            `<p>มีคำขอเปลี่ยนรหัสผ่านสำหรับบัญชีนี้</p>`,
            `<p><a href="${escapeHtml(resetUrl)}">เปิดลิงก์เพื่อตั้งรหัสผ่านใหม่</a></p>`,
            `<p>ลิงก์อายุ ${RESET_TTL_MINUTES} นาทีและใช้ได้ครั้งเดียว ถ้าคุณไม่ได้ขอ โปรดเพิกเฉยต่ออีเมลนี้</p>`,
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
