import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

/**
 * **Rate limit แบบ in-memory fixed window** — ไม่พึ่ง `@nestjs/throttle`
 * (ยังไม่ได้ติดตั้งในโปรเจกต์) · ใช้กับเส้น public ที่เสี่ยง brute-force /
 * spam เมล: `POST /auth/login`, `POST /auth/forgot-password`,
 * `POST /auth/reset-password`
 *
 * - **กติกา**: metadata `@RateLimit(limit, windowMs)` ต่อ route — นับ **ต่อ IP
 *   ต่อ route** (key = `ip|Class.handler`) · เกิน → **429** พร้อม `retryAfter`
 *   (วินาที)
 * - **ไม่มี metadata = ผ่าน** — ต้องแปะทีละเส้น จงใจ (ไม่ทำ global throttle
 *   ที่จะกระทบทุกเส้นโดยไม่ตั้งใจ)
 * - **หน่วยความจำ**: bucket ถูก sweep เมื่อ map ใหญ่เกิน 1000 รายการ
 *   (ทุกครั้งที่มีเรียก) — คีย์หมดอายุถูกลบทิ้งเอง ไม่มีทางโตไม่จำกัด
 * - **ข้อจำกัดที่ยอมรับ**: นับต่อ instance (multi-instance/cluster = นับแยก
 *   ต่อเครื่อง) และ behind proxy `req.ip` จะเป็น IP ของ proxy เว้นแต่จะเปิด
 *   `app.set("trust proxy", …)` — พอสำหรับ internal tool รันเครื่องเดียว
 */

export const RATE_LIMIT_KEY = "rateLimit";

export interface RateLimitOptions {
  /** จำนวนครั้งสูงสุดภายใน window */
  limit: number;
  /** ความยาวหน้าต่าง (ms) */
  windowMs: number;
}

/** แปะบน handler: `@RateLimit(20, 60_000)` = 20 ครั้ง/นาทีต่อ IP */
export const RateLimit = (limit: number, windowMs: number) =>
  SetMetadata(RATE_LIMIT_KEY, { limit, windowMs } satisfies RateLimitOptions);

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<
      RateLimitOptions | undefined
    >(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!options) return true; // ไม่ได้ประกาศ = ไม่จำกัดเส้นนี้

    const request = context.switchToHttp().getRequest();
    const ip: string =
      request.ip ?? request.socket?.remoteAddress ?? "unknown";
    const key = `${ip}|${context.getClass().name}.${context.getHandler().name}`;
    const now = Date.now();

    // กวาด bucket หมดอายุเมื่อ map เริ่มโต — กัน memory leak จากหลาย IP
    if (this.buckets.size > 1000) {
      for (const [k, bucket] of this.buckets) {
        if (bucket.resetAt <= now) this.buckets.delete(k);
      }
    }

    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > options.limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((bucket.resetAt - now) / 1000),
      );
      throw new HttpException(
        {
          statusCode: 429,
          message: "Too many requests — please try again later",
          error: "Too Many Requests",
          retryAfter,
        },
        429,
      );
    }
    return true;
  }
}
