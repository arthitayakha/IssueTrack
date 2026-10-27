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
npm test                                    # jest unit tests (apps/api) — no DB, no build
npm run test:e2e --workspace=@kanban/api    # 4 live suites — needs API on 3002 + local DB
npm run migration:run                       # no-op while nothing is pending
npm run migration:generate                  # needs a name/path argument
```

- `npm test` runs jest in `apps/api` only (web has no `test` script): config `apps/api/jest.config.js`, specs in `apps/api/src/__tests__/` (rules engine/service/registry + th/en key parity). `turbo.json` deliberately gives `test` **no `dependsOn: build`**, so it stays fast and safe next to a running `npm run dev`.
- `npm run test:e2e --workspace=@kanban/api` runs `apps/api/test/e2e/run-all.js` — suites `rules-api`, `engine-actions`, `run-history`, `notifications` against a live API + DB. They log in with seeded accounts, create and delete test data, and **suspend any rule already in the DB, restoring its `isActive` afterwards** (hand-made rules would otherwise move the test cards). Not part of `npm test`.
- `migration:run` **works** — the scripts point at `src/data-source.ts` (NOT `dist/data-source.js`), and it tracks only the 4 TS migrations in `apps/api/src/migrations/` (they are already in the `migrations` table, so a run prints "No migrations are pending"). Raw SQL in `apps/api/migrations/*.sql` is applied by hand and is not tracked. Three extra TS files live in `apps/api/migrations/` and are **not wired into data-source**: `1794000000000-AddStatusTimerLockColumns` was applied by hand (columns exist), `1793000000000-DropUnusedIssueColumns` was **not** (`issues.assigned_at` still exists).
- `migration:generate` still needs a name/path argument.
- **ไทย:** `npm test` รัน jest ใน `apps/api` เท่านั้น (web ไม่มี script `test`) — config ที่ `apps/api/jest.config.js`, เทสต์ใน `src/__tests__/`; `turbo.json` ไม่ผูก `test` กับ `build` เพื่อให้รันคู่กับ `npm run dev` ได้
- **ไทย:** `npm run test:e2e --workspace=@kanban/api` ยิง API + DB จริง (4 ชุด) — สร้าง/ลบข้อมูลทดสอบเอง และจะพักกฎที่มีอยู่ใน DB ก่อนแล้วคืนสภาพตอนจบ
- **ไทย:** `migration:run` **ใช้ได้** — ชี้ `src/data-source.ts` (ไม่ใช่ `dist/data-source.js`) และ track เฉพาะ 4 TS migration ใน `apps/api/src/migrations/`; SQL ใน `apps/api/migrations/*.sql` รันมือไม่ถูก track; มี TS migration 3 ไฟล์ใน `apps/api/migrations/` ที่ไม่ได้ต่อเข้า data-source (1794 apply แล้ว, 1793 ยังไม่ — `issues.assigned_at` ยังอยู่); `migration:generate` ต้องระบุชื่อ/พาธ

## Structure / โครงสร้าง

- `apps/web` — Next.js frontend. Path alias `@/*` → `src/*`. Imports `@kanban/shared` as raw TS. Uses `next-intl` for i18n (locales: `th` default, `en`).
- `apps/api` — NestJS. Implemented (controller + service): `auth`, `permissions`, `users`, `roles`, `positions`, `issues`, `issue-statuses`, `issue-priorities`, `categories`, `activity-logs`, `work-sessions`, `comments`, `attachments`, `labels`, `rules`, `notifications`. **No stubs left**, and **no `columns` module** (board columns are statuses — see Domain rules). `rules` = CRUD + `RulesEngineService` + `rule_runs` history; `notifications` = inbox/list/mark-read/archive. **There is NO `boards` module/table** — the app is single-board.
- `apps/web` also has `apps/web/src/app/[locale]/automation/**` (rule wizard + list + run history), `/notifications` (inbox) and a navbar bell polling `GET /notifications`.
- `packages/shared` — types/DTOs/permissions/rules registry consumed as raw TS (`main` → `src/index.ts`); **no build step**. Resolved via workspace symlink and root tsconfig path `@kanban/shared` → `packages/shared/src`.
- **ไทย:** `apps/web` ใช้ alias `@/*` → `src/*` และ import `@kanban/shared` เป็น TS ตรง ๆ; ใช้ `next-intl` (locale เริ่มต้น `th`)
- **ไทย:** `apps/api` implement ครบทุกโมดูลแล้ว (ไม่มี stub): `auth`, `permissions`, `users`, `roles`, `positions`, `issues`, `issue-statuses`, `issue-priorities`, `categories`, `activity-logs`, `work-sessions`, `comments`, `attachments`, `labels`, `rules`, `notifications` — **ไม่มีโมดูล `columns`** (คอลัมน์บอร์ด = สถานะ ดูกฎระบบ) และ **ไม่มีโมดูล/ตาราง `boards`** — แอปเป็นแบบบอร์ดเดียว. `rules` = CRUD + engine + ประวัติ `rule_runs`; `notifications` = รายการ/อ่านแล้ว/เก็บถาวร
- **ไทย:** ฝั่งเว็บมี `/automation/**` (wizard + รายการ + ประวัติการรัน), `/notifications` และกระดิ่งใน navbar ที่ poll `GET /notifications`
- **ไทย:** `packages/shared` ถูกใช้เป็น TS ดิบ ไม่มี build step (รวม registry ของกฎ)

## Domain rules — single board / ข้อจำกัดระบบ — บอร์ดเดียว

- **One board only.** Do NOT add a `boards` table/entity/controller/service, a board list, a board selector, or board CRUD. The app is single-board.
- The sidebar "บอร์ด"/"Board" item links straight to `/boards` — that page **is** the board (no intermediate board list). The board loads with `fetchStatuses()` / `fetchIssues()` → `GET /issue-statuses` and `GET /issues`. **There is no `/columns` endpoint and no `columns` module.**
- **"Add column" = "add status".** `AddColumnInline` (`[locale]/boards/page.tsx`) collects a name + description and calls `createStatus()` → `POST /issue-statuses`; the board's columns *are* the statuses. A card's column is its `status_id`.
- The `board_columns` table still exists in the DB but **nothing writes to it** — legacy of migration `0025-merge-board-columns-into-issue-statuses.sql`. Do not build features on it.
- **Drift / legacy — do not reintroduce `board_id`:** migration `1791200000000-RemoveBoardsAndAddTimeTracking.ts` dropped `board_id`. The `Issue` entity no longer maps it (nor `column_id`), although the DB still carries a dead `issues.column_id` column. The old issue **list** page is gone — only `/issues/new` remains, and the list comes from `GET /issues`. Never point frontend code at `/issues/boards/...` (not in `IssuesController`).
- **ไทย:** มีบอร์ดเดียว — ห้ามเพิ่มตาราง `boards`, entity/controller/service ของบอร์ด, หน้ารวมบอร์ด, ตัวเลือกบอร์ด หรือ CRUD บอร์ด
- **ไทย:** ปุ่ม "บอร์ด" เข้า `/boards` ตรง ๆ หน้านั้นคือตัวบอร์ด; บอร์ดโหลดด้วย `fetchStatuses()` / `fetchIssues()` → `GET /issue-statuses` และ `GET /issues` — **ไม่มี endpoint `/columns` และไม่มีโมดูล `columns`**
- **ไทย:** "เพิ่มคอลัมน์" = "เพิ่มสถานะ" — `AddColumnInline` รับชื่อ + คำอธิบายแล้วเรียก `createStatus()` → `POST /issue-statuses`; คอลัมน์ของบอร์ดคือสถานะ ส่วนคอลัมน์ของการ์ดคือ `status_id`
- **ไทย:** ตาราง `board_columns` ยังอยู่ใน DB แต่**ไม่มีอะไรเขียนลงไปแล้ว** — เป็นของเก่าจาก migration `0025`; อย่านำไปสร้างฟีเจอร์ใหม่
- **ไทย:** อย่านำ `board_id` กลับมา — migration `1791200000000` ลบไปแล้ว entity `Issue` ไม่ map `board_id`/`column_id` อีก (แต่ DB ยังมีคอลัมน์ `issues.column_id` ที่ไม่ถูกใช้อยู่); หน้า list การ์ดถูกลบแล้วเหลือแค่ `/issues/new` และรายการมาจาก `GET /issues` — ห้ามชี้ไป `/issues/boards/...` ที่ไม่มีใน `IssuesController`

## Backend facts / ข้อเท็จจริงฝั่ง backend

- `main.ts`: global `ValidationPipe({ whitelist: true, transform: true })`, wide-open CORS, listens on `PORT` ?? 3002.
- `JwtAuthGuard` is registered **globally** via `APP_GUARD`; opt out per route with `@Public()`. Secret `JWT_SECRET` (default `"secret"`), expiry **7d**. No refresh-token flow.
- There is **no auto-seed on boot**. Accounts come from `apps/api/src/seed.ts` (`npm run seed`), which would create `admin@example.com` / `admin123` — that account does **not** exist in the local DB. The local DB has 4 users: `aom@gmail.com` (admin, id 1), `arthitaya@gmail.com` (id 2), `programmer@gmail.com` (id 13), `b@gmail.com`, all with password `123456`.
- `User.id` is an **integer** auto-increment PK (not UUID); password column is named `password` but maps to `passwordHash`. `RolePermission.id` **is** a uuid — PK types are mixed. `packages/shared` types say `id: string`; the API returns `String(user.id)`.
- DB env vars are `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` (`apps/api/.env`); code defaults `localhost` / `5432` / `postgres` / `1234` / `trackdb`. `synchronize: false` always — schema changes need a migration (see Commands for which runner does what).
- **Automation permissions**: `automation.view` / `automation.update` (migration `0031-add-automation-permissions.sql`, granted to admin). `RulesController` is guarded by them; the 4 `/automation` pages gate on `automation.update`.
- **Notifications API**: `GET /notifications` (returns `{ data, unreadCount }`), `PATCH /notifications/:id/read`, `POST /notifications/read-all` (returns **201**), `PATCH /notifications/:id/archive` — each scoped to their owner. Rows are skipped for the actor and deduped across recipients; `notify()` never throws, so a notification failure cannot break the request that triggered it.
- **Roles are `"admin" | "programmer" | "customer"`** (3 roles, stored in the `roles` table — not an enum). Renamed from `"user"` → `"customer"` (done); see `design.md` §8.
- **`permissions` table** (queried via raw SQL, not a TypeORM entity): columns `id`, `code`, `action`, `category`. `role_permissions` table: TypeORM entity with uuid `id`, `role`, `permission`.
- **`Position` entity**: `id` (int), `name` (unique), nullable `role_id` → `Role`, and a `position_permissions` relation. `User` has a nullable `position` column. Effective perms = role perms ∪ position perms; `PermissionsService.hasPermission(roleId, permission, positionId?)` checks both, and JWT carries `positionId`.
- **ไทย:** `JwtAuthGuard` เป็น global guard ผ่าน `APP_GUARD`; ยกเว้นด้วย `@Public()`. JWT หมดอายุ 7 วัน ไม่มี refresh flow
- **ไทย:** **ไม่มี auto-seed** — บัญชีมาจาก `apps/api/src/seed.ts` (`npm run seed`) ซึ่งจะสร้าง `admin@example.com` แต่บัญชีนี้**ไม่มีอยู่จริง**ใน DB จริง; บัญชีจริงคือ `aom@gmail.com` (admin, id 1), `arthitaya@gmail.com` (id 2), `programmer@gmail.com` (id 13), `b@gmail.com` รหัส `123456` ทุกบัญชี
- **ไทย:** `User.id` เป็น integer คอลัมน์ `password` map ไป `passwordHash`; `RolePermission.id` เป็น uuid (PK ปนกัน). `synchronize: false` เสมอ — เปลี่ยน schema ต้องผ่าน migration (ดูกฎคำสั่งด้านบนว่าตัวไหน track อะไร)
- **ไทย:** สิทธิ์ระบบอัตโนมัติคือ `automation.view` / `automation.update` (migration 0031) — `RulesController` และหน้า `/automation` ทั้ง 4 อ้างอิงตัวนี้
- **ไทย:** API แจ้งเตือน: `GET /notifications` (คืน `{ data, unreadCount }`), `PATCH :id/read`, `POST read-all` (คืน **201**), `PATCH :id/archive` — จำกัดเฉพาะเจ้าของ; ข้ามคนกระทำและไม่ส่งซ้ำ; `notify()` ไม่เคย throw จึงไม่ทำให้ request พัง
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
- **Routes** (all under `[locale]/`): `/` (dashboard), `/login`, `/boards`, `/issues/new` (report issue), `/automation` (rules), `/automation/new` (wizard), `/automation/[id]` (edit), `/automation/runs` (history), `/notifications` (inbox), `/reports`, `/users`, `/roles`, `/settings`, `/labels`, `/comments`. There is **no issue list page** anymore. `/labels` is still a placeholder ("coming soon") even though the `labels` API is complete — the one unfinished page.
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
- Conventional Commits. Run `npm run lint`, `npm run typecheck` and `npm test` before committing.
- **ไทย:** ใช้ **npm เท่านั้น** (ห้าม pnpm/yarn) แม้ `AGENT.md` จะบอกเป็นอย่างอื่น
- **ไทย:** TypeScript strict เลี่ยง `any`; Server Component เป็นค่าเริ่มต้น ใช้ `"use client"` เฉพาะที่ต้อง interactivity
- **ไทย:** ห้าม hardcode สี hex/rgba ให้ดึงจากธีมเสมอ; การตรวจสิทธิ์ต้องอิง permission
- **ไทย:** ใช้ Conventional Commits และรัน `npm run lint` + `npm run typecheck` + `npm test` ก่อน commit

## Ports / พอร์ต

- Frontend: 3000 (3001 if taken). Backend: 3002.
- **ไทย:** ฝั่งหน้าเว็บ 3000 (ถ้าถูกใช้จะ 3001) ฝั่ง backend 3002

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
