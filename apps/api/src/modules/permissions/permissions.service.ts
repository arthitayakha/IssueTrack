import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ALL_PERMISSIONS, permissionsForRole } from "@kanban/shared";
import type { Permission } from "@kanban/shared";
import { RolePermission } from "./entities/role-permission.entity";
import { PositionPermission } from "../positions/entities/position-permission.entity";
import { Role } from "../roles/entities/role.entity";

@Injectable()
export class PermissionsService implements OnModuleInit {
  constructor(
    @InjectRepository(RolePermission)
    private readonly repo: Repository<RolePermission>,
    @InjectRepository(PositionPermission)
    private readonly positionPermissions: Repository<PositionPermission>,
    @InjectRepository(Role)
    private readonly rolesRepo: Repository<Role>,
  ) {}

  private cache = new Map<number, Set<string>>();
  private positionCache = new Map<number, Set<string>>();

  async onModuleInit() {
    const dbRoles = await this.getRolesFromDb();
    const dbPermissions = await this.getPermissionsFromDb();
    const existing = await this.repo.find();
    const existingSet = new Set(existing.map((r) => `${r.roleId}:${r.permission}`));
    const rows: RolePermission[] = [];
    for (const role of dbRoles) {
      for (const permission of permissionsForRole(role.name)) {
        if (!dbPermissions.includes(permission)) continue;
        if (existingSet.has(`${role.id}:${permission}`)) continue;
        rows.push(this.repo.create({ roleId: role.id, permission }));
      }
    }
    if (rows.length > 0) {
      await this.repo.save(rows);
    }
    await this.refreshCache();
  }

  private async getRolesFromDb(): Promise<Role[]> {
    return this.rolesRepo.find({ where: { isActive: true } });
  }

  private async getPermissionsFromDb(): Promise<string[]> {
    const result = await this.repo.manager.query(
      "SELECT code FROM permissions ORDER BY id",
    );
    return result.map((r: { code: string }) => r.code);
  }

  async getMatrix() {
    const dbPermissions = await this.getPermissionsFromDb();
    const labels = await this.getPermissionLabels();
    const categories = await this.getPermissionCategories();
    const roles = await this.getRolesFromDb();

    const grants: Record<string, string[]> = {};
    for (const role of roles) grants[role.name] = [];
    for (const row of await this.repo.find()) {
      const role = roles.find((r) => r.id === row.roleId);
      if (!role) continue;
      if (!grants[role.name]) grants[role.name] = [];
      grants[role.name].push(row.permission);
    }

    return {
      roles: roles.map((r) => r.name),
      permissions: dbPermissions,
      labels,
      categories,
      grants,
    };
  }

  private async getPermissionLabels(): Promise<Record<string, string>> {
    const result = await this.repo.manager.query(
      "SELECT code, action FROM permissions",
    );
    const labels: Record<string, string> = {};
    for (const r of result) {
      labels[r.code] = r.action;
    }
    return labels;
  }

  private async getPermissionCategories(): Promise<Record<string, string[]>> {
    const result = await this.repo.manager.query(
      "SELECT category, code FROM permissions ORDER BY id",
    );
    const categories: Record<string, string[]> = {};
    for (const r of result) {
      if (!categories[r.category]) categories[r.category] = [];
      categories[r.category].push(r.code);
    }
    return categories;
  }

  /**
   * A position is the single source of truth for its members. When the user
   * has one, only `position_permissions` decides — the role is NOT unioned in,
   * so unticking a box in the position matrix really does revoke it. The role
   * is consulted only for users without a position — including admins: an
   * admin WITH a position is bound by that position's rows (no role union),
   * so unticking a box really revokes their access. The always-allow
   * short-circuit applies only to an admin who has no position at all.
   */
  async hasPermission(roleId: number | null, permission: string, positionId?: number | null): Promise<boolean> {
    if (roleId === null || roleId === undefined) return false;
    const role = await this.rolesRepo.findOne({ where: { id: roleId } });
    if (!role || !role.isActive) return false;

    // Position wins for everyone, admin included — check it before the
    // admin short-circuit so a position can never be bypassed.
    if (positionId) {
      const posPerm = await this.positionPermissions.findOne({ where: { positionId, permission } });
      return !!posPerm && !posPerm.denied;
    }

    if (role.name === "admin") return true;

    const rolePerm = await this.repo.findOne({ where: { roleId, permission } });
    return !!rolePerm;
  }

  /** Mirror of {@link hasPermission} for the whole set the frontend uses. */
  async getUserPermissions(roleId: number | null, positionId: number | null): Promise<string[]> {
    if (!roleId) return [];

    if (positionId) {
      const posPerms = await this.positionPermissions.find({ where: { positionId } });
      return [...new Set(posPerms.filter((p) => !p.denied).map((p) => p.permission))];
    }

    const adminRole = await this.rolesRepo.findOne({ where: { name: "admin" } });
    if (adminRole && roleId === adminRole.id) return [...ALL_PERMISSIONS];

    const rolePerms = await this.repo.find({ where: { roleId } });
    return [...new Set(rolePerms.map((p) => p.permission))];
  }

  async updateMatrix(grants: Record<string, string[]>) {
    try {
      /**
       * **ทุกขั้นอยู่ใน transaction เดียว** — เดิม `clear()` (ซึ่งจริง ๆ คือ
       * `TRUNCATE/DELETE ทั้งตาราง` — ดู `EntityManager.clear`) แล้วค่อย insert
       * ใหม่ **นอก transaction**: ถ้า fail กลางทาง (role lookup / save พัง)
       * ตาราง `role_permissions` จะว่าง/บางส่วน = **ทุกคนล็อก out ตัวเอง** ·
       * เทียบ `positions.updatePermissions` ที่ห่อ `dataSource.transaction`
       * ไว้แล้ว — ตอนนี้สองเส้นนี้เท่ากัน
       */
      await this.repo.manager.transaction(async (em) => {
        const rolePerms = em.getRepository(RolePermission);
        const roles = em.getRepository(Role);
        await rolePerms.clear();
        const rows: RolePermission[] = [];
        for (const [roleName, permissions] of Object.entries(grants)) {
          if (roleName === "admin") continue;
          const role = await roles.findOne({ where: { name: roleName } });
          if (!role) continue;
          for (const permission of permissions) {
            if (!ALL_PERMISSIONS.includes(permission as Permission)) continue;
            rows.push(rolePerms.create({ roleId: role.id, permission }));
          }
        }
        await rolePerms.save(rows);
      });
      await this.refreshCache();
    } catch (err) {
      console.error("updateMatrix error:", err);
      throw err;
    }
  }

  async resetToDefaults() {
    /**
     * เช่นเดียวกับ `updateMatrix` — `clear()` + insert ต้องอยู่ใน transaction
     * เดียว (เดิม fail กลางทาง = ตารางสิทธิ์ว่าง)
     */
    await this.repo.manager.transaction(async (em) => {
      const rolePerms = em.getRepository(RolePermission);
      await rolePerms.clear();
      const dbRoles = await this.getRolesFromDb();
      const dbPermissions = await this.getPermissionsFromDb();
      const rows: RolePermission[] = [];
      for (const role of dbRoles) {
        for (const permission of permissionsForRole(role.name)) {
          if (!dbPermissions.includes(permission)) continue;
          rows.push(rolePerms.create({ roleId: role.id, permission }));
        }
      }
      await rolePerms.save(rows);
    });
    await this.refreshCache();
  }

  async refreshCache() {
    this.cache.clear();
    for (const row of await this.repo.find()) {
      if (!this.cache.has(row.roleId)) this.cache.set(row.roleId, new Set());
      this.cache.get(row.roleId)!.add(row.permission);
    }
    this.positionCache.clear();
    for (const row of await this.positionPermissions.find()) {
      if (!this.positionCache.has(row.positionId)) this.positionCache.set(row.positionId, new Set());
      this.positionCache.get(row.positionId)!.add(row.permission);
    }
  }
}
