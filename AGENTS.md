# AGENTS.md

> Bilingual (English + ไทย). Keep both versions in sync when editing.

## Communication / การสื่อสาร

- Reply to the user in **both English and Thai** — when you explain, summarize, or report results, include a Thai version too. The team is Thai. Keep code, identifiers, and commit messages in English.
- **ไทย:** ตอบผู้ใช้เป็น **สองภาษา (อังกฤษ + ไทย)** เสมอ — เวลาอธิบาย สรุป หรือรายงานผล ให้แนบภาษาไทยด้วย เพราะทีมเป็นคนไทย; ส่วนโค้ด ชื่อตัวแปร และ commit message ใช้ภาษาอังกฤษ

## Project / โปรเจกต์

- Kanban Issue Tracker — Next.js (App Router) + MUI + next-intl frontend, NestJS + TypeORM backend, PostgreSQL. Monorepo via **npm workspaces + Turborepo**.
- There is **no root README**. `AGENT.md` and `design.md` are Thai and aspirational/stale: they say pnpm, UUID PKs, refresh tokens, 15m JWTs, `DATABASE_*` env vars, register page. Trust `package.json` / `apps/api/.env` / code over those docs.
- **ไทย:** โปรเจกต์ Kanban Issue Tracker ใช้ Next.js (App Router) + MUI + next-intl, NestJS + TypeORM, PostgreSQL เป็น monorepo ด้วย **npm workspaces + Turborepo**
- **ไทย:** ไม่มี README ที่ root; `AGENT.md` และ `design.md` เป็นภาษาไทยแต่ล้าสมัย (บอกว่าใช้ pnpm, PK เป็น UUID, มี refresh token, JWT 15 นาที, env `DATABASE_*`, มีหน้าสมัครสมาชิก) — ให้ยึด `package.json` / `apps/api/.env` / โค้ดจริง

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
- `npm run migration:run` / `migration:generate` are **broken**: scripts point at `dist/data-source.js`, but `apps/api/src/data-source.ts` does not exist. `migration:generate` also needs a name/path argument.
- **ไทย:** `npm test` ยังรันไม่ผ่าน เพราะ api มีสคริปต์ `jest` แต่ไม่มี config และไม่มีไฟล์เทสต์ ส่วน web ไม่มีสคริปต์ `test`
- **ไทย:** คำสั่ง migration ทั้งสองใช้ไม่ได้ เพราะอ้าง `dist/data-source.js` ที่ยังไม่มีไฟล์ต้นทาง `apps/api/src/data-source.ts`

## Structure / โครงสร้าง

- `apps/web` — Next.js frontend. Path alias `@/*` → `src/*`. Imports `@kanban/shared` as raw TS. Uses `next-intl` for i18n (locales: `th` default, `en`).
- `apps/api` — NestJS. Implemented: `auth`, `permissions`, `users`, `roles`, `positions`. Still **empty module stubs**: `boards`, `columns`, `issues`, `comments`, `labels` (module file only).
- `packages/shared` — types/DTOs/permissions consumed as raw TS (`main` → `src/index.ts`); **no build step**. Resolved via workspace symlink and root tsconfig path `@kanban/shared` → `packages/shared/src`.
- **ไทย:** `apps/web` ใช้ alias `@/*` → `src/*` และ import `@kanban/shared` เป็น TS ตรง ๆ; ใช้ `next-intl` สำหรับ i18n (locale เริ่มต้น `th`)
- **ไทย:** `apps/api` implement แล้ว `auth`, `permissions`, `users`, `roles`, `positions`; `boards`, `columns`, `issues`, `comments`, `labels` ยังเป็น module เปล่า
- **ไทย:** `packages/shared` ถูกใช้เป็น TS ดิบ (`main` → `src/index.ts`) ไม่มี build step

## Backend facts / ข้อเท็จจริงฝั่ง backend

- `main.ts`: global `ValidationPipe({ whitelist: true, transform: true })`, wide-open CORS, listens on `PORT` ?? 3002.
- `JwtAuthGuard` is registered **globally** via `APP_GUARD`; opt out per route with `@Public()`. Secret `JWT_SECRET` (default `"secret"`), expiry **7d**. No refresh-token flow.
- `AuthService.onModuleInit` seeds `admin@example.com` / `admin123`, and resets passwords of `aom@`, `arthitaya@`, `programmer@` gmail accounts to `123456`.
- `User.id` is an **integer** auto-increment PK (not UUID); password column is named `password` but maps to `passwordHash`. `RolePermission.id` **is** a uuid — PK types are mixed. `packages/shared` types say `id: string`; the API returns `String(user.id)`.
- DB env vars are `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` (`apps/api/.env`); code defaults `localhost` / `5432` / `postgres` / `1234` / `trackdb`. `synchronize: false` always — tables must already exist (and migrations are broken, above).
- **Roles are `"admin" | "programmer" | "user"`** (not `"member"`). Defined in `packages/shared` `Role` type and `PermissionsService.ALL_ROLES`.
- **`permissions` table** (queried via raw SQL, not a TypeORM entity): columns `id`, `code`, `action`, `category`. `role_permissions` table: TypeORM entity with uuid `id`, `role`, `permission`.
- **`Position` entity**: `id` (int), `name` (unique). `User` has nullable `position` column (only for programmers).
- **Known bug:** `PositionsModule` does not import `PermissionsModule`, but `PositionsController` uses `@UseGuards(RolesGuard)` — `RolesGuard` is not available in that module context. Fix: add `PermissionsModule` to `PositionsModule` imports.
- **ไทย:** `JwtAuthGuard` ถูกตั้งเป็น global guard ผ่าน `APP_GUARD`; ยกเว้นด้วย `@Public()` ราย route. JWT หมดอายุ 7 วัน ไม่มี refresh flow
- **ไทย:** `AuthService.onModuleInit` seed ผู้ใช้ `admin@example.com` / `admin123` และรีเซ็ตรหัสบัญชี gmail `aom@`, `arthitaya@`, `programmer@` เป็น `123456`
- **ไทย:** `User.id` เป็น integer (ไม่ใช่ UUID) และคอลัมน์ `password` map ไป `passwordHash`; ส่วน `RolePermission.id` เป็น uuid (PK ปนกัน). `synchronize: false` เสมอ ต้องสร้างตารางเอง
- **ไทย:** Role คือ `"admin" | "programmer" | "user"` (ไม่ใช่ `"member"`)
- **ไทย:** ตาราง `permissions` (query ด้วย SQL ตรง ๆ ไม่ใช่ TypeORM entity) มีคอลัมน์ `id`, `code`, `action`, `category`
- **ไทย:** บั๊ก: `PositionsModule` ไม่ได้ import `PermissionsModule` แต่ `PositionsController` ใช้ `RolesGuard` — ต้องเพิ่ม `PermissionsModule` ใน imports

## Authorization (implemented — extend, don't reinvent) / สิทธิ์การเข้าถึง

- Permission-driven authz **already exists**: `@Permissions(...)` decorator + `RolesGuard` in `apps/api/src/modules/auth/`. Roles are `"admin" | "programmer" | "user"`; permissions live in `packages/shared/src/permissions.ts`.
- `@Permissions()` alone does **nothing**. You must also apply `@UseGuards(RolesGuard)` (per route or controller). Examples: `auth.controller.ts`, `permissions.controller.ts`, `users.controller.ts`.
- Runtime checks query the DB through `PermissionsService` (`role_permissions` table), **not** `ROLE_PERMISSIONS`. `ROLE_PERMISSIONS` / `roleHasPermission` are only the seed + the frontend mirror (`apps/web/src/lib/permissions.ts`, `usePermissions().can`), so they can drift after an admin edits the matrix.
- `hasPermission` short-circuits: always returns `true` for `admin`.
- **ไทย:** ระบบสิทธิ์แบบ permission-driven มีอยู่แล้ว (`@Permissions()` + `RolesGuard`). ต้องใส่ `@UseGuards(RolesGuard)` ด้วย ไม่งั้น `@Permissions()` ไม่มีผล
- **ไทย:** ตอนตรวจสิทธิ์จริงอ่านจาก DB ผ่าน `PermissionsService` (ตาราง `role_permissions`) ไม่ได้อ่าน `ROLE_PERMISSIONS` — ตัวหลังเป็นแค่ seed + ฝั่ง frontend จึงอาจไม่ตรงกันหลังแอดมินแก้เมทริกซ์
- **ไทย:** `hasPermission` คืน `true` เสมอสำหรับ `admin`

## Frontend facts / ข้อเท็จจริงฝั่ง frontend

- **i18n is implemented** with `next-intl`: locales `["th", "en"]`, default `th`. Messages in `src/messages/{th,en}.json`. Use `useTranslations()` from `next-intl` in client components.
- **Navigation**: use `useRouter`, `usePathname`, `Link`, `redirect` from `@/i18n/navigation` — NOT from `next/navigation`.
- **Middleware**: `middleware.ts` (root + `src/`) is next-intl locale middleware, not auth. Auth is still client-side only (pages redirect in `useEffect`).
- **Routes**: `/` (dashboard), `/login`, `/users` (full CRUD for users/roles/positions + permission matrix), `/boards`, `/issues`, `/labels`, `/comments` (coming-soon stubs). All under `[locale]/`.
- **`[locale]/layout.tsx`**: `generateStaticParams` returns all locales; `notFound()` for invalid locale; wraps children in `QueryClientProvider` + `ThemeProvider` + `NextIntlClientProvider`.
- Theme: `apps/web/src/lib/theme.ts`; `ThemeProvider` + `CssBaseline` wired in `[locale]/layout.tsx`. It augments MUI with palette colors `navy` / `sky` and `theme.custom.loginGradient` / `theme.custom.cardShadow`. Use these tokens; do not hardcode hex.
- Auth state: Zustand `useAuthStore`, persisted under key `kanban-auth` (localStorage when "remember me", else sessionStorage). `AuthUser` has `id`, `email`, `name`, `role` (no `position`).
- API base URL `NEXT_PUBLIC_API_URL` (default `http://localhost:3002`) via `apiFetch` in `src/lib/api.ts`. `apiFetch` throws `ApiError` (has `status`, `message`).
- `usePermissions()` hook (`src/lib/permissions.ts`): returns `{ role, permissions, can }`. Defaults to `"user"` role when logged out. Used to gate UI (e.g., sidebar users nav, users page).
- **Two `DataTable` components exist**: `src/components/data-table.tsx` (styled with navy header / sky hover, used) and `src/components/data-table/index.tsx` (older, unused). Import from `@/components/data-table`.
- **ไทย:** i18n ใช้ `next-intl` แล้ว: locale `["th", "en"]` ค่าเริ่มต้น `th`. ข้อความใน `src/messages/{th,en}.json`
- **ไทย:** ใช้ `useRouter`/`usePathname`/`Link`/`redirect` จาก `@/i18n/navigation` ไม่ใช่จาก `next/navigation`
- **ไทย:** `middleware.ts` เป็น next-intl locale middleware ไม่ใช่ auth; การป้องกัน route ทำฝั่ง client เท่านั้น
- **ไทย:** Route ทั้งหมดอยู่ใต้ `[locale]/`: `/`, `/login`, `/users` (CRUD ครบ), `/boards`, `/issues`, `/labels`, `/comments` (ยังเป็น stub)
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
- **ไทย:** ห้าม hardcode สี hex/rgba ให้ดึงจากธีมเสมอ; การตรวจสิทธิ์ต้องอิง permission ไม่กระจาย `if (role === ...)`
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
