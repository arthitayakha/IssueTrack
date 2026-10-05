# Agent Guidelines — Kanban Issue Tracker

## ข้อมูลโปรเจกต์

- **Frontend:** Next.js (App Router) + MUI + TanStack Query + Zustand
- **Backend:** NestJS + TypeORM + class-validator
- **Database:** PostgreSQL
- **Auth:** JWT (access + refresh token) + bcrypt
- **Monorepo:** pnpm + Turborepo
- **Package Manager:** pnpm

## โครงสร้างโปรเจกต์

```
kanban-tracker/
├── apps/
│   ├── web/                 # Next.js frontend
│   └── api/                 # NestJS backend
├── packages/
│   └── shared/              # Shared types, DTOs
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## กฎการเขียนโค้ด

### TypeScript
- ใช้ strict mode เสมอ
- หลีกเลี่ยง `any` — ใช้ `unknown` แล้ว narrow type
- ใช้ `interface` สำหรับ object types, `type` สำหรับ unions/intersections

### Frontend (Next.js)
- ใช้ App Router (ไม่ใช้ Pages Router)
- Server Components เป็นค่าเริ่มต้น ใช้ Client Components เฉพาะที่ต้องใช้ interactivity
- ใช้ MUI components เป็นหลัก — หลีกเลี่ยงการสร้าง UI component ที่มีอยู่แล้ว
- ใช้ TanStack Query สำหรับ server state
- ใช้ Zustand สำหรับ client state (auth, UI)
- ใช้ @dnd-kit สำหรับ drag & drop

### Backend (NestJS)
- แยกเป็น modules ตาม feature (auth, boards, columns, issues, comments, labels)
- ใช้ DTOs + class-validator สำหรับ validation
- ใช้ Guards สำหรับ authentication/authorization
- ใช้ Interceptors สำหรับ response transformation
- ใช้ Exception Filters สำหรับ error handling

### Database
- ใช้ TypeORM entities
- ใช้ migrations สำหรับ schema changes (หลีกเลี่ยการใช้ synchronize: true ใน production)
- ใช้ UUID เป็น primary key
- ใช้ timestamps (created_at, updated_at) ทุกตาราง

## Naming Conventions

| ประเภท | Convention | ตัวอย่าง |
|---------|-----------|----------|
| Components | PascalCase | `IssueCard.tsx` |
| Functions/Variables | camelCase | `fetchIssues()` |
| Files/Folders | kebab-case | `issue-card.tsx` |
| Constants | UPPER_SNAKE_CASE | `API_BASE_URL` |
| Classes | PascalCase | `IssueService` |
| Interfaces | PascalCase | `IssueEntity` |
| Enums | PascalCase | `IssueStatus` |

## Git Workflow

- **Branches:** main, develop, feature/*
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`)
- **PR:** ต้องผ่าน lint, typecheck, build ก่อน merge

## คำสั่งที่ใช้บ่อย

```bash
# Install dependencies
pnpm install

# Run development (ทั้ง web + api)
pnpm dev

# Run specific app
pnpm --filter web dev
pnpm --filter api dev

# Lint
pnpm lint

# Type check
pnpm typecheck

# Build
pnpm build

# Test
pnpm test

# Database migrations
pnpm --filter api migration:run
pnpm --filter api migration:generate
```

## หมายเหตุ

- อ่าน design.md ก่อนเริ่มทำงาน
- ใช้ pnpm เท่านั้น (ไม่ใช้ npm หรือ yarn)
- ต้องรัน lint และ typecheck ก่อน commit
- หลีกเลี่ยการ hardcode — ใช้ environment variables
