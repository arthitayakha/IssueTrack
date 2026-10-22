# Triggers & Actions — ระบบกฎอัตโนมัติ (Rule Engine)

> **สถานะ:** แผนฉบับสมบูรณิ (v4) — รอเริ่มลงมือ
> **อัปเดตล่าสุด:** 2026-10-22
> **รูปแบบ UI:** อ้างอิง Trello Automation (เลือกเงื่อนไขแบบประโยค)
> **ที่อยู่ของ UI:** ปุ่ม "⚡ กฎอัตโนมัติ" ข้างๆ "+ เพิ่มสถานะ" ในหน้า `/settings` → แท็บ "สถานะ"
> **Route ของหน้ากฎ:** `/settings/rules` · `/settings/rules/new` · `/settings/rules/[id]/edit` · `/settings/rules/runs`
> (หน้าเต็มแบบ Trello — ไม่มีแท็บ "กฎ" แยก, ไม่มี sidebar, ไม่เพิ่มรายการในเมนูซ้าย)

---

## สารบัญ

1. [ภาพรวม](#1-ภาพรวม)
2. [สถานะปัจจุบันในโค้ด (ตรวจสอบกับ DB จริงแล้ว)](#2-สถานะปัจจุบันในโค้ด-ตรวจสอบกับ-db-จริงแล้ว)
3. [แนวคิด: 2 ระบบล็อกที่ต้องแยกให้ชัด](#3-แนวคิด-2-ระบบล็อกที่ต้องแยกให้ชัด)
4. [โมเดลกฎ: Trigger → Condition → Action](#4-โมเดลกฎ-trigger--condition--action)
5. [โครงสร้างข้อมูล (3 ตาราง + 2 คอลัมน์)](#5-โครงสร้างข้อมูล-3-ตาราง--2-คอลัมน์)
6. [Registry: `packages/shared/src/rules.ts`](#6-registry-packagessharedsrcrules.ts)
7. [การทำงานของกฎ](#7-การทำงานของกฎ)
8. [API](#8-api)
9. [UI](#9-ui)
10. [สิทธิ์ (Permissions)](#10-สิทธิ์-permissions)
11. [Migration Runner](#11-migration-runner)
12. [แผนงาน 4 เฟส + 10 commits](#12-แผนงาน-4-เฟส--10-commits)
13. [ความเสี่ยง](#13-ความเสี่ยง)
14. [ขอบเขตที่ไม่ทำ](#14-ขอบเขตที่ไม่ทำ)
15. [การตัดสินใจที่ตกลงแล้ว](#15-การตัดสินใจที่ตกลงแล้ว)
16. [หมายเหตุเรื่อง working tree](#16-หมายเหตุเรื่อง-working-tree)

---

## 1. ภาพรวม

เป้าหมายคือให้แอดมินสร้าง **กฎ "เมื่อ X แล้ว Y"** ด้วยตัวเอง เพื่ออัตโนมัติ:

- 🔒 **ล็อก / ปลดล็อกการ์ด**
- 🚫 **ห้ามทำรายการ** (ตรวจก่อนทำ → ตอบ 403 พร้อมเหตุผล)
- 🔔 **แจ้งเตือน** (กล่องจดหมายใน navbar)

หลักการสำคัญ: **ครอบคลุมเกือบทุกอย่าง** — เพิ่มกฎหรือ action ใหม่ในอนาคตได้โดยไม่ต้องแก้ schema

```
┌──────────────────────────────────────────────────────────────────┐
│  UI (Trello-like, หน้าเต็ม)                                    │
│  /settings/rules            รายการกฎ (แถบ filter)               │
│  /settings/rules/new        wizard 3 ขั้นตอน (สร้างใหม่)         │
│  /settings/rules/[id]/edit  wizard 3 ขั้นตอน (แก้ไข)              │
│  /settings/rules/runs       ประวัติการทำงาน                      │
│  ─────────────────────────────────────────────────────────────   │
│  /settings → แท็บ "สถานะ"                                      │
│  [⚡ กฎอัตโนมัติ]  →  /settings/rules                          │
│  [✏️ แก้ไขสถานะ]  →  Dialog แก้ไข (มีสวิตช์ล็อกคอลัมน์)          │
└──────────────────────────┬───────────────────────────────────────┘
                           │ REST
┌──────────────────────────▼───────────────────────────────────────┐
│  RulesController   /rules · /rules/simulate · /rules/runs        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ RulesService (cache: Map<triggerKey, Rule[]>)              │  │
│  │   ↓ pre-check (block)  ↓ post-execute (lock/unlock/notify) │  │
│  │ RulesExecutor → RuleRun (บันทึกทุกครั้งที่ยิง)           │  │
│  └────────────┬─────────────────────────────┬─────────────────┘  │
└───────────────┼─────────────────────────────┼────────────────────┘
                │                             │
      ┌─────────▼────────┐          ┌─────────▼─────────┐
      │  IssuesService    │          │ NotificationsService│
      │  move / create /  │          │ create / list /    │
      │  update / assign / │          │ markRead / unread  │
      │  remove / restore │          └─────────┬─────────┘
      └─────────┬────────┘                    │
                │                             ▼
      ┌─────────▼─────────────────────────  🔔 กระดิ่งใน navbar
      │  issues / issue_statuses / comments   (dropdown + badge
      │  attachments / work_sessions          จำนวนที่ยังไม่อ่าน)
      │  activity_logs / notifications
      └──────────────────────────────────────
```

---

## 2. สถานะปัจจุบันในโค้ด (ตรวจสอบกับ DB จริงแล้ว)

> ตรวจทั้งโค้ดใน `apps/api`, `apps/web` และ query ฐานข้อมูล `trackdb` จริง เมื่อ 2026-10-22

### 2.1 สิ่งที่ "มีอยู่แต่ใช้ไม่ได้"

| # | ปัญหา | หลักฐาน / จุดที่พบ |
|---|-------|--------------------|
| 1 | **ไม่มี API ล็อก/ปลดล็อก** | `apps/api/src/modules/issues/issues.controller.ts` ไม่มี route `lock`/`unlock` แต่ `apps/web/src/lib/board-api.ts` เรียกอยู่ → **404** |
| 2 | **`toResponse()` ไม่คืน `isLocked`** | `issues.service.ts:500` — ไม่มี field `isLocked` ใน response → ฝั่ง FE เห็น `undefined` เสมอ → UI ล็อกไม่เคยทำงาน |
| 3 | **`move()` ไม่เช็คสถานะล็อก** | `issues.service.ts:280` — ลากการ์ดที่ถูกล็อกได้ตามปกติ |
| 4 | **`Issue` entity มีแค่ `isLocked`** | `issues/entities/issue.entity.ts:101` — ไม่มี `lockedAt` / `lockedBy` / `lockReason` / `lockSource` |
| 5 | **`issue_statuses.is_locked` มีใน DB แต่ไม่ถูก map** | `issue-status.entity.ts` ไม่มี field `isLocked` → ใช้ไม่ได้, ไม่มี endpoint, ไม่มี UI — และสถานะ `done` (id=4) **ถูกล็อกค้างอยู่แล้ว มี 3 การ์ดในนั้น** |
| 6 | **`issue.unlock` (id 296) และ `board.column.unlock` (id 295) ไม่ถูก grant ให้ใครเลย** | มีในตาราง `permissions` แต่ `role_permissions` ว่างสำหรับ 2 code นี้ + ไม่มีใน `packages/shared/src/permissions.ts` |
| 7 | **FE gate ปลดล็อกผิด** | ใช้ `can("issue.all.update")` แทน `issue.unlock` |
| 8 | **Timer ไม่เคยถูกเรียก** | `useTimer`, `<TimerDisplay>`, `<TimerHistory>`, `startTimer`, `stopTimer` มีอยู่แต่ไม่มีที่ไหน import → ตาราง `work_sessions` มี 0 แถว |
| 9 | **`status.timer_enabled` / `time_entry_enabled` ไม่มีโค้ดอ่าน** | ไม่มีที่ไหนอ้างถึงค่าทั้งสอง |
| 10 | **`notifications` มีแค่ entity** | `modules/notifications/entities/notification.entity.ts` มีอย่างเดียว — ไม่มี service/controller, ไม่มี inbox UI → ตาราง 0 แถว |
| 11 | **Migration runner ใช้ไม่ได้** | `apps/api/run-migration.ts` hardcode แค่ 2 ไฟล์; `package.json` ชี้ `dist/data-source.js` ที่ไม่มีอยู่จริง; `apps/api/src/data-source.ts` ไม่มีไฟล์ |
| 12 | **DB ไม่ตรงกับ migration files** | ตาราง `board_columns` ยังมี 5 แถว, `issues.column_id` ยังมี; `0018-remove-is-locked.sql`, `0025-merge-board-columns-into-issue-statuses.sql`, `0026-add-programmer-user-view.sql` ไม่เคยถูก apply; ตาราง `migrations` มีแค่ 4 TypeORM migration |
| 13 | **ไฟล์ `.sql` ไม่ idempotent** | `0001-add-position-fk.sql` fail ทันทีบน DB ปัจจุบัน → ต้อง baseline ไม่ใช่ replay |

### 2.2 สิทธิ์ใน DB ปัจจุบัน

| Role | จำนวน grant |
|------|------------|
| `admin` | 67 |
| `programmer` | 35 |
| `customer` | 20 |

- `permission.update` → **admin เท่านั้น** (หน้า `/settings` จึงเป็น admin-only โดยธรรมชาติ)
- `issue.lock` → admin + programmer
- `issue.unlock` → **ไม่มีใคร**
- `board.column.unlock` → **ไม่มีใคร**

### 2.3 โครงสร้าง `role_permissions`

```
id        uuid  DEFAULT gen_random_uuid()
permission varchar
role_id   int
UNIQUE (role_id, permission)
```
→ `INSERT ... ON CONFLICT (role_id, permission) DO NOTHING` ใช้ได้

### 2.4 ตาราง `notifications` (มีอยู่แล้ว)

```
id, user_id (NOT NULL), issue_id (NOT NULL), title, message, type, is_read, created_at
```
ทุก trigger เป็น issue-scoped อยู่แล้ว → `issue_id` ใส่ได้เสมอ

### 2.5 ตาราง `activity_logs` (reuse ได้)

```
id, actor_id, actor_name, actor_role, action, board_id, entity_id, detail, created_at
```
→ ใช้เขียน log `rule.fired` / `rule.error` ได้

---

## 3. แนวคิด: 2 ระบบล็อกที่ต้องแยกให้ชัด

### ระบบที่ 1: Column Lock (ล็อกคอลัมน์ / สถานะ)

- **ล็อกระดับ:** คอลัมน์ (สถานะ)
- **พฤติกรรม:** การ์ด **เข้าได้ ห้ามออก**
- **ใครล็อก:** admin / programmer (toggle ในหน้าสถานะ)
- **ใครปลด:** admin / programmer
- **สร้างกฎเองได้:** ไม่ได้ (เป็น toggle ในหน้าเท่านั้น)
- **เก็บที่:** คอลัมน์ `issue_statuses.is_locked` (มีอยู่แล้วใน DB แต่ยังไม่ได้ map)

### ระบบที่ 2: Card Lock Rule (ล็อกการ์ดผ่านกฎ)

- **ล็อกระดับ:** รายการ์ด
- **พฤติกรรม:** การ์ดถูกล็อก → **ลากย้ายไม่ได้เลย**
- **ใครล็อก:** ระบบอัตโนมัติตามกฎ (เช่น ลากไป Doing → ล็อก)
- **ใครปลด:** admin + programmer
- **สร้างกฎเองได้:** ได้ (เลือกเงื่อนไข + การกระทำเอง)
- **เก็บที่:** `issues.is_locked` + `locked_at` / `locked_by` / `lock_reason` / `lock_source`

### ตารางเปรียบเทียบ

| | Column Lock | Card Lock Rule |
|---|---|---|
| ล็อกที่ | คอลัมน์ | การ์ด |
| พฤติกรรม | เข้าได้ ห้ามออก | ลากไม่ได้เลย |
| ใครล็อก | admin / programmer | ระบบ (ตามกฎ) |
| ใครปลด | admin / programmer | admin + programmer |
| สร้างกฎเอง | ไม่ได้ | ได้ |

---

## 4. โมเดลกฎ: Trigger → Condition → Action

```
เมื่อ [Trigger]  +  [เงื่อนไข]  →  แล้ว [Action]
```

- **Trigger** = เหตุการณ์ที่เกิดขึ้นในระบบ (`issue.moved`, `comment.created`, …)
- **Condition** = เงื่อนไขที่ต้องผ่าน (field / operator / value) — เงื่อนไขหลายข้อ = **AND**
- **Action** = สิ่งที่ระบบทำอัตโนมัติ (`issue.lock`, `notify`, `block`, …)

### 4.1 เคส Trigger ที่รองรับ (13 ตัว — เปิดใช้ 5 ตัวใน MVP)

**✅ = เปิดใช้ใน MVP (Phase 3)  ·  ⏳ = เตรียมไว้ใน registry เปิดเฟส 2**

| หมวด | Trigger | คีย์ | MVP |
|------|---------|------|:---:|
| ย้าย & มอบหมายการ์ด | การ์ดถูกลาก | `issue.moved` | ✅ |
| ย้าย & มอบหมายการ์ด | การ์ดถูกมอบหมาย | `issue.assigned` | ✅ |
| สร้าง · แก้ไข · ลบการ์ด | สร้างการ์ดใหม่ | `issue.created` | ✅ |
| สร้าง · แก้ไข · ลบการ์ด | เปลี่ยนชื่อการ์ด | `issue.title_changed` | ⏳ |
| สร้าง · แก้ไข · ลบการ์ด | เปลี่ยนรายละเอียด | `issue.description_changed` | ⏳ |
| สร้าง · แก้ไข · ลบการ์ด | เปลี่ยนความสำคัญ | `issue.priority_changed` | ⏳ |
| สร้าง · แก้ไข · ลบการ์ด | เปลี่ยนหมวดหมู่ | `issue.category_changed` | ⏳ |
| สร้าง · แก้ไข · ลบการ์ด | ลบการ์ด | `issue.deleted` | ⏳ |
| สร้าง · แก้ไข · ลบการ์ด | กู้คืนการ์ด | `issue.restored` | ⏳ |
| คอมเมนต์ & ไฟล์แนบ | มีคอมเมนต์ใหม่ | `comment.created` | ✅ |
| คอมเมนต์ & ไฟล์แนบ | มีไฟล์แนบ | `attachment.created` | ✅ |
| จับเวลา | เริ่มจับเวลา | `work_session.started` | ⏳ |
| จับเวลา | หยุดจับเวลา | `work_session.stopped` | ⏳ |

> ❌ **ตัด `issue.updated` ออก** — "แก้ไขการ์ด" = แตะ field ไหนก็เข้าเงื่อนไข
> → เขียนกฎกับมันไม่ได้ว่าจะทำอะไร (ล็อกการ์ดทุกใบที่แก้ชื่อ? เหมือนกัน)
> → แตกออกเป็น 4 trigger เฉพาะทางแทน

#### ทำไม 5 ตัวแรกถึงครอบคลุม 90%

จาก workflow จริงของระบบ: ลูกค้าแจ้งปัญหา → มอบหมายโปรแกรมเมอร์ → ทำงาน → ส่งกลับ → ปิด

| Trigger | ใช้ทำอะไรได้จริง |
|---------|----------------|
| `issue.created` | ลูกค้าแจ้งปัญหาใหม่ → แจ้งเตือนทีม + ล็อกสถานะเริ่มต้น |
| `issue.assigned` | มอบหมายงาน → แจ้งเตือนโปรแกรมเมอร์ |
| `issue.moved` | ลากเข้า Doing → เริ่มจับเวลา · ลากเข้า Done → ล็อกการ์ด |
| `comment.created` | ลูกค้าถามเพิ่ม → แจ้งเตือนผู้รับผิดชอบ |
| `attachment.created` | ส่งรูปหลักฐาน → แจ้งเตือน |

### 4.2 เคส Action ที่รองรับ (4 ตัวใช้จริง + 8 ตัวสำรอง)

| Action | คีย์ | พารามิเตอร์ |
|--------|------|------------|
| ล็อกการ์ด | `issue.lock` | เหตุผล (ไม่บังคับ) |
| ปลดล็อกการ์ด | `issue.unlock` | — |
| ห้ามทำรายการนี้ | `block` | เหตุผล (บังคับ) |
| แจ้งเตือน | `notify` | ผู้รับ, ข้อความ |

**Action สำรอง (ต่อยอดได้โดยไม่แก้ schema):**
`issue.add_label`, `issue.remove_label`, `issue.move_status`, `issue.assign`, `issue.comment`, `issue.set_priority`, `issue.set_due_date`, `work_session.start`

### 4.3 ปัญหาเฉพาะที่ต้องจัดการ

| ปัญหา | วิธีจัดการ |
|--------|----------|
| กฎซ้ำกัน / ขัดแย้ง | กฎมี `priority` (int) → เรียงจากน้อยไปมาก, เท่ากันใช้ `created_at`; กฎ `block` ตรวจก่อนกฎอื่นเสมอ |
| กฎ "ห้ามเคลื่อนย้าย" | เก็บ `block_reason` → ตอบ **403 + เหตุผล** → ฝั่ง FE แสดง toast error; บันทึก activity log ว่ามีคนพยายามทำแต่ถูกบล็อก |
| กฎซ้อนกัน (Chain) | **ไม่ให้ซ้อน** — action ที่กฎทำจะไม่ยิง trigger ของกฎอื่น (กัน infinite loop) |
| กฎ error | **Error isolation** — action หนึ่งพัง ไม่กระทบอื่น และไม่ rollback รายการหลัก |
| Performance | แมป `trigger → rules` ใน memory (`Map`) + refresh ทุกครั้งที่มี CRUD |
| กฎถูกปิด/ลบ | มี `is_active` → ปิดชั่วคราวแล้วเปิดใหม่ได้ |

---

## 5. โครงสร้างข้อมูล (3 ตาราง + 2 คอลัมน์)

### 5.1 ตาราง `rules`

```sql
CREATE TABLE rules (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  description     TEXT,
  trigger_key     VARCHAR(64) NOT NULL,       -- "issue.moved"  (ไม่ใช้คำว่า trigger เพราะเป็นคำสงวน)
  template_key    VARCHAR(64),                -- ★ จำ template ที่ใช้ → แสดงกลับเป็นประโยคตอนแก้ไข
  category        VARCHAR(64),                -- ★ หมวด → ใช้กับ dropdown filter
  action_key      VARCHAR(64) NOT NULL,       -- "issue.lock"
  action_config   JSONB NOT NULL DEFAULT '{}',-- ★ JSONB → action ใหม่ไม่ต้อง ALTER TABLE
  condition_group VARCHAR(4) DEFAULT 'AND',
  priority        INT DEFAULT 5,
  is_active       BOOLEAN DEFAULT false,
  stop_on_error   BOOLEAN DEFAULT false,
  created_by      INT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.2 ตาราง `rule_conditions`

```sql
CREATE TABLE rule_conditions (
  id              SERIAL PRIMARY KEY,
  rule_id         INT NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  field           VARCHAR(64) NOT NULL,   -- "to_status"
  operator        VARCHAR(16) NOT NULL,   -- "="
  value           TEXT,                   -- "3"
  value_type      VARCHAR(16) DEFAULT 'text',
  condition_group VARCHAR(4) DEFAULT 'AND',
  position        INT DEFAULT 0
);
```

### 5.3 ตาราง `rule_runs` (ประวัติการทำงาน)

```sql
CREATE TABLE rule_runs (
  id            SERIAL PRIMARY KEY,
  rule_id       INT REFERENCES rules(id) ON DELETE SET NULL,
  rule_name     VARCHAR(150),
  trigger_key   VARCHAR(64),
  trigger_event JSONB,                          -- ★ snapshot ของ event ตอนที่ยิง
  issue_id      INT,
  status        VARCHAR(16) NOT NULL,     -- success | error | blocked
  action_result JSONB,
  error_message TEXT,
  duration_ms   INT,                      -- ★ เวลาที่ใช้ (วัด performance)
  actor_id      INT,
  actor_name    VARCHAR(150),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_rule_runs_rule_created ON rule_runs (rule_id, created_at DESC);
CREATE INDEX idx_rule_runs_issue       ON rule_runs (issue_id);
CREATE INDEX idx_rule_runs_status      ON rule_runs (status, created_at DESC);
```

### 5.4 จุดสำคัญ

- **`action_config` เป็น JSONB** = เพิ่ม action ใหม่ได้โดยไม่ต้อง ALTER TABLE (หลัก "ครอบคลุมเกือบทุกอย่าง")
- **โหมดประโยค** กับ **โหมด Advanced** ใช้ตาราง `rule_conditions` ชุดเดียวกันเป๊ะ
- `template_key` + `category` คือ 2 คอลัมน์เดียวที่เพิ่มจากแบบเดิม
- ⚠️ **`notifications.issue_id` ต้อง ALTER เป็น NULLABLE** — ตอนนี้เป็น `NOT NULL`
  → กฎที่แจ้งเตือนโดยไม่ผูกกับการ์ด (เช่น "แจ้งเตือนทีมทั้งหมด") จะใส่ไม่ได้

```sql
ALTER TABLE notifications ALTER COLUMN issue_id DROP NOT NULL;
```

---

## 6. Registry: `packages/shared/src/rules.ts`

ไฟล์ใหม่ใน `packages/shared` (ใช้ร่วมกันทั้ง API และ Web — ถูก import เป็น raw TS ไม่ต้อง build)

### 6.1 ชั้นที่ 1 — หมวด (แท็บ)

> ⚠️ **ชื่อแท็บต้องบอกว่า "ข้างในมีอะไร"** — ชื่อกว้าง ๆ แบบ "การเปลี่ยนแปลงการ์ด" ทำให้ผู้ใช้งง
> และ **ชื่อแท็บต้องไม่ทับซ้อนกับชื่อ trigger** (เช่น trigger `issue.moved` ชื่อ "การ์ดถูกลาก")

```ts
export const RULE_TRIGGER_CATEGORIES = [
  { key: "card_move",   label: { th: "ย้าย & มอบหมายการ์ด",     en: "Move & Assign" } },
  { key: "card_change", label: { th: "สร้าง · แก้ไข · ลบการ์ด",  en: "Create · Edit · Delete" } },
  { key: "content",     label: { th: "คอมเมนต์ & ไฟล์แนบ",        en: "Comments & Files" } },
  { key: "timing",      label: { th: "จับเวลา",                   en: "Time Tracking" } },
];
```

| หมวด | trigger ที่อยู่ในหมวด | เปิดใช้ MVP |
|------|---------------------|:---:|
| ย้าย & มอบหมายการ์ด | `issue.moved` · `issue.assigned` | ทั้งคู่ |
| สร้าง · แก้ไข · ลบการ์ด | `issue.created` · `issue.title_changed` · `issue.description_changed` · `issue.priority_changed` · `issue.category_changed` · `issue.deleted` · `issue.restored` | `issue.created` |
| คอมเมนต์ & ไฟล์แนบ | `comment.created` · `attachment.created` | ทั้งคู่ |
| จับเวลา | `work_session.started` · `work_session.stopped` | — |

### 6.2 ชั้นที่ 2 — Trigger (มี `fields` สำหรับโหมด Advanced + `templates` สำหรับโหมดประโยค)

> **สำคัญ:** `fields` ประกาศ **ต่อ trigger** (ไม่ใช่ตาราง global) → แต่ละเหตุการณ์มี field ที่ใช้ได้เฉพาะของมัน
> และ `contextKey` บอกว่า field นั้นจะดึงค่าจาก context ตรงไหน

#### MVP — เปิดใช้ 5 ตัว

```ts
export const RULE_TRIGGERS = [
  {
    key: "issue.moved",
    category: "card_move",
    label: { th: "การ์ดถูกลาก", en: "Card moved" },
    fields: [
      { key: "to_status",   type: "status",   contextKey: "toStatusId" },
      { key: "from_status", type: "status",   contextKey: "fromStatusId" },
      { key: "actor_role",  type: "role",     contextKey: "actorRole" },
    ],
    templates: [
      { key: "moved_to",   text: "เมื่อการ์ดถูกลากไปยัง {status}",
        slots: [{ name: "status", field: "to_status", type: "status" }] },
      { key: "moved_from", text: "เมื่อการ์ดถูกลากออกจาก {status}",
        slots: [{ name: "status", field: "from_status", type: "status" }] },
      { key: "moved_any",  text: "เมื่อการ์ดถูกลาก", slots: [] },
    ],
  },
  {
    key: "issue.assigned",
    category: "card_move",
    label: { th: "การ์ดถูกมอบหมาย", en: "Card assigned" },
    fields: [
      { key: "to_assignee",   type: "user", contextKey: "assigneeId" },
      { key: "from_assignee", type: "user", contextKey: "previousAssigneeId" },
      { key: "actor_role",    type: "role", contextKey: "actorRole" },
    ],
    templates: [
      { key: "assigned_to",   text: "เมื่อการ์ดถูกมอบหมายให้ {user}",
        slots: [{ name: "user", field: "to_assignee", type: "user" }] },
      { key: "assigned_from", text: "เมื่อการ์ดถูกถอดมอบหมายจาก {user}",
        slots: [{ name: "user", field: "from_assignee", type: "user" }] },
    ],
  },
  {
    key: "issue.created",
    category: "card_change",
    label: { th: "สร้างการ์ดใหม่", en: "Card created" },
    fields: [
      { key: "status",      type: "status",   contextKey: "toStatusId" },
      { key: "priority",    type: "priority", contextKey: "priorityId" },
      { key: "category",    type: "category", contextKey: "categoryId" },
      { key: "reporter",    type: "user",     contextKey: "reporterId" },
      { key: "actor_role",  type: "role",     contextKey: "actorRole" },
    ],
    templates: [
      { key: "created_in", text: "เมื่อมีการ์ดใหม่ถูกสร้างใน {status}",
        slots: [{ name: "status", field: "status", type: "status" }] },
      { key: "created_any", text: "เมื่อมีการ์ดใหม่ถูกสร้าง", slots: [] },
    ],
  },
  {
    key: "comment.created",
    category: "content",
    label: { th: "มีคอมเมนต์ใหม่", en: "Comment added" },
    fields: [
      { key: "comment_author", type: "user", contextKey: "actorId" },
      { key: "actor_role",     type: "role", contextKey: "actorRole" },
      { key: "status",         type: "status", contextKey: "toStatusId" },
    ],
    templates: [
      { key: "comment_new", text: "เมื่อมีคอมเมนต์ใหม่", slots: [] },
      { key: "comment_by",  text: "เมื่อมีคอมเมนต์ใหม่ โดย {user}",
        slots: [{ name: "user", field: "comment_author", type: "user" }] },
    ],
  },
  {
    key: "attachment.created",
    category: "content",
    label: { th: "มีไฟล์ถูกแนบ", en: "File attached" },
    fields: [
      { key: "attachment_author", type: "user", contextKey: "actorId" },
      { key: "actor_role",        type: "role", contextKey: "actorRole" },
    ],
    templates: [
      { key: "attachment_new", text: "เมื่อมีไฟล์ถูกแนบ", slots: [] },
      { key: "attachment_by",  text: "เมื่อมีไฟล์ถูกแนบ โดย {user}",
        slots: [{ name: "user", field: "attachment_author", type: "user" }] },
    ],
  },
];
```

#### เฟส 2 — เตรียมไว้ใน registry แต่ยังไม่เปิดใช้

```ts
// ── แตก issue.updated ออกเป็นเฉพาะทาง ──────────────────────────
{
  key: "issue.title_changed",
  category: "card_change",
  label: { th: "เปลี่ยนชื่อการ์ด", en: "Title changed" },
  fields: [
    { key: "title",     type: "text", contextKey: "newValue" },
    { key: "old_title", type: "text", contextKey: "oldValue" },
  ],
  templates: [
    { key: "title_changed",    text: "เมื่อเปลี่ยนชื่อการ์ด", slots: [] },
    { key: "title_changed_to", text: "เมื่อเปลี่ยนชื่อการ์ดเป็น {title}",
      slots: [{ name: "title", field: "title", type: "text" }] },
  ],
},
{
  key: "issue.description_changed",
  category: "card_change",
  label: { th: "เปลี่ยนรายละเอียด", en: "Description changed" },
  fields: [
    { key: "description",     type: "text", contextKey: "newValue" },
    { key: "old_description", type: "text", contextKey: "oldValue" },
  ],
  templates: [{ key: "description_changed", text: "เมื่อเปลี่ยนรายละเอียดการ์ด", slots: [] }],
},
{
  key: "issue.priority_changed",
  category: "card_change",
  label: { th: "เปลี่ยนความสำคัญ", en: "Priority changed" },
  fields: [
    { key: "priority",     type: "priority", contextKey: "newValue" },
    { key: "old_priority", type: "priority", contextKey: "oldValue" },
  ],
  templates: [
    { key: "priority_changed_to", text: "เมื่อเปลี่ยนความสำคัญเป็น {priority}",
      slots: [{ name: "priority", field: "priority", type: "priority" }] },
  ],
},
{
  key: "issue.category_changed",
  category: "card_change",
  label: { th: "เปลี่ยนหมวดหมู่", en: "Category changed" },
  fields: [
    { key: "category",     type: "category", contextKey: "newValue" },
    { key: "old_category", type: "category", contextKey: "oldValue" },
  ],
  templates: [{ key: "category_changed", text: "เมื่อเปลี่ยนหมวดหมู่ของการ์ด", slots: [] }],
},
{
  key: "issue.deleted",
  category: "card_change",
  label: { th: "ลบการ์ด", en: "Card deleted" },
  fields: [{ key: "status", type: "status", contextKey: "fromStatusId" }],
  templates: [{ key: "deleted_any", text: "เมื่อการ์ดถูกลบ", slots: [] }],
},
{
  key: "issue.restored",
  category: "card_change",
  label: { th: "กู้คืนการ์ด", en: "Card restored" },
  fields: [{ key: "status", type: "status", contextKey: "toStatusId" }],
  templates: [{ key: "restored_any", text: "เมื่อการ์ดถูกกู้คืน", slots: [] }],
},
{
  key: "work_session.started",
  category: "timing",
  label: { th: "เริ่มจับเวลา", en: "Timer started" },
  fields: [
    { key: "status",   type: "status", contextKey: "toStatusId" },
    { key: "assignee", type: "user",   contextKey: "actorId" },
  ],
  templates: [{ key: "timer_started", text: "เมื่อเริ่มจับเวลา", slots: [] }],
},
{
  key: "work_session.stopped",
  category: "timing",
  label: { th: "หยุดจับเวลา", en: "Timer stopped" },
  fields: [
    { key: "status",     type: "status", contextKey: "fromStatusId" },
    { key: "duration",   type: "number", contextKey: "durationMinutes" },
  ],
  templates: [
    { key: "timer_stopped", text: "เมื่อหยุดจับเวลา", slots: [] },
    { key: "timer_over",   text: "เมื่อหยุดจับเวลาแล้วใช้เวลาเกิน {minutes} นาที",
      slots: [{ name: "minutes", field: "duration", type: "number" }] },
  ],
},
```

> **หมายเหตุ:** ทุก trigger แตก `issue.updated` ออกแล้ว → ไม่มี trigger ไหนกว้างเกินจนเขียนกฎไม่ได้
> `issue.title_changed` / `description_changed` ใช้ `contextKey: "newValue"` / `"oldValue"`
> → service ส่งค่าเก่า/ใหม่มาใน context ได้เลย

### 6.3 ชั้นที่ 3 — Action

```ts
export const RULE_ACTIONS = [
  { key: "issue.lock",   label: { th: "ล็อกการ์ด",   en: "Lock card" },
    description: { th: "ล็อกการ์ดนี้เพื่อไม่ให้แก้ไขหรือลากย้าย",
                   en: "Lock the card so it cannot be edited or moved" },
    slots: [{ name: "reason", type: "text", optional: true }] },

  { key: "issue.unlock", label: { th: "ปลดล็อกการ์ด", en: "Unlock card" },
    description: { th: "ปลดล็อกการ์ดที่ถูกล็อกอยู่", en: "Unlock a locked card" },
    slots: [] },

  { key: "block",        label: { th: "ห้ามทำรายการนี้", en: "Block the action" },
    description: { th: "บล็อกการกระทำ พร้อมข้อความบอกเหตุผล",
                   en: "Block the operation with a reason" },
    slots: [{ name: "reason", type: "text", required: true }] },

  { key: "notify",       label: { th: "แจ้งเตือน",    en: "Send notification" },
    description: { th: "ส่งข้อความแจ้งเตือนให้ผู้ที่เกี่ยวข้อง",
                   en: "Notify the relevant people" },
    slots: [{ name: "target", type: "notify_target" }, { name: "message", type: "text" }] },
];
```

### 6.4 ชนิด field → operator ที่อนุญาต (ตารางร่วม)

```ts
export type RuleFieldType =
  | "status" | "priority" | "user" | "role"
  | "label" | "category" | "text" | "number" | "boolean";

export type RuleOperator =
  | "=" | "!=" | ">" | ">=" | "<" | "<="
  | "in" | "not_in"
  | "contains" | "not_contains" | "is_empty" | "is_not_empty";

export interface RuleFieldTypeDef {
  operators: RuleOperator[];
  many: boolean;          // เก็บเป็น list ได้ไหม
  numeric?: boolean;      // รองรับ > >= < <= ไหม
}

export const RULE_FIELD_TYPES: Record<RuleFieldType, RuleFieldTypeDef> = {
  status:   { operators: ["=", "!=", "in", "not_in"], many: false },
  priority: { operators: ["=", "!=", "in", "not_in"], many: false },
  user:     { operators: ["=", "!=", "in", "not_in"], many: false },
  role:     { operators: ["=", "!=", "in", "not_in"], many: false },
  category: { operators: ["=", "!=", "in", "not_in"], many: false },
  label:    { operators: ["contains", "not_contains", "is_empty", "is_not_empty"], many: true },
  text:     { operators: ["=", "!=", "contains", "not_contains", "is_empty", "is_not_empty"], many: false },
  number:   { operators: ["=", "!=", ">", ">=", "<", "<="], many: false, numeric: true },
  boolean:  { operators: ["=", "!="], many: false },
};

export interface RuleFieldDef {
  key: string;
  label: { th: string; en: string };
  type: RuleFieldType;
  contextKey: string;      // ← ดึงค่าจาก event context
}
```

> **จุดสำคัญ:** field **ไม่ได้ประกาศเป็นตาราง global** แต่ประกาศ **ต่อ trigger** ใน `RULE_TRIGGERS[].fields`
> → แต่ละเหตุการณ์มี field ที่ใช้ได้เฉพาะของมัน · โหมด Advanced เรนเดอร์จากรายการนี้
> → **เพิ่ม trigger ใหม่ = แก้ registry อย่างเดียว ไม่ต้องแตะ engine**

### 6.5 Matcher เป็น pure function (อยู่ใน shared → unit-test ได้ ไม่แตะ DB)

```ts
export type RuleContext = Record<string, unknown>;   // flat context เช่น { toStatusId: 3, actorRole: "admin" }

export function evaluateCondition(
  cond: RuleCondition,
  ctx: RuleContext,
  trigger: RuleTrigger,        // ← เอา fields ของ trigger ที่ยิงมา
): boolean {
  const field = trigger.fields.find((f) => f.key === cond.field);
  if (!field) return false;

  const typeDef = RULE_FIELD_TYPES[field.type];
  if (!typeDef.operators.includes(cond.operator)) return false;   // operator ไม่อนุญาตกับ field นี้

  const actual = ctx[field.contextKey];
  const expected = cond.value;

  switch (cond.operator) {
    case "=":          return typeDef.many ? asArray(actual).includes(expected) : actual === expected;
    case "!=":         return typeDef.many ? !asArray(actual).includes(expected) : actual !== expected;
    case "in":         return asArray(expected).includes(actual);
    case "not_in":     return !asArray(expected).includes(actual);
    case "contains":   return asArray(actual).includes(expected);
    case "not_contains": return !asArray(actual).includes(expected);
    case "is_empty":   return isEmpty(actual);
    case "is_not_empty": return !isEmpty(actual);
    case ">": case ">=": case "<": case "<=": {
      const a = Number(actual); const b = Number(expected);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      return cond.operator === ">"  ? a >  b
           : cond.operator === ">=" ? a >= b
           : cond.operator === "<"  ? a <  b
           :                          a <= b;
    }
    default:           return false;
  }
}
```

### 6.6 Template resolution อยู่ใน shared (single source of truth)

> เดิมวางว่า "แปลงฝั่ง UI" — **ไม่ถูก** เพราะ API จะตรวจความถูกต้องไม่ได้
> ย้ายมาไว้ใน shared → web ใช้สร้างเงื่อนไข · api ใช้ validate ว่าค่าที่ส่งมาตรงกับ template

```ts
export function resolveTemplate(templateKey: string, slots: Record<string, unknown>): RuleCondition[] {
  const tpl = findTemplate(templateKey);
  if (!tpl) throw new Error(`Unknown template: ${templateKey}`);
  return tpl.slots.map((slot, i) => ({
    field: slot.field,                 // ← template ระบุ field ตรง ๆ
    operator: slot.operator ?? "=",
    value: String(slots[slot.name] ?? ""),
    position: i,
  }));
}
```

### 6.7 Action config แบบ typed — registry มี `configSchema`

```ts
{
  key: "block",
  configSchema: {
    reason: { type: "string", required: true, maxLength: 500, placeholders: true },
  },
}
```
→ API ตรวจ `action_config` ก่อนเขียน JSONB → ไม่มีข้อมูลขยะในตาราง

---

## 7. การทำงานของกฎ

### 7.1 Engine แยกเป็น 2 contract ชัดเจน

```ts
// PRE-CHECK — เรียกก่อนทำรายการ, throw 403 ถ้าตรง
assertAllowed(triggerKey: string, ctx: RuleContext, actor: ActorInfo): void

// POST-EXECUTE — เรียกหลังทำรายการสำเร็จ, ไม่ throw
dispatch(triggerKey: string, ctx: RuleContext, actor: ActorInfo): Promise<void>
```

→ **โครงสร้างบังคับว่า action `block` ไม่มีทางทำงานหลังรายการเสร็จ**
→ `ctx` เป็น flat context ที่ผู้เรียกส่งมาเอง (service รู้ว่ามีอะไรในเหตุการณ์นั้น)

```
PRE-CHECK (ก่อนทำรายการ)              POST-EXECUTE (หลังทำรายการสำเร็จ)
──────────────────────────              ────────────────────────────────
assertAllowed()                        dispatch()
  ↓                                      ↓
กฎที่ action = "block"                กฎที่ action = lock / unlock / notify
  ↓                                      ↓
evaluateCondition() ทุกเงื่อนไข            evaluateCondition() ทุกเงื่อนไข
  ↓ ผ่านทั้งหมด                           ↓ ผ่านทั้งหมด
throw ForbiddenException(403)            ทำ action (try/catch ต่อ action)
  + เหตุผลจาก action_config.reason        + บันทึก rule_runs (success)
  + resolve placeholder ในข้อความ           + error → บันทึก rule_runs (error)
  + บันทึก rule_runs (status = blocked)      (ไม่ rollback รายการหลัก)
  + บันทึก activity_logs
```

### 7.2 ตัวอย่างการเรียกจาก service

```ts
// issues.service.ts → move()
await this.rules.assertAllowed("issue.moved", {
  toStatusId: targetStatus.id,
  fromStatusId: issue.statusId,
  issueId: issue.id,
  priorityId: issue.priorityId,
  labelIds: (issue.labels ?? []).map((l) => l.id),
  actorRole: actor?.role ?? null,
}, actor);

// ... ทำการลากการ์ด ...

await this.rules.dispatch("issue.moved", { /* context เดิม */ }, actor);
```

### 7.3 Validation — ตอนบันทึก **และ** ตอนเปิดใช้งาน

```
ตรวจ: trigger มีใน registry? · action มี? · action_config ผ่าน configSchema?
      · field มีใน RULE_FIELDS? · operator อนุญาตกับ field ไหม?
      · value แปลงเป็น type ของ field ได้ไหม?
ผลลัพธ์: 400 พร้อม error ราย field
→ ปุ่ม "เปิดใช้งาน" จะกดได้ก็ต่อเมื่อผ่าน validation เท่านั้น
```

### 7.4 Placeholder ในข้อความ / เหตุผล

```
เหตุผล: "ต้องให้ {actor} อนุมัติก่อน {status}"
→ resolve จาก context ตอน execute
```

### 7.5 หลักการ

- ❌ **ไม่มี chaining** — action ที่กฎทำจะไม่ยิง trigger ของกฎอื่น
- ✅ **Error isolation** — action หนึ่งพัง ไม่กระทบอื่น, ไม่ rollback รายการหลัก
- 📝 **ทุกครั้งที่ยิง → บันทึก `rule_runs`** (พร้อม `duration_ms` + `trigger_event` snapshot)
- ⚡ **Cache:** `Map<triggerKey, Rule[]>` ใน memory, refresh ทุก CRUD
- 🔁 **Priority:** เรียงตาม `priority` จากน้อย → มาก; `block` ตรวจก่อนเสมอ
- 🧩 **ไม่ import IssuesModule** — RulesService ใช้ repository ตรง เพื่อกัน circular dependency
- 🔒 **Optimistic locking** — client ส่ง `updatedAt` → server เทียบ → ไม่ตรง = 409 Conflict
- 🚧 **Registry drift** — ถ้า registry ลบ action/trigger ที่กฎใช้อยู่ → กฎนั้นถูกข้าม + ทำเครื่องหมาย `invalid` (ไม่ crash)

### 7.6 จุดที่ติด hook ในโค้ดจริง

**MVP — 5 ตัว (hook จริง)**

| Event | ไฟล์ / ฟังก์ชัน | Context ที่ส่ง |
|-------|-----------------|--------------|
| `issue.created` | `issues.service.ts` → `create()` | `toStatusId`, `priorityId`, `categoryId`, `reporterId`, `actorRole` |
| `issue.moved` | `issues.service.ts` → `move()` | `toStatusId`, `fromStatusId`, `issueId`, `actorRole` |
| `issue.assigned` | `issues.service.ts` → `assign()` | `assigneeId`, `previousAssigneeId`, `actorRole` |
| `comment.created` | `comments.service.ts` → `create()` | `actorId`, `actorRole`, `toStatusId`, `issueId` |
| `attachment.created` | `attachments.service.ts` → `create()` | `actorId`, `actorRole`, `issueId` |

**เฟส 2 — 8 ตัว (hook จริง)**

| Event | ไฟล์ / ฟังก์ชัน | Context ที่ส่ง |
|-------|-----------------|--------------|
| `issue.title_changed` | `issues.service.ts` → `update()` | `newValue`, `oldValue`, `issueId` |
| `issue.description_changed` | `issues.service.ts` → `update()` | `newValue`, `oldValue`, `issueId` |
| `issue.priority_changed` | `issues.service.ts` → `update()` | `newValue`, `oldValue`, `issueId` |
| `issue.category_changed` | `issues.service.ts` → `update()` | `newValue`, `oldValue`, `issueId` |
| `issue.deleted` | `issues.service.ts` → `remove()` | `fromStatusId`, `issueId` |
| `issue.restored` | `issues.service.ts` → `restore()` | `toStatusId`, `issueId` |
| `work_session.started` | `work-sessions.service.ts` | `toStatusId`, `actorId` |
| `work_session.stopped` | `work-sessions.service.ts` | `fromStatusId`, `durationMinutes` |

> ⚠️ ทั้ง 4 trigger แบบ `*_changed` ติด hook ที่ `update()` เดียวกัน
> → service ต้องเช็คว่า field ไหนเปลี่ยนจริง แล้วยิง trigger ที่ตรงกับ field นั้นเท่านั้น

---

## 8. API

### 8.1 Rules

| Method | Route | หมายเหตุ |
|--------|-------|-----------|
| `GET` | `/rules` | รายการกฎ + เงื่อนไข (filter: `category`, `actionKey`, `isActive`) |
| `GET` | `/rules/:id` | รายละเอียดกฎ |
| `POST` | `/rules` | สร้างกฎ — validate ก่อนบันทึก → 400 พร้อม error ราย field |
| `PUT` | `/rules/:id` | แก้ไขกฎ — ต้องส่ง `updatedAt` → 409 ถ้าถูกแก้ไขโดยคนอื่น |
| `DELETE` | `/rules/:id` | ลบกฎ |
| `PATCH` | `/rules/:id/toggle` | เปิด/ปิด — เปิดได้ต่อเมื่อผ่าน validation |
| `POST` | `/rules/simulate` | 🧪 **dry-run** — ใส่ event ปลอม → บอกว่ากฎไหนจะทำงาน + อะไรจะถูก block |
| `GET` | `/rules/runs` | 📜 **ประวัติการทำงาน** (filter: `ruleId`, `status`, `issueId`, `page`) |

ทุก route ใช้ `@Permissions("permission.update")` + `@UseGuards(RolesGuard)`
(ไม่สร้าง permission ใหม่ — ใช้ตัวเดิมที่อยู่ในหน้า `/settings`)

### 8.2 Issues (Phase 0)

| Method | Route | Permission |
|--------|-------|------------|
| `PUT` | `/issues/:id/lock` | `issue.lock` |
| `PUT` | `/issues/:id/unlock` | `issue.unlock` |

### 8.3 Issue Statuses (Phase 1)

| Method | Route | Permission |
|--------|-------|------------|
| `PATCH` | `/issue-statuses/:id/lock` | `board.column.unlock` |

### 8.4 Notifications

| Method | Route | หมายเหตุ |
|--------|-------|-----------|
| `GET` | `/notifications` | รายการของผู้ใช้ปัจจุบัน |
| `GET` | `/notifications/unread-count` | ตัวเลขบนกระดิ่ง 🔔 |
| `PATCH` | `/notifications/:id/read` | ทำเครื่องหมายว่าอ่านแล้ว |
| `PATCH` | `/notifications/read-all` | อ่านทั้งหมด |

---

## 9. UI

### 9.1 โครงสร้าง route (หน้าเต็ม แบบ Trello)

```
/settings                      → Master Data (แท็บเดิม ไม่แตะ)
/settings/rules                → ⚡ หน้ารายการกฎ          ← เปิดจากปุ่ม ⚡
/settings/rules/new            → wizard 3 ขั้น (สร้างใหม่)
/settings/rules/[id]/edit      → wizard 3 ขั้น (แก้ไข)
/settings/rules/runs           → ประวัติการทำงาน (แยกหน้า ไม่ซ้อน Dialog)
```

- **ไม่มีแท็บ "กฎ"** — ลบออกจาก `tabs` array (`settings/page.tsx:818`)
- **ไม่เพิ่มรายการใน sidebar** — เข้าผ่านปุ่ม ⚡ เท่านั้น
- ไม่มี sidebar ซ้ายในหน้ากฎ → ใช้ **แถบ filter** แทน (ต่างจาก Trello โดยตั้งใจ)

### 9.1.1 ปุ่ม "⚡ กฎอัตโนมัติ" ข้างๆ "+ เพิ่มสถานะ" (จุดเข้า)

**หน้าตั้งค่า → แท็บ "สถานะ"**

```
┌──────────────────────────────────────────────────────────────────────┐
│  สถานะ                    [⚡ กฎอัตโนมัติ]  [ + เพิ่มสถานะ ]           │
│  ลากเพื่อเรียงลำดับสถานะ                                             │
├──────────────────────────────────────────────────────────────────────┤
│  ≡ [1] ● Backlog   งานที่เข้ามาใหม่      [เปิดใช้งาน]  [◐] [✏️] [🗑️] │
│  ≡ [2] ● Todo      งานที่พร้อมทำ         [เปิดใช้งาน]  [◐] [✏️] [🗑️] │
│  ≡ [3] ● Doing     งานที่กำลังทำ        [เปิดใช้งาน]  [◐] [✏️] [🗑️] │
│  ≡ [4] ● Review    กรณีเทสต               [เปิดใช้งาน]  [◐] [✏️] [🗑️] │
│  ≡ [5] ● done      งานที่ทำเสร็จแล้ว    [เปิดใช้งาน]  [◐] [✏️] [🗑️] │
│  ≡ [6] ● 9          —                      [เปิดใช้งาน]  [◐] [✏️] [🗑️] │
└──────────────────────────────────────────────────────────────────────┘
```

```tsx
// settings/page.tsx:920 — หัวแท็บ "สถานะ"
<Box sx={{ display: "flex", gap: 1 }}>
  <Button variant="outlined" startIcon={<BoltIcon />} onClick={() => router.push("/settings/rules")}>
    {t("automationRules")}
  </Button>
  {can("status.create") && (
    <Button variant="contained" startIcon={<AddIcon />} onClick={openAddStatus}>
      {t("addStatus")}
    </Button>
  )}
</Box>
```

> ใช้ `useRouter` จาก `@/i18n/navigation` (ไม่ใช่ `next/navigation`) ตาม convention ของโปรเจกต์

### 9.1.2 หน้ารายการกฎ (`/settings/rules`)

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ⚡ กฎอัตโนมัติ                  [ประวัติการทำงาน]        [+ สร้างกฎ]          │
├──────────────────────────────────────────────────────────────────────────────────┤
│  [ ทุกกฎ (6) ] [ เปิดอยู่ (4) ] [ ปิดอยู่ (2) ]   [🔍 ค้นหา…] [หมวด ▾] [การกระทำ ▾]│
├──────────────────────────────────────────────────────────────────────────────────┤
│  ⣿ 🔒 ล็อกการ์ดเมื่อเสร็จ                                        ● เปิดอยู่  [⋮] │
│     เมื่อ  การ์ดถูกลากไปยัง Doing                                                    │
│     แล้ว  ล็อกการ์ด                                          ทำงาน 12 ครั้ง · 5 นาทีที่แล้ว│
├──────────────────────────────────────────────────────────────────────────────────┤
│  ⣿ 🔔 แจ้งเตือนเมื่อมีคอมเมนต์                                    ○ ปิดอยู่  [⋮] │
│     เมื่อ  มีคอมเมนต์ใหม่                                                           │
│     แล้ว  ส่งแจ้งเตือนหาผู้รับหมายงาน                                                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- แถบ filter: สถานะ (ทุกกฎ / เปิดอยู่ / ปิดอยู่) · ค้นหา · หมวด · action
- "⋮" = เมนูจุดสามจุด (แก้ไข / เปิด-ปิด / ลบ / ดูประวัติ)
- แสดงจำนวนครั้งที่ทำงานล่าสุด + เวลาอัปเดตล่าสุด → อ่านสถานะกฎได้เร็ว
- ปุ่ม "ประวัติการทำงาน" → `/settings/rules/runs`

### 9.2 Wizard 3 ขั้นตอน (หน้าเต็มแบบ Trello)

> อยู่ที่ `/settings/rules/new` (สร้างใหม่) และ `/settings/rules/[id]/edit` (แก้ไข)
> ปุ่ม "← ย้อนกลับ" ในขั้นที่ ② จะกลับไปหน้ารายการกฎ

#### ขั้นที่ ① เลือกเหตุการณ์

> ชื่อขั้นตรงกับ Trello — **"Select trigger"** ไม่ใช่ condition
> เพราะสิ่งที่ผู้ใช้เลือกจริง ๆ คือ **เหตุการณ์** ส่วน "เงื่อนไข" คือ dropdown ในประโยค

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  ← ย้อนกลับ                                            ยกเลิก       บันทึกกฎ (ปิด) │
├──────────────────────────────────────────────────────────────────────────────────┤
│   ① เลือกเหตุการณ์  ──────────▶  ② เลือกการกระทำ  ──────────▶  ③ ตรวจและบันทึก        │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  เลือกเหตุการณ์ที่ต้องการตรวจจับ                                                  │
│  เลือกได้ 1 เหตุการณ์ต่อกฎ — เลือกใหม่จะแทนที่ของเดิม                           │
│                                                              [ โหมดขั้นสูง ○─── ]  │
│                                                                                   │
│  ┌───────────────┬──────────────────┬──────────────┬──────────────┐                │
│  │ ย้าย &        │ สร้าง · แก้ไข ·   │ คอมเมนต์ &   │ จับเวลา     │                │
│  │ มอบหมายการ์ด  │ ลบการ์ด           │ ไฟล์แนบ      │              │                │
│  └───────────────┴──────────────────┴──────────────┴──────────────┘                │
│                                                                                   │
│  ┌───────────────────────────────────────────────────────────────────────────┐    │
│  │ ▸ เมื่อการ์ดถูกลากไปยัง   [ ทุกสถานะ ▾ ]   โดย [ ทุกคน ▾ ]             │    │
│  │ ▸ เมื่อการ์ดถูกลากออกจาก  [ ทุกสถานะ ▾ ]   โดย [ ทุกคน ▾ ]             │    │
│  │ ▸ เมื่อการ์ดถูกมอบหมายให้ [ ทุกคน ▾ ]                                   │    │
│  │ ▸ เมื่อการ์ดถูกถอดมอบหมายจาก [ ทุกคน ▾ ]                               │    │
│  └───────────────────────────────────────────────────────────────────────────┘    │
│                                                                                   │
│  [+ เพิ่มเงื่อนไข]  ← เพิ่ม "เงื่อนไขย่อย" บนเหตุการณ์ข้างบน (ไม่ใช่เหตุการณ์ใหม่) │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**กฎการตั้งชื่อแท็บ (สำคัญ — ชื่อต้องบอกว่าข้างในมีอะไร)**

| เดิม (กำกวม) | ใหม่ (ชัด) | ข้างในมี |
|-----------|-----------|---------|
| การเคลื่อนการ์ด | **ย้าย & มอบหมายการ์ด** | ลากไปสถานะ · ลากออกจากสถานะ · มอบหมายให้ · ถอดมอบหมาย |
| สร้าง · แก้ไข · ลบการ์ด | **สร้าง · แก้ไข · ลบการ์ด** | สร้างใหม่ · แก้ไข · เปลี่ยนความสำคัญ · ลบ · กู้คืน |
| คอมเมนต์ & ไฟล์แนบ | **คอมเมนต์ & ไฟล์แนบ** | มีคอมเมนต์ใหม่ · มีไฟล์ถูกแนบ |
| การจับเวลา | **จับเวลา** | เริ่มจับเวลา · หยุดจับเวลา |

**กฎ "1 เหตุการณ์ต่อกฎ"**
- `rules.trigger_key` เก็บได้ค่าเดียว → 1 กฎ = 1 เหตุการณ์ + เงื่อนไขย่อยหลายข้อ
- ครอบคลุมกรณี "ลากไป Doing **และ** เป็นของ admin" ได้ครบอยู่แล้ว
- ค่า **"ทุกสถานะ / ทุกคน" = ไม่กรอง** → ไม่สร้างเงื่อนไขในบรรทัดนั้น

**โหมดขั้นสูง** (เปิดสวิตช์ → แสดงเป็นตาราง)

```
┌──────────────────────┬───────────┬──────────────────┐
│ ฟิลด์                 │ เงื่อนไข   │ ค่า              │
├──────────────────────┼───────────┼──────────────────┤
│ สถานะปลายทาง   [▼]   │     =     │ Doing        [▼] │
│ บทบาทผู้ทำ     [▼]   │    in     │ admin, pm    [▼] │
│ [+ เพิ่มเงื่อนไข]       │           │                  │
└──────────────────────┴───────────┴──────────────────┘
```

- ฟิลด์/ค่าที่ให้เลือก **กรองตามเหตุการณ์ที่เลือกไว้** (ไม่ใช่ทั้ง 25 field)
- ปุ่ม "บันทึกกฎ" **ปิด** จนกว่าจะผ่าน validation ทุกขั้น
- ไม่มีปุ่ม `+` ท้ายแถว (ซ้ำกับ `+ เพิ่มเงื่อนไข` ข้างล่าง) — ใช้ปุ่มข้างล่างจุดเดียว

**ตัวอย่างการเก็บข้อมูล**

เลือก **"เมื่อการ์ดถูกลากไปยัง [Doing]"**

```
rules
  trigger_key  = "issue.moved"
  template_key = "moved_to"
  category     = "card_move"

rule_conditions
  { field: "to_status",  operator: "=", value: "3" }         ← จากช่อง [Doing]
  { field: "actor_role", operator: "=", value: "admin" }      ← จากช่อง [ทุกคน] (ถ้าเลือก)
```

#### ขั้นที่ ② เลือกการกระทำ

```
┌──────────────────────────────────────────────────────────────────┐
│  เลือกการกระทำ                                                     │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 🔒 ล็อกการ์ด                                                 │ │
│  │   ล็อกการ์ดนี้เพื่อไม่ให้แก้ไขหรือลากย้าย                   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 🔓 ปลดล็อกการ์ด                                              │ │
│  │   ปลดล็อกการ์ดที่ถูกล็อกอยู่                                 │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 🚫 ห้ามทำรายการนี้                                           │ │
│  │   เหตุผล: [ ต้องให้ลูกค้าอนุมัติก่อน            ]            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 🔔 แจ้งเตือน                                                │ │
│  │   ส่งให้: [ ผู้รับหมายงาน ▼ ]                               │ │
│  │   ข้อความ: [ มีคอมเมนต์ใหม่                   ]             │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

#### ขั้นที่ ③ ตรวจและบันทึก

```
┌──────────────────────────────────────────────────────────────────┐
│  ตรวจสอบก่อนบันทึก                                                  │
│  เมื่อการ์ดถูกลากไปยัง Doing                                        │
│  แล้ว ล็อกการ์ด                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ 🧪 ทดสอบกฎ — ลองกับการ์ดตัวอย่าง                             │ │
│  │   → กฎนี้จะทำงาน ✓ เงื่อนไขผ่านทั้งหมด         [ ทดสอบ ]    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  Priority [5]   ☑ เปิดใช้งาน                                        │
│  [ยกเลิก]  [บันทึกกฎ]                                              │
└──────────────────────────────────────────────────────────────────┘
```

### 9.3 ไฟล์ UI ที่ต้องสร้าง / แก้ไข

```
+ apps/web/src/app/[locale]/settings/rules/page.tsx           ★ หน้ารายการกฎ
+ apps/web/src/app/[locale]/settings/rules/new/page.tsx       ★ wizard (สร้างใหม่)
+ apps/web/src/app/[locale]/settings/rules/[id]/edit/page.tsx ★ wizard (แก้ไข)
+ apps/web/src/app/[locale]/settings/rules/runs/page.tsx      ★ ประวัติการทำงาน

+ apps/web/src/components/rules/rule-wizard.tsx          ★ wizard 3 ขั้นตอน
+ apps/web/src/components/rules/trigger-picker.tsx       ★ แท็บหมวด + ประโยค + ปุ่ม +
+ apps/web/src/components/rules/action-picker.tsx        ★ การ์ด action + ช่อง param
+ apps/web/src/components/rules/advanced-conditions.tsx  ★ field/operator/value
+ apps/web/src/components/rules/rule-list.tsx            ★ รายการกฎ
+ apps/web/src/components/rules/rule-run-history.tsx     ★ ประวัติจาก rule_runs
+ apps/web/src/lib/rules-api.ts                          ★ fetch wrapper

+ apps/web/src/components/notifications/notification-bell.tsx  ★ กระดิ่ง + dropdown + badge
✎ apps/web/src/components/dashboard/navbar.tsx                 ★ แทรก <NotificationBell/>

✎ apps/web/src/app/[locale]/settings/page.tsx   ★ ปุ่ม ⚡ กฎอัตโนมัติ + สวิตช์ล็อกใน dialog แก้ไขสถานะ
✎ apps/web/src/app/[locale]/boards/page.tsx    ★ 🔒 บนหัวคอลัมน์ + ปุ่มจับเวลา + chip เวลา
✎ apps/web/src/app/[locale]/users/page.tsx     ★ เพิ่ม permission code 2 ตัวใน PERMISSION_GROUPS

+ apps/web/src/components/timer/timer-button.tsx  ★ ปุ่ม "จับเวลา"
✎ apps/web/src/messages/{th,en}.json            ★ namespace "rules", "timer", "notifications"
```

### 9.4 กระดิ่งแจ้งเตือนใน navbar

```
┌─────────────────────────────┐
│  🔔 (3)          ผู้ใช้ ▾   │
└─────────────────────────────┘
      │
      ▼
┌─────────────────────────────┐
│ 🔔 การแจ้งเตือน      อ่านทั้งหมด │
├─────────────────────────────┤
│ ● มีคอมเมนต์ใหม่            │
│   การ์ด #12 · 5 นาทีที่แล้ว   │
│ ○ การ์ดถูกล็อก              │
│   การ์ด #15 · 1 ชั่วโมงที่แล้ว │
└─────────────────────────────┘
```

---

## 10. สิทธิ์ (Permissions)

### 10.1 ตารางสิทธิ์ที่ต้องเพิ่ม

| ที่ | สิ่งที่เพิ่ม |
|----|------------|
| `packages/shared/src/permissions.ts` → `Permission` | `"issue.unlock"`, `"board.column.unlock"` |
| → `ALL_PERMISSIONS` | **ต้องเพิ่มด้วย** |
| → `PERMISSION_LABELS` | ป้ายภาษาไทย |
| → `ROLE_PERMISSIONS.programmer` | เพิ่ม 2 code |
| `apps/web/src/app/[locale]/users/page.tsx` → `PERMISSION_GROUPS` | เพิ่ม 2 code |
| SQL migration | `INSERT ... ON CONFLICT (role_id, permission) DO NOTHING` |

> ⚠️ **สำคัญ:** ถ้าไม่เพิ่มใน `ALL_PERMISSIONS` เมื่อแอดมินกดบันทึกตารางสิทธิ์
> `PermissionsService.updateMatrix()` จะ **ลบ grant ทั้งหมดแล้ว insert ใหม่เฉพาะที่อยู่ในรายการ**
> → grant ทั้งหมดของ `issue.unlock` / `board.column.unlock` จะหายทันที

### 10.2 นิยามสิทธิ์ที่เพิ่ม

| Code | ความหมาย |
|------|----------|
| `issue.unlock` | ปลดล็อกการ์ดที่ถูกล็อก |
| `board.column.unlock` | ปลดล็อกคอลัมน์ (และเปิด/ปิดการล็อกคอลัมน์) |

---

## 11. Migration Runner

### 11.1 ปัญหาปัจจุบัน

- `apps/api/run-migration.ts` — hardcode แค่ `0001`, `0002`
- `package.json` → `"migration:run": "dist/data-source.js"` — ไฟล์นี้ไม่มีอยู่ (`apps/api/src/data-source.ts` ไม่มี)
- ไฟล์ `.sql` ไม่ idempotent → `0001` fail ทันทีบน DB ปัจจุบัน
- DB ปัจจุบันไม่ตรงกับ migration files (บางไฟล์ไม่เคยถูก apply)

### 11.2 แนวทางใหม่ — Ledger-based

```
✎ apps/api/run-migration.ts     →  rewrite
✎ apps/api/package.json         →  "migration:run": "tsx run-migration.ts"
```

1. สร้างตาราง ledger:

```sql
CREATE TABLE IF NOT EXISTS sql_migrations (
  filename   VARCHAR(255) PRIMARY KEY,
  checksum   VARCHAR(64),
  applied_at TIMESTAMPTZ DEFAULT now()
);
```

2. อ่านไฟล์ `.sql` ทั้งหมดใน `apps/api/migrations/` เรียงตามชื่อ
3. ข้ามไฟล์ที่บันทึกใน ledger แล้ว
4. รันทีละไฟล์ใน transaction → บันทึกลง ledger
5. รองรับ `--baseline` → ทำเครื่องหมายว่าไฟล์ที่มีอยู่แล้วว่า applied
   (ใช้ตอน DB ปัจจุบันถูกต้องอยู่แล้ว ไม่ต้อง replay)

---

## 12. แผนงาน 4 เฟส + 10 commits

### 12.1 Phase 0 — ปุ่มล็อก/ปลดล็อกให้ใช้ได้จริง

**ไฟล์**
```
✎ apps/api/src/modules/issues/issues.controller.ts     เพิ่ม PUT lock / unlock
✎ apps/api/src/modules/issues/issues.service.ts         lock() / unlock() + enforce + toResponse
✎ apps/api/src/modules/issues/entities/issue.entity.ts เพิ่ม lockedAt/lockedBy/lockSource/lockReason
✎ packages/shared/src/permissions.ts                   เพิ่ม 2 permission code
✎ apps/web/src/app/[locale]/users/page.tsx             เพิ่ม PERMISSION_GROUPS
+ apps/api/migrations/0028-add-rule-engine.sql         ส่วน grant permission
```

**รายละเอียด**
- `PUT /issues/:id/lock` (`issue.lock`) · `PUT /issues/:id/unlock` (`issue.unlock`)
- `toResponse()` เพิ่ม `isLocked`, `lockedAt`, `lockedByName`, `lockReason`
- `move()` → `if (issue.isLocked) throw ForbiddenException(...)`
- เพิ่ม 2 permission code ใน `Permission` / **`ALL_PERMISSIONS`** / `PERMISSION_LABELS` / `ROLE_PERMISSIONS.programmer`
- SQL grant ให้ `programmer` ทั้ง 2 code

### 12.2 Phase 1 — ล็อกคอลัมน์ (เข้าได้ ห้ามออก)

| หัวข้อ | รายละเอียด |
|--------|------------|
| Entity | map `is_locked` ใน `IssueStatus` |
| API | `PATCH /issue-statuses/:id/lock` (`board.column.unlock`) |
| Enforce | `move()` → ถ้า `sourceStatus.isLocked` → 403 `"ไม่สามารถลากออกจากคอลัมน์ที่ล็อกได้"` |
| UI (ตั้งค่า) | **สวิตช์ "ล็อกคอลัมน์นี้" ใน Dialog "แก้ไขสถานะ"** (ช่องว่างที่ `settings/page.tsx:1164-1166`) |
| UI (บอร์ด) | 🔒 บนหัวคอลัมน์ใน `/boards` + tooltip "ลากออกไม่ได้" |
| Migration | ต้อง reset `issue_statuses.is_locked = false` (สถานะ `done` ถูกล็อกค้างจาก migration เก่า และมีการ์ดค้าง 3 ใบ) |

**Dialog "แก้ไขสถานะ" หลังเพิ่มสวิตช์**

```
┌────────────────────────────────────────────┐
│  แก้ไขสถานะ                            [×] │
├────────────────────────────────────────────┤
│  ชื่อ      [ Doing                 ]      │
│  รายละเอียด [ งานที่กำลังทำ         ]      │
│                                            │
│  ┌────────────────────────────────────────┐ │
│  │ ☑ ล็อกคอลัมน์นี้                        │ │
│  │   การ์ดเข้าคอลัมน์นี้ได้ แต่ลากออกไม่ได้ │ │
│  └────────────────────────────────────────┘ │
│                                            │
│           [ยกเลิก]  [บันทึก]               │
└────────────────────────────────────────────┘
```

> หมายเหตุ: `statusForm.timerEnabled` ถูกเก็บใน state และส่งไป API อยู่แล้ว
> (`settings/page.tsx:330, 525, 537`) แต่ **ไม่มี UI** — ช่องว่างนี้เหลือจากการลบไป
> ระหว่างทาง สามารถเพิ่มสวิตช์ "จับเวลาได้ในสถานะนี้" ในช่องเดียวกันได้ (Phase 2)

### 12.3 Phase 2 — Timer UI (API พร้อมแล้ว แต่ไม่เคยมี UI)

```
+ apps/web/src/components/timer/timer-button.tsx   ★ ปุ่ม "จับเวลา"
✎ apps/web/src/app/[locale]/boards/page.tsx        ★ แท็บ "จับเวลา" ใน IssueDetailDialog
✎ apps/web/src/app/[locale]/boards/page.tsx        ★ chip เวลาที่จับใน TrelloCardContent
✎ apps/web/src/messages/{th,en}.json              ★ namespace "timer"
```

- เคารพ `status.timerEnabled` — ปุ่มจับเวลาโชว์เฉพาะสถานะที่เปิดไว้
- ปัจจุบัน `timer_enabled = false` ทุกสถานะ → ต้องเปิดให้ `Doing`

### 12.4 Phase 3 — Rule Engine

```
+ packages/shared/src/rules.ts               ★ registry (หมวด / trigger / template / action / field / operator)
✎ packages/shared/src/index.ts               ★ export rules

+ apps/api/src/modules/rules/rule.entity.ts
+ apps/api/src/modules/rules/rule-condition.entity.ts
+ apps/api/src/modules/rules/rule-run.entity.ts
+ apps/api/src/modules/rules/rules.service.ts       ★ CRUD + cache + dispatch
+ apps/api/src/modules/rules/rules.matcher.ts       ★ pure matcher (เรียก evaluateCondition จาก shared)
+ apps/api/src/modules/rules/rules.validator.ts     ★ validate rule ก่อนบันทึก/ก่อนเปิดใช้งาน
+ apps/api/src/modules/rules/rules.executor.ts     ★ สั่ง action + เขียน rule_runs
+ apps/api/src/modules/rules/rules.controller.ts   ★ REST + simulate
+ apps/api/src/modules/rules/rules.module.ts

+ apps/api/src/modules/notifications/notifications.service.ts
+ apps/api/src/modules/notifications/notifications.controller.ts

+ apps/api/migrations/0028-add-rule-engine.sql   ★ 3 ตาราง + 2 คอลัมน์ + index
                                                  ★ reset is_locked + grant permission
                                                  ★ notifications.issue_id → NULLABLE
```

### 12.5 ลำดับ 10 commits

```
1.  fix(api): add issue lock/unlock endpoints and enforce locked cards
2.  fix(api): sync unlock permissions between shared package and database
3.  feat(api): add column lock toggle for issue statuses
4.  feat(web): add manual timer UI and tracked time on cards
5.  feat(shared): add rule registry with categories, triggers, templates and actions
6.  feat(api): add rule engine with generalized conditions and execution log
7.  feat(api): add notifications service and unread count endpoint
8.  feat(web): add rules pages with template picker and advanced conditions
9.  feat(web): add notification bell to navbar
10. chore(api): make sql migration runner ledger-based
```

**ก่อน commit แต่ละครั้ง:** `npm run lint` + `npm run typecheck`
(`npm test` ใช้ไม่ได้ — ไม่มี jest config และไม่มีไฟล์เทสต์)

---

## 13. ความเสี่ยง

| ความเสี่ยง | การรับมือ |
|-----------|-----------|
| กฎ `block` ผิด → ทีมลากการ์ดไม่ได้ | dry-run ในขั้น ③ + toggle เปิด/ปิด + 403 พร้อมเหตุผล |
| กฎ `issue.lock` ผิด → ล็อกการ์ดเป็นร้อยใบ | dry-run + ปลดล็อกมือได้ทุกใบ + `lock_source` บอกว่าล็อกโดยกฎ |
| กฎวนไม่จบ | ไม่มี chaining + action ไม่ยิง trigger |
| action หนึ่งพังแล้วรายการหลักพัง | error isolation + ไม่ rollback |
| สิทธิ์ unlock หายเมื่อแอดมินบันทึกตารางสิทธิ์ | เพิ่มใน `ALL_PERMISSIONS` |
| `timer_enabled` = false ทุกสถานะ | ต้องเปิดให้ `Doing` |
| ไฟล์ `.sql` ไม่ idempotent | runner ledger-based + `--baseline` |
| คำว่า `trigger` เป็นคำสงวน | ใช้คอลัมน์ `trigger_key` |
| กฎเดิมค้างจากสถานะ `done` ที่ถูกล็อก | migration reset `is_locked = false` + ปลดล็อกการ์ด 3 ใบที่ค้าง |
| registry เปลี่ยนแล้วกฎเก่าพัง | ตรวจ registry ตอนอ่านกฎ → ข้าม + ทำเครื่องหมาย `invalid` (ไม่ crash) |
| 2 คนแก้กฎพร้อมกันแล้วข้อมูลหาย | optimistic locking ด้วย `updatedAt` → 409 Conflict |
| `notifications.issue_id` เป็น `NOT NULL` | ALTER เป็น NULLABLE ใน migration เดียวกัน |
| `action_config` JSONB ข้อมูลขยะ | registry มี `configSchema` → validate ก่อนเขียน |

---

## 14. ขอบเขตที่ไม่ทำ

| สิ่ง | เหตุผล |
|------|--------|
| Timer action (จับเวลาอัตโนมัติ) | ยังไม่มี scheduler และยังไม่อยู่ใน 4 action ที่เลือก |
| Scheduler / `@nestjs/schedule` | ยังไม่มี due date และ trigger เป็น event-based เท่านั้น |
| Trigger แบบเวลา (ถึง deadline, ไม่มี activity นาน) | ต้องมี scheduler ก่อน |
| `boards` table / board CRUD / board selector | โปรเจกต์เป็น **บอร์ดเดียว** (ตาม `AGENTS.md`) |
| เงื่อนไขนับจำนวน ("มีการ์ด 1 ใบในคอลัมน์") | Trello มี แต่เรายังไม่มี — เพิ่มทีหลังได้ |
| Card buttons (ปุ่มบนการ์ด) | ยังไม่มีฟีเจอร์ปุ่มบนการ์ด |
| Permission `rule.*` ใหม่ | ใช้ `permission.update` ตามที่ตกลง |
| ตาราง `rule_folders` / sidebar ซ้าย | ไม่มี sidebar ตามที่ตกลง — ใช้ dropdown filter ด้านบน |
| หน้า `/rules` แยก (ระดับ top-level) | อยู่ใต้ `/settings/rules` — ไม่เพิ่มรายการในเมนูซ้าย |
| Sidebar ในหน้ากฎ | ใช้แถบ filter แทน (ตามที่ตกลงว่าไม่ต้องมี sidebar) |

---

## 15. การตัดสินใจที่ตกลงแล้ว

| หัวข้อ | การตัดสินใจ |
|--------|-------------|
| UI หน้ากฎ | ปุ่ม **"⚡ กฎอัตโนมัติ"** ข้างๆ "+ เพิ่มสถานะ" ในหน้า `/settings` → แท็บ "สถานะ" |
| Route หน้ากฎ | `/settings/rules` (รายการ) · `/settings/rules/new` · `/settings/rules/[id]/edit` · `/settings/rules/runs` — **หน้าเต็มแบบ Trello** |
| เมนูซ้าย | ไม่เพิ่มรายการ (เข้าผ่านปุ่ม ⚡ เท่านั้น) |
| Sidebar ในหน้ากฎ | ❌ ไม่มี → ใช้แถบ filter แทน (ต่างจาก Trello โดยตั้งใจ) |
| ประวัติการทำงาน | หน้าแยก `/settings/rules/runs` (ไม่ซ้อน Dialog) |
| ตั้งค่าล็อกคอลัมน์ | สวิตช์ "ล็อกคอลัมน์นี้" ใน Dialog "แก้ไขสถานะ" (ไม่ใช่ไอคอนในแถว) |
| Matcher | **pure function** ใน `packages/shared` — ดึงค่าจาก `field.contextKey` → เพิ่ม field/trigger ใหม่ = แก้ registry อย่างเดียว |
| Template resolution | ย้ายเข้า `packages/shared` (`resolveTemplate`) → web สร้าง / api validate ใช้ตัวเดียวกัน |
| Engine contract | แยก `assertAllowed()` (pre-check) กับ `dispatch()` (post-execute) → action `block` ทำงานหลังรายการไม่ได้ |
| Validation | ตรวจทุกกฎตอนบันทึก **และ** ตอนเปิดใช้งาน → 400 พร้อม error ราย field |
| Action config | registry มี `configSchema` → ตรวจ JSONB ก่อนบันทึก |
| Concurrent edit | optimistic locking ด้วย `updatedAt` → 409 Conflict |
| Placeholder | ข้อความ/เหตุผลรองรับ `{actor}`, `{status}`, `{issue}` → resolve จาก context |
| `notifications.issue_id` | เปลี่ยนเป็น NULLABLE (เดิม `NOT NULL` → กฎแจ้งเตือนที่ไม่ผูกกับการ์ดใส่ไม่ได้) |
| Registry drift | กฎที่อ้าง trigger/action ที่ถูกลบจาก registry → ข้าม + ทำเครื่องหมาย `invalid` (ไม่ crash) |
| Sidebar | ❌ ไม่มี → dropdown filter ด้านบน |
| รูปแบบเงื่อนไข | โหมดประโยค (default) + สวิตช์ Advanced (default = ปิด) |
| Wizard | 3 ขั้น: **① เลือกเหตุการณ์** → ② เลือกการกระทำ → ③ ตรวจและบันทึก (ชื่อขั้นตรงกับ Trello "Select trigger") |
| ชื่อแท็บหมวด | ต้องบอกว่าข้างในมีอะไร: `ย้าย & มอบหมายการ์ด` · `สร้าง · แก้ไข · ลบการ์ด` · `คอมเมนต์ & ไฟล์แนบ` · `จับเวลา` |
| เหตุการณ์ต่อกฎ | 1 เหตุการณ์ต่อกฎ (`rules.trigger_key` เก็บได้ค่าเดียว) + เงื่อนไขย่อยหลายข้อ |
| ค่า "ทุกสถานะ / ทุกคน" | = ไม่กรอง → ไม่สร้างเงื่อนไขในบรรทัดนั้น |
| ปุ่ม `+` ท้ายแถว | ไม่มี (ซ้ำกับ `+ เพิ่มเงื่อนไข` ข้างล่าง) |
| Action | 4 ตัว: `issue.lock`, `issue.unlock`, `notify`, `block` |
| Trigger | 13 ตัวใน registry (เปิดใช้ MVP 5 ตัว) + 4 หมวด |
| Trigger ที่เปิดใช้ใน MVP | `issue.created` · `issue.assigned` · `issue.moved` · `comment.created` · `attachment.created` |
| `issue.updated` | ❌ **ตัดออก** — กว้างเกินจนเขียนกฎไม่ได้ → แตกเป็น `title_changed` / `description_changed` / `priority_changed` / `category_changed` (เฟส 2) |
| Field ของ trigger | ประกาศ **ต่อ trigger** (`RULE_TRIGGERS[].fields`) ไม่ใช่ตาราง global → เพิ่ม trigger = แก้ registry อย่างเดียว |
| ชนิด field → operator | ตารางร่วม `RULE_FIELD_TYPES` (9 ชนิด) → matcher เช็ค operator ให้อัตโนมัติ |
| Permission บริหารกฎ | `permission.update` (ไม่เพิ่มใหม่) |
| Blocking rule | pre-check → HTTP 403 + เหตุผล ก่อนทำรายการ |
| Dry-run | ✅ มี `POST /rules/simulate` ในขั้นที่ ③ |
| Notification | ระดับ B — กระดิ่ง 🔔 + dropdown + badge ใน navbar |
| Trigger | event-based เท่านั้น ไม่มี scheduler |
| Timer | action ไม่ทำ / UI (จับเวลา) ทำ |
| ประวัติการทำงาน | ตาราง `rule_runs` + UI ในแท็บกฎ |
| Chaining | ไม่มี |
| Error isolation | มี — ไม่ rollback รายการหลัก |
| Cache | `Map<trigger, Rule[]>` refresh ทุก CRUD |
| Module coupling | RulesService ใช้ repository ตรง ไม่ import IssuesModule |
| โครงสร้างข้อมูล | 3 ตาราง + 2 คอลัมน์ (`template_key`, `category`) + `action_config` เป็น JSONB |
| การ migrate | runner แบบ ledger + รองรับ `--baseline` |

---

## 16. หมายเหตุเรื่อง working tree

มีงานที่ **ยังไม่ commit** อยู่ใน tree อยู่แล้ว (ไม่ใช่ของงานนี้):

```
M apps/api/src/modules/comments/comments.service.ts
M apps/api/src/modules/issues/issues.controller.ts
M apps/api/src/modules/issues/issues.service.ts
M apps/web/src/app/[locale]/boards/page.tsx
M apps/web/src/app/[locale]/settings/page.tsx
M apps/web/src/lib/board-api.ts
M apps/web/src/lib/theme.ts
M apps/web/src/messages/en.json
M apps/web/src/messages/th.json
M docs/triggers-and-actions.md
```

- commit ล่าสุด = `810b34e`
- เมื่อเริ่ม commit 1 ต้องระวัง **ไม่ให้กินงานเหล่านี้** — ใช้ `git add` เฉพาะไฟล์ที่เกี่ยวกับ Phase 0
- `docs/triggers-and-actions.md` เป็นไฟล์เดียวที่จะถูกแก้ในงานนี้ (เอกสารนี้)

---

## 17. ขั้นตอนถัดไป

เริ่ม **Phase 0 / Commit 1**:

```
fix(api): add issue lock/unlock endpoints and enforce locked cards
```

- เพิ่ม `PUT /issues/:id/lock` · `PUT /issues/:id/unlock`
- `toResponse()` เพิ่ม `isLocked`, `lockedAt`, `lockedByName`, `lockReason`
- `move()` throw 403 เมื่อการ์ดถูกล็อก
- entity เพิ่ม `lockedAt`, `lockedBy`, `lockSource`, `lockReason`
