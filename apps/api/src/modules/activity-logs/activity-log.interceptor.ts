import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { mergeMap, type Observable } from "rxjs";
import { Repository } from "typeorm";
import { ActivityLog } from "./entities/activity-log.entity";

/**
 * **ตาข่ายบันทึกทุกการกระทำในระบบ** — จับ request ที่แก้ข้อมูลทุกตัว
 * (`POST` / `PATCH` / `PUT` / `DELETE`) แล้วแปลงเป็นแถว `activity_logs`
 * อัตโนมัติ โดย**ไม่ต้อง register ทีละ endpoint**: เพิ่ม route ใหม่ในอนาคต
 * ก็ถูกบันทึกเองทันที (ผ่าน `deriveAction()` ด้านล่าง) — ต่างจากแบบเขียน
 * `logActivity()` ในแต่ละ service ซึ่ง endpoint ใหม่จะพลาดเงียบ ๆ
 *
 * 3 ชั้นที่ต้องเข้าใจ:
 *
 * 1. **ตาราง route** (`ROUTE_ACTIONS`) = ชื่อ action ที่อ่านรู้เรื่อง
 *    (`PATCH /users/:id/active` → `user.toggled`) — ปกติใช้ชั้นนี้
 * 2. **`deriveAction()`** = ตาข่ายสำหรับ route ที่ยังไม่มีในตาราง
 *    (noun จาก segment แรก + verb จาก method/segment สุดท้าย) — กันพลาด
 * 3. **`SKIP_ROUTES`** = 2 กลุ่มที่**ห้าม**เขียนซ้ำ:
 *    - 14 routes ที่ service เขียน log เองอยู่แล้ว (card/comment/rule) —
 *      ถ้า interceptor เขียนด้วยจะได้แถวซ้ำ 2 เท่าทุกครั้งที่ลากการ์ด
 *    - การลบการแจ้งเตือน (= อ่านกล่องเข้า) + `forgot-password`/`reset-password`
 *      แบบ public ที่ไม่มี actor และสแปมได้ — ไม่ใช่ "การกระทำ" ที่ควรค่าแก่ audit
 *
 * **redaction**: คีย์ที่หน้าตาเหมือนความลับ (`password`, `token`, `secret`,
 * `authorization`, `credential`) ถูก**ตัดออกจาก detail ก่อน stringify เสมอ**
 * — log บอกว่า "ใครเปลี่ยนรหัสผ่านเมื่อไหร่" แต่**ไม่มีทางเก็บรหัสผ่านจริง**
 * (อีเมลตั้งใจเก็บ: ไม่ใช่ความลับ โชว์ทั้งแอปอยู่แล้ว และคนสืบอยากรู้ว่าเปลี่ยนเป็นอะไร)
 *
 * **fail-open**: ทุกอย่างห่อ try/catch — เขียน log ไม่ได้ (DB ตาย, ฯลฯ)
 * = ข้าม ห้ามทำให้ request ที่ trigger มันพัง เหมือนสัญญาของ `notify()`
 *
 * บันทึก**เฉพาะ response สำเร็จ** — `mergeMap` project function ไม่ถูกเรียก
 * เมื่อ `next.handle()` error (400/401/404) จึงไม่มีแถวของการกระทำที่ล้มเหลว
 */

/** Only these methods mutate. GET/HEAD/OPTIONS return immediately. */
const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** detail สูงสุด (chars) — เกินนี้เก็บแค่รายชื่อ field แทน เพื่อให้ JSON ยังอ่านได้ */
const MAX_DETAIL_CHARS = 4000;

/**
 * คีย์ที่ต้องไม่มีทางลง `detail` — ตรวจด้วย substring บน key ที่ lowercased
 * เพื่อจับทั้ง `password`, `currentPassword`, `newPassword`, `resetToken`
 * `accessToken`, `Authorization` … โดยไม่ต้องไล่ enumerate ทีละชื่อ
 */
const SENSITIVE_KEY = /pass(word|wd)|token|secret|authorization|credential/i;

/**
 * **ตาราง route → action** — key รูป `"METHOD /path"` โดยทุก segment ที่เป็น
 * ตัวเลขถูกแทนด้วย `:id` แล้ว (ดู `routeKey()`) เช่น
 * `PATCH /apps/5/companies/12/renew` → `PATCH /apps/:id/companies/:id/renew`
 *
 * ครอบคลุม mutating endpoint ทุกตัวที่ยังไม่มี service เขียนเอง — ถ้ามี
 * route ใหม่หลุดตาราง `deriveAction()` จะยังให้ชื่อที่อ่านรู้เรื่องอยู่ดี
 */
const ROUTE_ACTIONS: Record<string, string> = {
  /* --- card group: กรอกเวลาจริง (route เดียวในกลุ่มนี้ที่ service ไม่ได้เขียนเอง) --- */
  "PUT /issues/:id/time": "card.timeLogged",

  /* --- card group: ไฟล์แนบ + จับเวลา --- */
  "POST /issues/:id/attachments": "attachment.added",
  "DELETE /attachments/:id": "attachment.removed",
  "POST /work-sessions/issue/:id/start": "workSession.started",
  "POST /work-sessions/issue/:id/stop": "workSession.stopped",

  /* --- user group: ผู้ใช้ --- */
  "POST /users": "user.created",
  "PATCH /users/:id": "user.updated",
  "PATCH /users/:id/active": "user.toggled",
  "DELETE /users/:id": "user.deleted",

  /* --- user group: บทบาท --- */
  "POST /roles": "role.created",
  "PATCH /roles/:id": "role.updated",
  "PATCH /roles/:id/active": "role.toggled",
  "PUT /roles/:id/permissions": "role.permissionsChanged",
  "DELETE /roles/:id": "role.deleted",

  /* --- user group: ตำแหน่ง --- */
  "POST /positions": "position.created",
  "PATCH /positions/:id": "position.updated",
  "PATCH /positions/:id/active": "position.toggled",
  "PUT /positions/:id/permissions": "position.permissionsChanged",
  "DELETE /positions/:id": "position.deleted",

  /* --- user group: เมทริกซ์สิทธิ์ --- */
  "PUT /permissions": "permission.matrixUpdated",
  "POST /permissions/reset": "permission.reset",
  "POST /permissions/refresh": "permission.refreshed",

  /* --- user group: บัญชี/โปรไฟล์ของตัวเอง (login ไม่มี JWT จึงอ่าน actor จาก response) --- */
  "POST /auth/login": "auth.login",
  "PATCH /auth/profile": "auth.profileUpdated",
  "PATCH /auth/profile/email": "auth.emailChanged",
  "PATCH /auth/profile/password": "auth.passwordChanged",
  "POST /auth/profile/reset-password": "auth.passwordReset",
  "POST /auth/profile/avatar": "auth.avatarChanged",
  "DELETE /auth/profile/avatar": "auth.avatarRemoved",

  /* --- data group: สถานะคอลัมน์ --- */
  "POST /issue-statuses": "status.created",
  "PATCH /issue-statuses/reorder": "status.reordered",
  "PATCH /issue-statuses/:id": "status.updated",
  "PATCH /issue-statuses/:id/active": "status.toggled",
  "DELETE /issue-statuses/:id": "status.deleted",

  /* --- data group: ความสำคัญ --- */
  "POST /issue-priorities": "priority.created",
  "PATCH /issue-priorities/:id": "priority.updated",
  "PATCH /issue-priorities/:id/active": "priority.toggled",
  "DELETE /issue-priorities/:id": "priority.deleted",

  /* --- data group: หมวดหมู่ --- */
  "POST /categories": "category.created",
  "PATCH /categories/:id": "category.updated",
  "PATCH /categories/:id/active": "category.toggled",
  "DELETE /categories/:id": "category.deleted",

  /* --- data group: ป้ายกำกับ --- */
  "POST /labels": "label.created",
  "PATCH /labels/:id": "label.updated",
  "PATCH /labels/:id/active": "label.toggled",
  "DELETE /labels/:id": "label.deleted",

  /* --- data group: บริษัท --- */
  "POST /companies": "company.created",
  "PATCH /companies/:id": "company.updated",
  "PATCH /companies/:id/active": "company.toggled",
  "DELETE /companies/:id": "company.deleted",

  /* --- data group: แอป --- */
  "POST /apps": "app.created",
  "PATCH /apps/:id": "app.updated",
  "PATCH /apps/:id/active": "app.toggled",
  "DELETE /apps/:id": "app.deleted",

  /* --- data group: ช่วงสัญญา แอป×บริษัท (append/patch/delete + renew + ซื้อชม.) --- */
  "POST /apps/:id/companies": "contract.created",
  "PATCH /apps/:id/companies/:id": "contract.updated",
  "DELETE /apps/:id/companies/:id": "contract.deleted",
  "POST /apps/:id/companies/:id/renew": "contract.renewed",
  "POST /apps/:id/companies/:id/buy-hours": "contract.hoursPurchased",
};

/**
 * Routes the interceptor must stay away from.
 *
 * **Group A — already written by a service** (card/comment/rule): the engine
 * writes the *rich* row (`{ from, to }` for a move, the edited field names…);
 * an interceptor row on top would double every one of them.
 *
 * **Group B — not worth an audit row**: reading the inbox deletes a row
 * (`DELETE /notifications/:id`), and the two public password-flow routes have
 * no actor and are trivially spammable.
 */
const SKIP_ROUTES = new Set([
  // Group A — service already logged it (14)
  "POST /issues",
  "PUT /issues/:id",
  "PUT /issues/:id/move",
  "PUT /issues/:id/assign",
  "PUT /issues/:id/unlock",
  "PUT /issues/:id/restore",
  "DELETE /issues/:id",
  "POST /issues/:id/comments",
  "PUT /comments/:id",
  "DELETE /comments/:id",
  "POST /rules",
  "PUT /rules/:id",
  "PATCH /rules/:id/toggle",
  "DELETE /rules/:id",
  // Group B — not an auditable action (4)
  "DELETE /notifications/:id",
  "DELETE /notifications",
  "POST /auth/forgot-password",
  "POST /auth/reset-password",
]);

/**
 * noun for the fallback derivation — keyed by the **first path segment**.
 * A route missing from `ROUTE_ACTIONS` still lands on a word a human reads
 * (`POST /widgets` → `widget.created`) instead of `unknown.created`.
 */
const NOUN_BY_SEGMENT: Record<string, string> = {
  users: "user",
  roles: "role",
  positions: "position",
  permissions: "permission",
  issues: "card",
  comments: "comment",
  rules: "rule",
  "issue-statuses": "status",
  "issue-priorities": "priority",
  categories: "category",
  labels: "label",
  companies: "company",
  apps: "app",
  attachments: "attachment",
  "work-sessions": "workSession",
  auth: "auth",
  notifications: "notification",
};

/**
 * The subset of Express's `Request` this interceptor reads — declared
 * structurally so the file does not depend on `@types/express` being visible.
 * Everything is optional: a mocked context in a test must not throw.
 */
interface MutatingRequest {
  method?: string;
  path?: string;
  params?: Record<string, string | undefined>;
  body?: unknown;
  /** multer attaches it for the two upload routes (read *after* the handler). */
  file?: { originalname?: string; size?: number };
  /** Set by `JwtStrategy.validate()` for every non-`@Public()` route. */
  user?: { id?: unknown };
}

/**
 * `METHOD /path` with numeric segments collapsed to `:id`, or `null` when the
 * request does not mutate anything (GET) or carries no path at all.
 *
 * `/apps/5/companies/12/renew` → `POST /apps/:id/companies/:id/renew` — the
 * same shape every table key above is written in.
 */
function routeKey(req: MutatingRequest): string | null {
  const method = (req.method ?? "").toUpperCase();
  if (!MUTATING.has(method)) return null;
  const path = typeof req.path === "string" ? req.path.split("?")[0] : "";
  if (!path) return null;
  return `${method} ${path.replace(/\/\d+(?=\/|$)/g, "/:id")}`;
}

/**
 * Action for a route the table does not know yet — the reason a brand-new
 * endpoint is still audited without anyone remembering to touch this file.
 *
 * noun comes from the first segment; verb from the **last** segment when it
 * is a plain word (`/users/:id/active` → `user.active`), otherwise from the
 * method (`POST` → `created`, `DELETE` → `deleted`, `PATCH`/`PUT` → `updated`).
 */
function deriveAction(key: string): string {
  const [method, path] = key.split(" ");
  const segments = (path ?? "").split("/").filter(Boolean);
  const noun = NOUN_BY_SEGMENT[segments[0] ?? ""] ?? segments[0] ?? "unknown";
  const last = segments[segments.length - 1] ?? "";
  // only a *trailing* segment may become the verb — with a single segment
  // (`POST /frobs`) `last` IS the noun and would yield `frobs.frobs`
  const named =
    segments.length > 1 && last && last !== ":id" && !/^\d+$/.test(last) ? last : "";
  const verb =
    named ||
    (method === "POST" ? "created" : method === "DELETE" ? "deleted" : "updated");
  return `${noun}.${verb}`;
}

/** `Number("5")` → 5 · anything else (undefined, "abc", 0) → null. */
function toId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * `detail` = request body with secret-looking keys stripped, plus the multer
 * file's name/size for the two upload routes (the bytes themselves never go
 * near the log).
 *
 * Oversized bodies (the permission matrix is the big one) collapse to
 * `{ _truncated, _fields }` so the JSON stays parseable — the feed's payload
 * column would otherwise silently become `null` for that row.
 */
function buildDetail(req: MutatingRequest): string | null {
  const detail: Record<string, unknown> = {};
  const dropped: string[] = [];

  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key.toLowerCase())) {
        dropped.push(key);
        continue;
      }
      detail[key] = value;
    }
  }

  // multer ran before the handler — read it now, not at intercept time
  if (req.file) {
    detail.filename = req.file.originalname ?? null;
    detail.fileSize = req.file.size ?? null;
  }

  // keeping the names (not the values) proves a password field was part of it
  if (dropped.length > 0) detail.redacted = [...new Set(dropped)];

  if (Object.keys(detail).length === 0) return null;

  const json = JSON.stringify(detail);
  if (json.length <= MAX_DETAIL_CHARS) return json;
  return JSON.stringify({ _truncated: true, _fields: Object.keys(detail) });
}

/**
 * Who did it: the JWT user for every authenticated route; for `POST /auth/login`
 * (a `@Public()` route, so no token yet) the response body's `user.id` — the
 * only moment where the actor exists solely on the way out.
 *
 * Both come back as **strings** (`String(user.id)` / `toPublicUser()`), hence
 * `toId()` on each.
 */
function actorIdOf(req: MutatingRequest, response: unknown): number | null {
  const fromRequest = toId(req.user?.id);
  if (fromRequest !== null) return fromRequest;
  const user = (response as { user?: { id?: unknown } } | null)?.user;
  return toId(user?.id);
}

/**
 * Which row this touched: `issueId` (work-sessions) → `id` (the usual case)
 * → `recordId`. Only stored as metadata — the card timeline no longer reads
 * this column generically (see `findByIssue`), so a user/app id landing here
 * can never surface on some unrelated issue's history.
 */
function entityIdOf(req: MutatingRequest): number | null {
  const params = req.params ?? {};
  return toId(params.issueId) ?? toId(params.id) ?? toId(params.recordId);
}

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityLogs: Repository<ActivityLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<MutatingRequest>();

    const key = routeKey(req);
    if (key === null || SKIP_ROUTES.has(key)) return next.handle();

    const action = ROUTE_ACTIONS[key] ?? deriveAction(key);

    // mergeMap (not concatMap): one request's log write must never queue
    // behind another's — the response is released as soon as its own row lands.
    return next.handle().pipe(
      mergeMap(async (response: unknown) => {
        try {
          await this.activityLogs.save(
            this.activityLogs.create({
              action,
              entityId: entityIdOf(req),
              detail: buildDetail(req),
              // only the id is stored — name/role are joined off `users` at read time
              actorId: actorIdOf(req, response),
            }),
          );
        } catch {
          // fail-open: an audit row must never break the request that made it
        }
        return response;
      }),
    );
  }
}
