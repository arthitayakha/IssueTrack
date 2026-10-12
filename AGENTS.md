# AGENTS.md

> Bilingual (English + ไทย). Keep both versions in sync when editing.
> **Full design doc → `design.md` (Thai, latest).** This file is compact agent instructions only.

## Communication / การสื่อสาร

- Reply to the user in **both English and Thai** — when you explain, summarize, or report results, include a Thai version too. The team is Thai. Keep code, identifiers, and commit messages in English.
- **ไทย:** ตอบผู้ใช้เป็น **สองภาษา (อังกฤษ + ไทย)** เสมอ — เวลาอธิบาย สรุป หรือรายงานผล ให้แนบภาษาไทยด้วย เพราะทีมเป็นคนไทย; ส่วนโค้ด ชื่อตัวแปร และ commit message ใช้ภาษาอังกฤษ

## Project / โปรเจกต์

- Kanban Issue Tracker — Next.js (App Router) + MUI + next-intl frontend, NestJS + TypeORM backend, PostgreSQL. Monorepo via **npm workspaces + Turborepo**.
- **No root README.** `AGENT.md` is stale/aspirational (pnpm, UUID PKs, refresh tokens, 15m JWTs, `DATABASE_*` env, register page). Trust `package.json` / `apps/api/.env` / code over it.
- **ไทย:** โปรเจกต์ Kanban Issue Tracker ใช้ Next.js + MUI + next-intl, NestJS + TypeORM, PostgreSQL เป็น monorepo ด้วย **npm workspaces + Turborepo**
- **ไทย:** ไม่มี README ที่ root; `AGENT.md` ล้าสมัย — ให้ยึด `package.json` / `apps/api/.env` / โค้ดจริง

## Commands / คำสั่ง

Run from the repo root. **ไทย:** รันจาก root ของ repo

```bash
npm install
npm run dev                            # turbo: web + api
npm run dev --workspace=@kanban/web    # frontend only
npm run dev --workspace=@kanban/api    # backend only
npm run lint
npm run typecheck
npm run build
npm test                               # effectively broken — see below
npm run migration:run                  # broken — see below
npm run migration:generate
```

- `npm test` cannot pass as-is: the api `jest` script exists but there is **no jest config and no test files**; web has no `test` script. `turbo.json` also makes `test` depend on `build`.
- `npm run migration:run` / `migration:generate` are **broken**: scripts point at `dist/data-source.js`, but `apps/api/src/data-source.ts` does not exist. `migration:generate` also needs a name/path argument. SQL migrations live in `apps/api/migrations/`; TS migrations in `apps/api/src/migrations/`.
- **ไทย:** `npm test` ยังรันไม่ผ่าน เพราะไม่มี jest config และไม่มีไฟล์เทสต์
- **ไทย:** คำสั่ง migration ใช้ไม่ได้ เพราะอ้าง `dist/data-source.js` ที่ไม่มีไฟล์ต้นทาง

## Structure / โครงสร้าง

- `apps/web` — Next.js frontend. Path alias `@/*` → `src/*`. Imports `@kanban/shared` as raw TS. Uses `next-intl` for i18n (locales: `th` default, `en`).
- `apps/api` — NestJS. Implemented (controller + service): `auth`, `permissions`, `users`, `roles`, `positions`, `columns`, `issues`, `issue-statuses`, `issue-priorities`, `categories`, `activity-logs`, `work-sessions`, `comments`, `attachments`, `labels`. **Only `notifications` is a stub** (entity only). **There is NO `boards` module/table** — the app is single-board; see Domain rules.
- `packages/shared` — types/DTOs/permissions consumed as raw TS (`main` → `src/index.ts`); **no build step**. Resolved via workspace symlink and root tsconfig path `@kanban/shared` → `packages/shared/src`.
- **ไทย:** `apps/web` ใช้ alias `@/*` → `src/*` และ import `@kanban/shared` เป็น TS ตรง ๆ; ใช้ `next-intl` (locale เริ่มต้น `th`)
- **ไทย:** `apps/api` implement แล้ว (มี controller + service): `auth`, `permissions`, `users`, `roles`, `positions`, `columns`, `issues`, `issue-statuses`, `issue-priorities`, `categories`, `activity-logs`, `work-sessions`, `comments`, `attachments`, `labels`; เหลือแค่ `notifications` ที่ยังเป็น stub (มี entity อย่างเดียว). **ไม่มีโมดูล/ตาราง `boards`** — แอปเป็นแบบบอร์ดเดียว ดูหัวข้อข้อจำกัดระบบ
- **ไทย:** `packages/shared` ถูกใช้เป็น TS ดิบ ไม่มี build step

## Domain rules — single board / ข้อจำกัดระบบ — บอร์ดเดียว

- **One board only.** Do NOT add a `boards` table/entity/controller/service, a board list, a board selector, or board CRUD. The app is single-board.
- The sidebar "บอร์ด"/"Board" item links straight to `/boards` — that page **is** the board (no intermediate board list). `fetchColumns()`/`fetchIssues()` hit global `/columns` and `/issues`.
- **"Add column" = "add status".** `AddColumnInline` (`[locale]/boards/page.tsx`) picks an existing status from `GET /issue-statuses`, and `ColumnsService.create` inserts a `board_columns` row whose `status` is that name. `customName` is only a display label. So a column is a status + optional display name.
- Columns are **global** — `BoardColumn` has no `boardId`; `Issue.columnId` maps to `board_columns.id` (via the DB column `board_id`).
- **Drift / legacy — do not reintroduce `board_id`:** migration `1791200000000-RemoveBoardsAndAddTimeTracking.ts` dropped `board_id`, but `Issue` still maps the `board_id` DB column → `columnId` (`issues/entities/issue.entity.ts:101`) and `[locale]/issues/page.tsx:62` still calls the dead `/issues/boards/1/issues` route (not in `IssuesController`). The real endpoint is `GET /issues`.
- **ไทย:** มีบอร์ดเดียว — ห้ามเพิ่มตาราง `boards`, entity/controller/service ของบอร์ด, หน้ารวมบอร์ด, ตัวเลือกบอร์ด หรือ CRUD บอร์ด
- **ไทย:** ปุ่ม "บอร์ด" เข้า `/boards` ตรง ๆ หน้านั้นคือตัวบอร์ด; `fetchColumns()`/`fetchIssues()` ยิง `/columns` และ `/issues` แบบ global
- **ไทย:** "เพิ่มคอลัมน์" = "เพิ่มสถานะ" — เลือกสถานะจาก `GET /issue-statuses` แล้วสร้างแถว `board_columns` โดยใช้ชื่อสถานะเป็น `status`; `customName` เป็นแค่ชื่อที่แสดง
- **ไทย:** คอลัมน์เป็น global (`BoardColumn` ไม่มี `boardId`); `Issue.columnId` map ไป `board_columns.id`
- **ไทย:** อย่านำ `board_id` กลับมา — migration `1791200000000` ลบไปแล้ว แต่ entity `Issue` ยัง map คอลัมน์ `board_id` → `columnId` และหน้า `issues` ยังเรียก `/issues/boards/1/issues` ที่ตายแล้ว; endpoint จริงคือ `GET /issues`

## Backend facts / ข้อเท็จจริงฝั่ง backend

- `main.ts`: global `ValidationPipe({ whitelist: true, transform: true })`, wide-open CORS, listens on `PORT` ?? 3002.
- `JwtAuthGuard` is registered **globally** via `APP_GUARD`; opt out per route with `@Public()`. Secret `JWT_SECRET` (default `"secret"`), expiry **7d**. No refresh-token flow.
- `AuthService.onModuleInit` seeds `admin@example.com` / `admin123`, and resets passwords of `aom@`, `arthitaya@`, `programmer@` gmail accounts to `123456`.
- `User.id` is an **integer** auto-increment PK (not UUID); password column is named `password` but maps to `passwordHash`. `RolePermission.id` **is** a uuid — PK types are mixed. `packages/shared` types say `id: string`; the API returns `String(user.id)`.
- DB env vars are `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` (`apps/api/.env`); code defaults `localhost` / `5432` / `postgres` / `1234` / `trackdb`. `synchronize: false` always — tables must already exist (and migrations are broken, above).
- **Roles are `"admin" | "programmer" | "customer"`** (3 roles, stored in the `roles` table — not an enum). Renamed from `"user"` → `"customer"` (done); see `design.md` §8.
- **`permissions` table** (queried via raw SQL, not a TypeORM entity): columns `id`, `code`, `action`, `category`. `role_permissions` table: TypeORM entity with uuid `id`, `role`, `permission`.
- **`Position` entity**: `id` (int), `name` (unique), nullable `role_id` → `Role`, and a `position_permissions` relation. `User` has a nullable `position` column. Effective perms = role perms ∪ position perms; `PermissionsService.hasPermission(roleId, permission, positionId?)` checks both, and JWT carries `positionId`.
- **ไทย:** `JwtAuthGuard` เป็น global guard ผ่าน `APP_GUARD`; ยกเว้นด้วย `@Public()`. JWT หมดอายุ 7 วัน ไม่มี refresh flow
- **ไทย:** `User.id` เป็น integer คอลัมน์ `password` map ไป `passwordHash`; `RolePermission.id` เป็น uuid (PK ปนกัน). `synchronize: false` เสมอ ต้องสร้างตารางเอง
- **ไทย:** Role คือ `"admin" | "programmer" | "customer"` (3 บทบาท เก็บในตาราง `roles`) เปลี่ยนแล้วจาก `"user"` เป็น `"customer"`
- **ไทย:** ตาราง `permissions` query ด้วย SQL ตรง ไม่ใช่ entity; `positions` เชื่อม role แล้ว (`role_id`) และเพิ่ม permission ได้ผ่านตาราง `position_permissions`; `hasPermission` เช็คทั้ง role และ position

## Authorization (implemented — extend, don't reinvent) / สิทธิ์การเข้าถึง

- Permission-driven authz **already exists**: `@Permissions(...)` decorator + `RolesGuard` in `apps/api/src/modules/auth/`. Permissions live in `packages/shared/src/permissions.ts`.
- `@Permissions()` alone does **nothing**. You must also apply `@UseGuards(RolesGuard)` (per route or controller).
- Runtime checks query the DB through `PermissionsService` (`role_permissions` table), **not** `ROLE_PERMISSIONS`. `ROLE_PERMISSIONS` / `roleHasPermission` are only the seed + the frontend mirror (`apps/web/src/lib/permissions.ts`, `usePermissions().can`), so they can drift after an admin edits the matrix.
- `hasPermission` short-circuits: always returns `true` for `admin`.
- **ไทย:** ต้องใส่ `@UseGuards(RolesGuard)` ด้วย ไม่งั้น `@Permissions()` ไม่มีผล
- **ไทย:** ตอนตรวจสิทธิ์จริงอ่านจาก DB ผ่าน `PermissionsService` ไม่ใช่ `ROLE_PERMISSIONS`
- **ไทย:** `hasPermission` คืน `true` เสมอสำหรับ `admin`

## Frontend facts / ข้อเท็จจริงฝั่ง frontend

- **i18n is implemented** with `next-intl`: locales `["th", "en"]`, default `th`. Messages in `src/messages/{th,en}.json`. Use `useTranslations()` from `next-intl` in client components.
- **Navigation**: use `useRouter`, `usePathname`, `Link`, `redirect` from `@/i18n/navigation` — NOT from `next/navigation`.
- **Middleware**: `middleware.ts` (root + `src/`) is next-intl locale middleware, not auth. Auth is still client-side only (pages redirect in `useEffect`).
- **Routes**: `/` (dashboard), `/login`, `/users`, `/roles`, `/settings`, `/boards`, `/issues`, `/labels`, `/comments`. All under `[locale]/`.
- **`[locale]/layout.tsx`**: `generateStaticParams` returns all locales; `notFound()` for invalid locale; wraps children in `QueryClientProvider` + `ThemeProvider` + `NextIntlClientProvider`.
- Theme: `apps/web/src/lib/theme.ts`; `ThemeProvider` + `CssBaseline` wired in `[locale]/layout.tsx`. It augments MUI with palette colors `navy` / `sky` and `theme.custom.loginGradient` / `theme.custom.cardShadow`. Use these tokens; do not hardcode hex.
- Auth state: Zustand `useAuthStore`, persisted under key `kanban-auth` (localStorage when "remember me", else sessionStorage).
- API base URL `NEXT_PUBLIC_API_URL` (default `http://localhost:3002`) via `apiFetch` in `src/lib/api.ts`. `apiFetch` throws `ApiError` (has `status`, `message`).
- `usePermissions()` hook (`src/lib/permissions.ts`): returns `{ roleName, permissions, can }`. Defaults to the `"customer"` role when logged out.
- **Two `DataTable` components exist**: `src/components/data-table.tsx` (styled, used) and `src/components/data-table/index.tsx` (older, unused). Import from `@/components/data-table`.
- **ไทย:** ใช้ `useRouter`/`usePathname`/`Link`/`redirect` จาก `@/i18n/navigation` ไม่ใช่จาก `next/navigation`
- **ไทย:** `middleware.ts` เป็น locale middleware ไม่ใช่ auth; การป้องกัน route ทำฝั่ง client เท่านั้น
- **ไทย:** ห้าม hardcode สี hex/rgba ให้ดึงจากธีมเสมอ; การตรวจสิทธิ์ต้องอิง permission ไม่กระจาย `if (role === ...)`

## Conventions / ข้อตกลง

- **npm only** — no pnpm/yarn despite `AGENT.md`; `packageManager` is `npm@10.9.2`. `.npmrc` sets `shamefully-hoist=true`.
- TypeScript strict; avoid `any`.
- Server Components by default; `"use client"` only for interactivity (most current pages are client components).
- **Colors: never hardcode hex/rgba in components.** Pull from the theme — `theme.palette.*`, `sx` tokens like `color: "primary.main"`, or `theme.custom.*`.
- Authorization must stay permission-driven. Do not scatter `if (role === ...)` checks.
- Conventional Commits. Run `npm run lint` and `npm run typecheck` before committing.
- **ไทย:** ใช้ **npm เท่านั้น** (ห้าม pnpm/yarn) แม้ `AGENT.md` จะบอกเป็นอย่างอื่น
- **ไทย:** TypeScript strict เลี่ยง `any`; Server Component เป็นค่าเริ่มต้น ใช้ `"use client"` เฉพาะที่ต้อง interactivity
- **ไทย:** ห้าม hardcode สี hex/rgba ให้ดึงจากธีมเสมอ; การตรวจสิทธิ์ต้องอิง permission
- **ไทย:** ใช้ Conventional Commits และรัน `npm run lint` + `npm run typecheck` ก่อน commit

## Ports / พอร์ต

- Frontend: 3000 (3001 if taken). Backend: 3002.
- **ไทย:** ฝั่งหน้าเว็บ 3000 (ถ้าถูกใช้จะ 3001) ฝั่ง backend 3002

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
