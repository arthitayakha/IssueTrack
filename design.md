# Kanban Issue Tracker — เอกสารออกแบบ (Design Document)

> **เวอร์ชันล่าสุด** — อัปเดต 2026-10-06
> เอกสารนี้เป็น **ตัวล่าสุด** ให้อ่านที่ไฟล์นี้ก่อนเสมอ ห้ามอ่าน `AGENT.md` (ล้าสมัย)
> หากจะเพิ่ม/แก้อะไร ให้แก้ไฟล์นี้ด้วย แล้วอัปเดตวันที่ด้านบน
> **สถานะปัจจุบัน:** เอกสารนี้เป็นแผน ยังไม่แก้โค้ด/ฐานข้อมูล (ยกเว้นที่ระบุว่าเสร็จแล้ว)

---

## 1. ภาพรวม

ระบบติดตามงานแบบ Kanban สำหรับทีมพัฒนา ผู้ใช้ 3 บทบาท จัดการงานเป็นการ์ด ตั้งแต่สร้าง มอบหมาย ลากเปลี่ยนสถานะ จับเวลา จนถึงรายงาน

- **Frontend:** Next.js (App Router) + MUI + next-intl (locale เริ่มต้น `th`)
- **Backend:** NestJS + TypeORM + PostgreSQL
- **Monorepo:** npm workspaces + Turborepo (ใช้ **npm เท่านั้น** ห้าม pnpm/yarn)

---

## 2. บทบาท (Roles) — ฟิก 3 บทบาท

ระบบมี **3 บทบาทคงที่** เก็บในตาราง `roles` (ไม่ใช่ enum ในโค้ด):

| ชื่อในโค้ด | ชื่อที่แสดง | คำอธิบาย |
|---|---|---|
| `admin` | แอดมิน | สิทธิ์ทุกอย่าง (`hasPermission` คืน `true` เสมอ) |
| `programmer` | โปรแกรมเมอร์ | ทำงาน สร้าง/แก้ issue จับเวลา จัดการบอร์ด |
| `customer` | ลูกค้า | สร้าง/ดู issue ของตัวเอง คอมเมนต์ ดูรายงาน **ไม่ได้** |

> **การเปลี่ยนชื่อ:** โค้ดเดิมใช้ `user` แต่แสดงเป็น "ลูกค้า" → **เปลี่ยนเป็น `customer` ทั้งระบบ**
> ไฟล์ที่ต้องแก้: `packages/shared/src/permissions.ts`, `apps/api/src/modules/roles/roles.service.ts`, `apps/web/src/lib/permissions.ts`, seed

---

## 3. ตำแหน่ง (Positions) — เชื่อม Role + แก้ Permission ได้

ปัจจุบัน `positions` เป็นแค่ตารางชื่อ (id, name, is_active) ไม่ผูก role และไม่มีสิทธิ์ → **เพิ่ม 2 อย่าง:**

### 3.1 ตำแหน่งเชื่อมกับ Role
เพิ่มคอลัมน์ `positions.role_id` → FK ไป `roles.id`
- ตำแหน่งอ้าง role ฐานได้ (เช่น ตำแหน่ง "หัวหน้าทีม" ผูก role `programmer`)
- ตอนสร้างผู้ใช้ เลือก role + position โดย position กรองตาม role ที่เลือก

### 3.2 ตำแหน่งแก้ Permission ได้
เพิ่มตาราง `position_permissions` (position_id, permission) ให้ตำแหน่งเพิ่มสิทธิ์จาก role ได้
- **สิทธิ์จริง = สิทธิ์จาก `role_permissions` ∪ สิทธิ์จาก `position_permissions`**
- `PermissionsService.hasPermission` ต้องตรวจทั้ง role และ position
- ต้องรู้ `position_id` ของผู้ใช้ → ส่ง `positionId` ใน JWT (ปัจจุบันมีแค่ `roleId`)

### 3.3 ชุดสิทธิ์ดีฟอลต์ (Default Set) ของตำแหน่งใหม่
**ต้องมี default set** — เอาสิทธิ์ของ `customer` เป็นฐาน แล้วเพิ่มตามตำแหน่ง
- เก็บเป็น `POSITION_TEMPLATES` ใน `packages/shared` (คล้าย `ROLE_TEMPLATES`)
- ตอนสร้างตำแหน่งใหม่ เลือก template แล้วปรับเพิ่ม/ลดในหน้า permission matrix ได้

---

## 4. สิทธิ์ (Permissions)

- กลไก permission-driven มีอยู่แล้ว: `@Permissions(...)` + `RolesGuard` (ต้องใส่ `@UseGuards(RolesGuard)` ด้วย ไม่งั้น decorator ไม่มีผล)
- สิทธิ์อยู่ใน `packages/shared/src/permissions.ts` (`Permission`, `ALL_PERMISSIONS`, `ROLE_PERMISSIONS`, `ROLE_TEMPLATES`)
- runtime ตรวจจาก DB ผ่าน `PermissionsService` (`role_permissions`) **ไม่ใช่** `ROLE_PERMISSIONS` (ตัวหลังเป็น seed + frontend mirror)
- `admin` ถูก short-circuit ให้ผ่านเสมอ

### 4.1 ค่า default ของแต่ละ role

**programmer** — สิทธิ์เกือบทั้งหมด (issue/board/status/priority/category/skill/report + `position.view`) แต่ไม่มี `user.*` / `role.*` / `permission.*`

**customer** — **แก้ใหม่:** ตัด `report.view` + `report.export` ออก
```
auth.login, auth.logout, dashboard.own.view,
issue.create, issue.own.view, issue.assigned.view, issue.detail.view, issue.own.update,
comment.view, comment.create, comment.own.update, comment.own.delete,
category.view, board.view
```
> หมายเหตุ: `board.create/update/delete` + `board.column.*` ของลูกค้า — รอสรุปว่าจะตัดออกด้วยไหม (ค่าเริ่มต้นแผนนี้ **คงไว้ก่อน**)

### 4.2 ดีฟอลต์ + รีเซ็ต (กันติ๊กผิด)
- **seed** ใส่ค่า default ลง DB (idempotent รันซ้ำได้)
- **ปุ่ม "รีเซ็ตกลับค่าเริ่มต้น"** ในหน้า permissions → เรียก `POST /permissions/reset` เพื่อตั้ง `role_permissions` กลับเป็นค่า default

---

## 5. ฐานข้อมูล (Schema)

### ตารางหลัก

| ตาราง | คอลัมน์สำคัญ | หมายเหตุ |
|---|---|---|
| `users` | id (int PK), email, password→passwordHash, name, role_id, position_id, is_active, created_at, updated_at | role_id/position_id nullable |
| `roles` | id (int PK), name (unique), is_active | 3 บทบาท |
| `role_permissions` | id (**uuid** PK), role_id, permission | unique(role_id, permission) |
| `positions` | id (int PK), name (unique), is_active, **role_id (ใหม่)** | |
| `position_permissions` | id, position_id, permission | **ตารางใหม่** |
| `permissions` | id, code, action, category | query ด้วย SQL ตรง ไม่ใช่ entity; ต้องมี unique(code) |
| `issues` | id, programmer_id, customer_id, category_id, status_id, priority_id, column_id, title, description, tracked_duration, actual_fix_duration, doing_started_at, assigned_at, completed_at | เวลาอยู่ที่นี่ |
| `issue_statuses` | id, name, description, is_active, **sort_order, is_timer_running, is_end_status** | DB จริงมี 3 คอลัมน์หลังแล้ว แต่ entity ยังไม่มี |
| `issue_priorities` | id, name, description, sort_order, is_active | |
| `categories` | id, name, is_visible, position | |
| `boards` | id, name, description | ⚠️ ดู DB drift |
| `board_columns` | id, board_id, status, custom_name, is_hidden, position | |
| `work_sessions` | id, issue_id, programmer_id, started_at, ended_at, duration | module ยังเป็น stub |
| `comments` | id, issue_id, user_id, comment | module stub |
| `attachments` | id, issue_id, uploaded_by, file_name, file_path, file_type, file_size | module stub |
| `notifications` | id, user_id, issue_id, title, message, type, is_read | module stub |
| `activity_logs` | id, actor_id, actor_name, actor_role, action, board_id, entity_id, detail | |

### ความสัมพันธ์
- `users` N:1 `roles`, `users` N:1 `positions`
- `roles` 1:N `role_permissions`; `positions` N:1 `roles`, `positions` 1:N `position_permissions`
- `issues` N:1 `issue_statuses`, `issue_priorities`, `categories`, `board_columns`, `users` (programmer/customer)
- `issues` 1:N `work_sessions`, `comments`, `attachments`
- `boards` 1:N `board_columns` 1:N `issues`

### 5.1 ความเสี่ยง (Risks)
1. **ตาราง `permissions` ไม่ใช่ entity** — query SQL ตรง ไม่มี type safety เสี่ยง schema drift
2. **PK ปนกัน** — `role_permissions.id` เป็น uuid ที่อื่นเป็น int
3. **DB กับโค้ดไม่ตรงกัน (สำคัญ):** DB จริงมี `sort_order`/`is_timer_running`/`is_end_status` แต่ entity `IssueStatus` ไม่มี และ migration `1791200000000` สั่ง **DROP** 3 คอลัมน์นี้ → ต้องแก้ entity + อย่ารัน migration นั้น
4. **DB drift (boards):** migration `1791200000000` ลบตาราง `boards` + คอลัมน์ `board_id` แต่โค้ด/entity ยังใช้บอร์ด → **ต้องเลือก: เก็บบอร์ด (แก้ migration) หรือเอาออก**
5. **`work_sessions` module เป็น stub** — มีตารางแต่ไม่มี controller/service
6. **Module stubs:** `labels`, `comments`, `notifications`, `attachments` (มี entity ไม่มี controller/service)
7. **Permission cache ใน memory** — `PermissionsService` cache ไว้ ถ้าแก้ผ่านช่องทางอื่น cache จะเก่า (ต้อง refresh)
8. **`tracked_duration` vs `work_sessions.duration`** — ซ้ำซ้อน; ใช้ `work_sessions` เป็นต้นฉบับ แล้ว rollup เป็น cache
9. **Seed ผู้ใช้** — `AuthService.onModuleInit` seed `admin@example.com`/`admin123` และรีเซ็ตรหัสบัญชี gmail บางรายการ

---

## 6. การจัดเวลา (Time Tracking)

**สรุปมติ:**
- จับเวลาด้วย **สถานะ** (ลากการ์ดตามคอลัมน์) ไม่มีปุ่ม start/stop
- จับ **ต่อการ์ด** และทำ **หลายการ์ดพร้อมกันได้** (ขนานกัน ไม่ตัดกัน)
- เก็บเวลาเป็น **วินาที** แล้วแปลงเป็น ชม./นาที ตอนแสดงผล
- `actual_fix_duration` (เวลาจริง) **กรอกมือตอนปิดงาน** (เพราะเวลาจับรวมเวลาหาข้อมูลด้วย)

### 6.1 ค่าเวลา 2 ตัว

| ค่า | ได้มาจาก | ใช้ทำอะไร |
|---|---|---|
| `tracked_duration` | จับอัตโนมัติตามสถานะ (ผลรวม `work_sessions`) | เวลาที่ระบบจับได้ (รวมเวลาหาข้อมูล) |
| `actual_fix_duration` | **กรอกมือตอนปิดงาน** | "เวลาจริง" ให้ลูกค้าดู |

### 6.2 กลไกจับเวลา (ตามสถานะ)

- เข้า status ที่ `is_timer_running = true` → ตั้ง `issues.doing_started_at = now()`
- ออกจาก status นั้น (หรือเข้า status ที่ `is_end_status = true`) →
  1. บันทึก `work_sessions` 1 แถว: `started_at = doing_started_at`, `ended_at = now()`, `duration = (ended_at - started_at)` วินาที
  2. บวก `duration` เข้า `issues.tracked_duration`
  3. ถ้าเป็น `is_end_status` → ตั้ง `issues.completed_at = now()` + ให้กรอก `actual_fix_duration`
- นาฬิกาวิ่ง = `now() - doing_started_at` (ต่อการ์ด แสดงพร้อมกันหลายใบได้)
- **ไม่ต้องมี session เปิดค้าง** → `work_sessions.ended_at` คงเป็น NOT NULL ได้ (บันทึกตอนออก)
- การ์ดที่ยังไม่มอบหมาย programmer จะไม่รู้เจ้าของเวลา → ต้องมอบหมายก่อน (หรือใช้คนที่ลาก)

### 6.3 ตัวอย่าง
```
ลากการ์ด X → "กำลังทำ"  (X.doing_started_at = 10:00)
ลากการ์ด Y → "กำลังทำ"  (Y.doing_started_at = 10:15)   ← X, Y จับพร้อมกัน
ลาก X → "เสร็จ"  → ปิด X: duration = now-10:00, tracked_duration += duration, กรอกเวลาจริง
ลาก Y → "เสร็จ"  → ปิด Y
```

---

## 7. แผนการแก้ไข (Roadmap) — ลำดับการทำงาน

> ทำตามลำดับนี้ เพราะขั้นหลัง ๆ อ้างอิงขั้นก่อนหน้า

### ขั้น 0 — SQL / ฐานข้อมูล (คุณลองแก้เองก่อน) → ดูข้อ 8
เหตุผล: โค้ด backend ต้องมี schema ก่อน (unique, FK, ตารางใหม่)
> ยังไม่ต้องทำถ้ายังไม่ตัดสินเรื่องบอร์ด (ข้อ 5.1 ข้อ 4)

### ขั้น 1 — shared types (ไม่มี dependency DB)
- `packages/shared/src/permissions.ts`
  - rename `user` → `customer` (`RoleName`, `ROLE_PERMISSIONS`, `ROLE_LABELS`, `ROLE_TEMPLATES`)
  - ตัด `report.view` + `report.export` ออกจาก customer
  - เพิ่ม `POSITION_TEMPLATES` (default = customer + เพิ่ม)
เหตุผล: เป็นแหล่งความจริงที่ backend/frontend อ้างอิง

### ขั้น 2 — backend entities
- `positions/position.entity.ts` — เพิ่ม `roleId` (+ relation)
- `positions/entities/position-permission.entity.ts` — ใหม่
- `issue-statuses/entities/issue-status.entity.ts` — เพิ่ม `sortOrder`, `isTimerRunning`, `isEndStatus`
- `auth/entities/user.entity.ts` — (ถ้าจำเป็น) relation position
เหตุผล: ให้ entity ตรงกับ DB ที่แก้ในขั้น 0

### ขั้น 3 — backend permissions / roles
- `permissions/permissions.service.ts` — เพิ่ม `resetToDefaults()`, ตรวจ position perms ใน `hasPermission`
- `permissions/permissions.controller.ts` — `POST /permissions/reset`
- `roles/roles.service.ts` — default template → `customer`
- `auth/roles.guard.ts` — ส่ง/ตรวจ `positionId` รวมกับ role
- `auth/auth.service.ts` — ใส่ `positionId` ใน JWT payload

### ขั้น 4 — backend positions
- `positions/positions.service.ts` + `positions.controller.ts` — เชื่อม role, CRUD `position_permissions`, default set ตอนสร้าง

### ขั้น 5 — seed
- `apps/api/src/seed.ts` (ใหม่) — upsert `permissions` (code/action/category), `roles`, `role_permissions`
- `apps/api/package.json` + root `package.json` — เพิ่มสคริปต์ `seed`
เหตุผล: ต้องมี entity/table ครบก่อน upsert

### ขั้น 6 — time tracking
- `work-sessions/` — เขียน `work-sessions.service.ts` + `work-sessions.controller.ts` + แก้ module
- `issues/issues.service.ts` — logic เปิด/ปิด session ตามสถานะ, rollup `tracked_duration`, endpoint กรอก `actual_fix_duration`, ส่งค่าเวลาใน `toResponse`
- `issues/issues.controller.ts` — endpoint เวลา
- `issue-statuses/issue-statuses.service.ts` + controller — รับ/ส่ง flags

### ขั้น 7 — frontend
- `lib/permissions.ts` — default role `user` → `customer`
- `[locale]/users/page.tsx` — เลือก role ให้ position, ปุ่มรีเซ็ต default, แสดงค่า default
- `[locale]/issues/page.tsx` — timer + ช่องกรอกเวลาจริง (ตอนนี้ coming-soon)
- `messages/{th,en}.json` — ป้ายข้อความใหม่

### ขั้น 8 — เอกสาร + ตรวจ
- `AGENTS.md` — แก้ข้อมูลที่ผิด (`data-source.ts` มีแล้ว, สคริปต์ migration ชี้ `src/`)
- รัน `npm run lint` + `npm run typecheck` + `npm run build`

---

## 10. สถานะการทำงาน (อัปเดต 2026-10-06)

### ✅ เสร็จแล้ว
- **ขั้น 0 (SQL):** คุณรันเองแล้ว — `positions.role_id`, `position_permissions`, `issue_statuses` flags, drop `estimate_duration`
- **ขั้น 1 (shared types):** rename `user`→`customer`, ตัด `report.*`, เพิ่ม `POSITION_TEMPLATES`
- **ขั้น 2 (entities):** `Position.roleId`, `PositionPermission`, `IssueStatus` flags
- **ขั้น 3 (permissions/roles):** `resetToDefaults()`, position perms ใน `hasPermission`, `positionId` ใน JWT
- **ขั้น 4 (positions):** role linking, CRUD `position_permissions`, default set ตอนสร้าง
- **ขั้น 5 (seed):** `src/seed.ts` + สคริปต์ `seed`
- **ขั้น 6 (time tracking):** `work-sessions` service/controller, `issues.move` เปิด/ปิด session, rollup `tracked_duration`, endpoint กรอก `actual_fix_duration`
- **ขั้น 7 (frontend):** position role selector, ปุ่มรีเซ็ต, timer UI ใน issues page
- **ขั้น 8 (verify):** `npm run lint` ✅ + `npm run typecheck` ✅ + `npm run build` ✅

### ⚠️ ที่ต้องทำเพิ่ม (ถ้าต้องการ)
- รัน `npm run seed` เพื่อ seed ข้อมูลเริ่มต้น
- ทดสอบ API ด้วย `npm run dev --workspace=@kanban/api`
- ทดสอบ frontend ด้วย `npm run dev --workspace=@kanban/web`
- หน้า `/roles` ต้องมี `export const dynamic = "force-dynamic"` (แก้แล้ว)

---

## 8. SQL ที่ต้องแก้ (ให้คุณลองแก้เอง)

```sql
-- 1) permissions: ต้องมี UNIQUE(code) เพื่อให้ seed upsert ได้
ALTER TABLE permissions ADD CONSTRAINT permissions_code_key UNIQUE (code);

-- 2) positions: เชื่อม role
ALTER TABLE positions ADD COLUMN role_id INTEGER REFERENCES roles(id);
UPDATE positions SET role_id = (SELECT id FROM roles WHERE name = 'customer')
WHERE role_id IS NULL;

-- 3) ตาราง position_permissions (ตำแหน่งแก้สิทธิ์เพิ่มได้)
CREATE TABLE position_permissions (
  id SERIAL PRIMARY KEY,
  position_id INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  permission VARCHAR(100) NOT NULL,
  UNIQUE (position_id, permission)
);

-- 4) issue_statuses: flag จับเวลา (DB ปัจจุบันมีอยู่แล้วบางส่วน)
ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS is_timer_running BOOLEAN DEFAULT FALSE;
ALTER TABLE issue_statuses ADD COLUMN IF NOT EXISTS is_end_status BOOLEAN DEFAULT FALSE;

-- 5) issues: ตัด estimate_duration ออก (ค่าเวลามีแค่ 2 ตัว: tracked + actual)
ALTER TABLE issues DROP COLUMN IF EXISTS estimate_duration;
```

**หมายเหตุ:** migration `1791200000000` มีคำสั่ง `ADD COLUMN estimate_duration` ใน `up()` → ต้องลบบรรทัดนั้นออกด้วย (หรือไม่ต้องทำถ้าไม่รัน migration นี้)

**เรื่องบอร์ด (drift) — ต้องตัดสินก่อน:**
- **ทาง A: เก็บบอร์ด** → ไม่รัน migration `1791200000000` และแก้ไฟล์ migration ให้ไม่ drop `boards`/`board_id`
- **ทาง B: เอาบอร์ดออก** → รัน migration ตามเดิม และลบโค้ด/entity ที่เกี่ยวกับบอร์ด

---

## 9. การเพิ่ม/แก้ไขอย่างปลอดภัย

- **เพิ่ม permission:** แก้ `ALL_PERMISSIONS` + `PERMISSION_LABELS` (shared) + INSERT ในตาราง `permissions` (DB) + seed ใน `ROLE_PERMISSIONS`
- **เพิ่ม role:** INSERT ใน `roles` + กำหนด permission ใน `role_permissions` (หรือใช้ template)
- **เพิ่ม position:** INSERT ใน `positions` + เชื่อม `role_id` + กำหนด permission (เริ่มจาก default set = customer + เพิ่ม)
- **เพิ่มสถานะ:** INSERT ใน `issue_statuses` + ตั้ง `is_timer_running`/`is_end_status`/`sort_order` ตามต้องการ
- **ก่อน commit:** รัน `npm run lint` + `npm run typecheck`
