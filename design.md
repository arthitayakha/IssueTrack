# Kanban Issue Tracker — Design Document

## 1. ภาพรวมโปรเจกต์

**ชื่อโปรเจกต์:** Kanban Issue Tracker

**วัตถุประสงค์:** ระบบติดตามงานแบบ Kanban board สำหรับทีมพัฒนา รองรับการสร้าง board, column, issue และ drag & drop เพื่อจัดการงาน

**กลุ่มผู้ใช้:** ทีมพัฒนา, ผู้จัดการโปรเจกต์

**ฟีเจอร์หลัก:**
- ระบบสมัครสมาชิก/เข้าสู่ระบบ
- สร้างและจัดการ boards
- สร้างและจัดการ columns ใน board
- สร้าง แก้ไข ลบ issues
- Drag & drop issues ระหว่าง columns
- กำหนด assignee, priority, due date, labels
- ระบบ comments ใน issue

---

## 2. สถาปัตยกรรมระบบ

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Next.js       │────▶│   NestJS API    │────▶│  PostgreSQL │
│   (Frontend)    │◀────│   (Backend)     │◀────│  (Database) │
│   + MUI         │     │   + TypeORM     │     │             │
└─────────────────┘     └─────────────────┘     └─────────────┘
```

- **Frontend:** Next.js (App Router) + MUI (Material-UI) + TanStack Query
- **Backend:** NestJS + TypeORM + class-validator
- **Database:** PostgreSQL
- **Auth:** JWT (access token + refresh token) + bcrypt

---

## 3. Monorepo Structure

```
kanban-tracker/
├── apps/
│   ├── web/                     # Next.js frontend
│   │   ├── src/
│   │   │   ├── app/             # App Router pages
│   │   │   ├── components/      # MUI components
│   │   │   ├── hooks/           # Custom hooks
│   │   │   ├── services/        # API calls
│   │   │   ├── stores/          # State management
│   │   │   └── theme/           # MUI theme
│   │   ├── package.json
│   │   └── next.config.js
│   └── api/                     # NestJS backend
│       ├── src/
│       │   ├── modules/         # Feature modules
│       │   ├── common/          # Guards, interceptors, filters
│       │   ├── config/          # Configuration
│       │   └── database/        # Migrations, seeds
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   └── shared/                  # Shared types, DTOs
│       └── package.json
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```

**Package Manager:** pnpm
**Monorepo Tool:** Turborepo

---

## 4. Database Design (PostgreSQL)

### Tables

#### users
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| avatar | TEXT | |
| role | VARCHAR(50) | DEFAULT 'member' |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

#### boards
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| title | VARCHAR(255) | NOT NULL |
| description | TEXT | |
| owner_id | UUID | FK → users.id |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

#### columns
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| board_id | UUID | FK → boards.id, NOT NULL |
| title | VARCHAR(255) | NOT NULL |
| position | INTEGER | NOT NULL |
| created_at | TIMESTAMP | DEFAULT NOW() |

#### issues
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| column_id | UUID | FK → columns.id, NOT NULL |
| title | VARCHAR(255) | NOT NULL |
| description | TEXT | |
| status | VARCHAR(50) | DEFAULT 'todo' |
| priority | VARCHAR(50) | DEFAULT 'medium' |
| assignee_id | UUID | FK → users.id |
| reporter_id | UUID | FK → users.id |
| position | INTEGER | NOT NULL |
| due_date | TIMESTAMP | |
| created_at | TIMESTAMP | DEFAULT NOW() |
| updated_at | TIMESTAMP | DEFAULT NOW() |

#### comments
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| issue_id | UUID | FK → issues.id, NOT NULL |
| user_id | UUID | FK → users.id, NOT NULL |
| content | TEXT | NOT NULL |
| created_at | TIMESTAMP | DEFAULT NOW() |

#### labels
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| name | VARCHAR(100) | NOT NULL |
| color | VARCHAR(50) | NOT NULL |

#### issue_labels
| Column | Type | Constraints |
|--------|------|-------------|
| issue_id | UUID | FK → issues.id, PK |
| label_id | UUID | FK → labels.id, PK |

### Relationships
- `users` 1:N `boards` (owner)
- `boards` 1:N `columns`
- `columns` 1:N `issues`
- `users` 1:N `issues` (assignee, reporter)
- `issues` 1:N `comments`
- `users` 1:N `comments`
- `issues` N:M `labels` (via `issue_labels`)

---

## 5. API Design (REST Endpoints)

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | สมัครสมาชิก |
| POST | /auth/login | เข้าสู่ระบบ |
| POST | /auth/refresh | Refresh token |
| GET | /auth/me | ข้อมูลผู้ใช้ปัจจุบัน |

### Boards
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /boards | ดึง boards ทั้งหมด |
| POST | /boards | สร้าง board |
| GET | /boards/:id | ดึง board + columns + issues |
| PATCH | /boards/:id | แก้ไข board |
| DELETE | /boards/:id | ลบ board |

### Columns
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /columns | สร้าง column |
| PATCH | /columns/:id | แก้ไข column |
| DELETE | /columns/:id | ลบ column |
| PATCH | /columns/:id/reorder | เปลี่ยนลำดับ column |

### Issues
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /issues | สร้าง issue |
| PATCH | /issues/:id | แก้ไข issue |
| PATCH | /issues/:id/move | ย้าย issue (drag & drop) |
| DELETE | /issues/:id | ลบ issue |

### Comments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /issues/:id/comments | เพิ่ม comment |
| DELETE | /comments/:id | ลบ comment |

### Labels
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /labels | ดึง labels ทั้งหมด |
| POST | /labels | สร้าง label |

### Request/Response Format
```json
// Success Response
{
  "success": true,
  "data": { ... }
}

// Error Response
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [ ... ]
  }
}
```

---

## 6. Auth & Security

- **Password Hashing:** bcrypt (salt rounds: 12)
- **Token:** JWT access token (expires: 15m) + refresh token (expires: 7d)
- **RBAC Roles:** Admin, Member
- **Guards:**
  - `JwtAuthGuard` — ตรวจสอบ authentication
  - `RolesGuard` — ตรวจสอบ authorization
- **Validation:** class-validator + class-transformer (DTOs)
- **CORS:** กำหนด allowed origins
- **Rate Limiting:** @nestjs/throttler

---

## 7. Frontend Design (MUI)

### Theme
- Custom MUI theme ใน `apps/web/src/theme/`
- รองรับ light/dark mode
- Primary color: กำหนดเอง
- Typography: ฟอนต์ที่เหมาะสม
- Component overrides สำหรับ MUI components

### State Management
- **Server State:** TanStack Query (React Query)
- **Client State:** Zustand (auth, UI state)

### Drag & Drop
- ใช้ @dnd-kit/core + @dnd-kit/sortable

### Pages
| Path | Description |
|------|-------------|
| /login | หน้าเข้าสู่ระบบ |
| /register | หน้าสมัครสมาชิก |
| /boards | รายการ boards |
| /boards/[id] | Kanban board (columns + cards) |

### Components
- `Header` — top navigation bar
- `Sidebar` — navigation sidebar
- `Board` — แสดง columns ทั้งหมด
- `Column` — แสดง issues ใน column
- `IssueCard` — การ์ด issue
- `CreateIssueDialog` — modal สร้าง issue
- `EditIssueDialog` — modal แก้ไข issue
- `BoardHeader` — หัวข้อ board + actions

---

## 8. DevOps

### Local Development
- Docker Compose สำหรับ PostgreSQL
- คำสั่ง: `pnpm dev` (รันทั้ง web + api)

### Environment Variables (.env.example)
```
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=kanban_tracker

# JWT
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# App
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### CI/CD
- GitHub Actions: lint, typecheck, test, build
- Build Docker images สำหรับ production

---

## 9. Coding Standards

- **Language:** TypeScript (strict mode)
- **Linting:** ESLint + Prettier
- **Commits:** Conventional Commits
- **Naming:**
  - Components: PascalCase
  - Functions/variables: camelCase
  - Files: kebab-case
  - Constants: UPPER_SNAKE_CASE
- **Testing:**
  - Backend: Jest + Supertest
  - Frontend: Vitest + Testing Library
- **Git Flow:** main, develop, feature branches
