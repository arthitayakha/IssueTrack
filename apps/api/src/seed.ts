import "reflect-metadata";
import "dotenv/config";
import { DataSource } from "typeorm";
import { ALL_PERMISSIONS, permissionsForRole, ROLE_LABELS } from "@kanban/shared";
import { Role } from "./modules/roles/entities/role.entity";
import { RolePermission } from "./modules/permissions/entities/role-permission.entity";
import { User } from "./modules/auth/entities/user.entity";
import { Position } from "./modules/positions/position.entity";
import { PositionPermission } from "./modules/positions/entities/position-permission.entity";
import { IssueStatus } from "./modules/issue-statuses/entities/issue-status.entity";
import { Issue } from "./modules/issues/entities/issue.entity";
import { Category } from "./modules/categories/entities/category.entity";
import { Comment } from "./modules/comments/entities/comment.entity";
import { Attachment } from "./modules/attachments/entities/attachment.entity";
import { WorkSession } from "./modules/work-sessions/entities/work-session.entity";
import { IssuePriority } from "./modules/issue-priorities/entities/issue-priority.entity";
import { BoardColumn } from "./modules/columns/entities/board-column.entity";
import { Board } from "./modules/boards/entities/board.entity";
import { ActivityLog } from "./modules/activity-logs/entities/activity-log.entity";

const dataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST ?? "localhost",
  port: parseInt(process.env.DB_PORT ?? "5432"),
  username: process.env.DB_USER ?? "postgres",
  password: process.env.DB_PASSWORD ?? "1234",
  database: process.env.DB_NAME ?? "trackdb",
  entities: [
    Role,
    RolePermission,
    User,
    Position,
    PositionPermission,
    IssueStatus,
    Issue,
    Category,
    Comment,
    Attachment,
    WorkSession,
    IssuePriority,
    BoardColumn,
    Board,
    ActivityLog,
  ],
  synchronize: false,
});

async function seed() {
  await dataSource.initialize();
  const manager = dataSource.manager;

  const permissions = ALL_PERMISSIONS.map((code) => ({
    code,
    action: code,
    category: code.split(".")[0],
  }));

  for (const p of permissions) {
    await manager.query(
      `INSERT INTO permissions (code, action, category)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET action = $2, category = $3`,
      [p.code, p.action, p.category],
    );
  }

  const roleNames = Object.keys(ROLE_LABELS);
  for (const name of roleNames) {
    await manager.query(
      `INSERT INTO roles (name, is_active)
       VALUES ($1, true)
       ON CONFLICT (name) DO UPDATE SET is_active = true`,
      [name],
    );
  }

  const roles = await manager.query("SELECT id, name FROM roles");
  const roleMap = new Map<string, number>();
  for (const r of roles) {
    roleMap.set(r.name, r.id);
  }

  await manager.query("DELETE FROM role_permissions");

  for (const [name, perms] of Object.entries(permissionsForRole)) {
    const roleId = roleMap.get(name);
    if (!roleId) continue;
    for (const permission of perms) {
      await manager.query(
        `INSERT INTO role_permissions (role_id, permission)
         VALUES ($1, $2)
         ON CONFLICT (role_id, permission) DO NOTHING`,
        [roleId, permission],
      );
    }
  }

  const defaultPositions = [
    { name: "Frontend Developer", roleName: "programmer" },
    { name: "Backend Developer", roleName: "programmer" },
    { name: "QA", roleName: "programmer" },
  ];

  for (const pos of defaultPositions) {
    const roleId = roleMap.get(pos.roleName);
    if (!roleId) continue;

    await manager.query(
      `INSERT INTO positions (name, role_id, is_active)
       VALUES ($1, $2, true)
       ON CONFLICT (name) DO UPDATE SET role_id = $2, is_active = true
       RETURNING id`,
      [pos.name, roleId],
    );

    const inserted = await manager.query(
      `SELECT id FROM positions WHERE name = $1`,
      [pos.name],
    );
    const positionId = inserted[0]?.id;
    if (!positionId) continue;

    const rolePerms = permissionsForRole(pos.roleName);
    for (const permission of rolePerms) {
      await manager.query(
        `INSERT INTO position_permissions (position_id, permission)
         VALUES ($1, $2)
         ON CONFLICT (position_id, permission) DO NOTHING`,
        [positionId, permission],
      );
    }
  }

  console.log("Seed completed successfully");
  await dataSource.destroy();
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
