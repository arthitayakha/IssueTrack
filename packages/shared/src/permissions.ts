export type RoleName = "admin" | "programmer" | "customer";

export type Permission =
  | "auth.login"
  | "auth.logout"
  | "dashboard.own.view"
  | "dashboard.overview.view"
  | "issue.create"
  | "issue.own.view"
  | "issue.all.view"
  | "issue.assigned.view"
  | "issue.detail.view"
  | "issue.own.update"
  | "issue.all.update"
  | "issue.assign"
  | "issue.reassign"
  | "issue.status.update"
  | "issue.delete"
  | "issue.category.change"
  | "issue.priority.change"
  | "time.system.view"
  | "time.actual.view"
  | "comment.view"
  | "comment.create"
  | "comment.own.update"
  | "comment.own.delete"
  | "comment.all.delete"
  | "user.view"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "category.view"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "category.visibility.update"
  | "status.view"
  | "status.create"
  | "status.update"
  | "status.delete"
  | "priority.view"
  | "priority.create"
  | "priority.update"
  | "priority.delete"
  | "skill.view"
  | "skill.create"
  | "skill.update"
  | "skill.delete"
  | "report.view"
  | "report.export"
  | "permission.view"
  | "permission.update"
  | "board.view"
  | "board.column.create"
  | "board.column.update"
  | "board.column.delete"
  | "position.view"
  | "position.create"
  | "position.update"
  | "position.delete"
  | "role.view"
  | "role.create"
  | "role.update"
  | "role.delete"
  | "role.permission.update";

export const ALL_PERMISSIONS: readonly Permission[] = [
  "auth.login",
  "auth.logout",
  "dashboard.own.view",
  "dashboard.overview.view",
  "issue.create",
  "issue.own.view",
  "issue.all.view",
  "issue.assigned.view",
  "issue.detail.view",
  "issue.own.update",
  "issue.all.update",
  "issue.assign",
  "issue.reassign",
  "issue.status.update",
  "issue.delete",
  "issue.category.change",
  "issue.priority.change",
  "time.system.view",
  "time.actual.view",
  "comment.view",
  "comment.create",
  "comment.own.update",
  "comment.own.delete",
  "comment.all.delete",
  "user.view",
  "user.create",
  "user.update",
  "user.delete",
  "category.view",
  "category.create",
  "category.update",
  "category.delete",
  "category.visibility.update",
  "status.view",
  "status.create",
  "status.update",
  "status.delete",
  "priority.view",
  "priority.create",
  "priority.update",
  "priority.delete",
  "skill.view",
  "skill.create",
  "skill.update",
  "skill.delete",
  "report.view",
  "report.export",
  "permission.view",
  "permission.update",
  "board.view",
  "board.column.create",
  "board.column.update",
  "board.column.delete",
  "position.view",
  "position.create",
  "position.update",
  "position.delete",
  "role.view",
  "role.create",
  "role.update",
  "role.delete",
  "role.permission.update",
];

export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  admin: ALL_PERMISSIONS,
  programmer: [
    "auth.login",
    "auth.logout",
    "dashboard.own.view",
    "dashboard.overview.view",
    "issue.create",
    "issue.own.view",
    "issue.all.view",
    "issue.assigned.view",
    "issue.detail.view",
    "issue.own.update",
    "issue.all.update",
    "issue.assign",
    "issue.reassign",
    "issue.status.update",
    "issue.delete",
    "issue.category.change",
    "issue.priority.change",
    "time.system.view",
    "time.actual.view",
    "comment.view",
    "comment.create",
    "comment.own.update",
    "comment.own.delete",
    "comment.all.delete",
    "category.view",
    "category.create",
    "category.update",
    "category.delete",
    "category.visibility.update",
    "status.view",
    "status.create",
    "status.update",
    "status.delete",
    "priority.view",
    "priority.create",
    "priority.update",
    "priority.delete",
    "skill.view",
    "skill.create",
    "skill.update",
    "skill.delete",
    "report.view",
    "report.export",
    "board.view",
    "board.column.create",
    "board.column.update",
    "board.column.delete",
    "position.view",
  ],
  customer: [
    "auth.login",
    "auth.logout",
    "dashboard.own.view",
    "issue.create",
    "issue.own.view",
    "issue.assigned.view",
    "issue.detail.view",
    "issue.own.update",
    "comment.view",
    "comment.create",
    "comment.own.update",
    "comment.own.delete",
    "category.view",
    "board.view",
    "board.column.create",
    "board.column.update",
    "board.column.delete",
  ],
};

export const ROLE_TEMPLATES: Record<string, readonly Permission[]> = {
  base: [
    "auth.login",
    "auth.logout",
    "dashboard.own.view",
  ],
  staff: [
    "auth.login",
    "auth.logout",
    "dashboard.own.view",
    "issue.create",
    "issue.all.view",
    "issue.assigned.view",
    "issue.detail.view",
    "issue.own.update",
    "comment.view",
    "comment.create",
    "comment.own.update",
    "category.view",
    "board.view",
  ],
  manager: [
    "auth.login",
    "auth.logout",
    "dashboard.own.view",
    "dashboard.overview.view",
    "issue.create",
    "issue.all.view",
    "issue.assigned.view",
    "issue.detail.view",
    "issue.own.update",
    "issue.all.update",
    "issue.assign",
    "issue.reassign",
    "issue.status.update",
    "issue.delete",
    "comment.view",
    "comment.create",
    "comment.own.update",
    "comment.own.delete",
    "comment.all.delete",
    "category.view",
    "board.view",
    "board.column.create",
    "board.column.update",
    "board.column.delete",
    "report.view",
    "report.export",
  ],
  admin: ALL_PERMISSIONS,
};

export const ROLE_LABELS: Record<string, string> = {
  admin: "แอดมิน",
  programmer: "โปรแกรมเมอร์",
  customer: "ลูกค้า",
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  "auth.login": "เข้าสู่ระบบ",
  "auth.logout": "ออกจากระบบ",
  "dashboard.own.view": "ดูแดชบอร์ดส่วนตัว",
  "dashboard.overview.view": "ดูภาพรวมแดชบอร์ด",
  "issue.create": "สร้างปัญหา",
  "issue.own.view": "ดูปัญหาของตัวเอง",
  "issue.all.view": "ดูปัญหาทั้งหมด",
  "issue.assigned.view": "ดูปัญหาที่ได้รับมอบหมาย",
  "issue.detail.view": "ดูรายละเอียดปัญหา",
  "issue.own.update": "แก้ไขปัญหาของตัวเอง",
  "issue.all.update": "แก้ไขปัญหาทั้งหมด",
  "issue.assign": "มอบหมายปัญหา",
  "issue.reassign": "มอบหมายปัญหาใหม่",
  "issue.status.update": "อัปเดตสถานะปัญหา",
  "issue.delete": "ลบปัญหา",
  "issue.category.change": "เปลี่ยนหมวดหมู่ปัญหา",
  "issue.priority.change": "เปลี่ยนความสำคัญปัญหา",
  "time.system.view": "ดูเวลาระบบ",
  "time.actual.view": "ดูเวลาจริง",
  "comment.view": "ดูความคิดเห็น",
  "comment.create": "สร้างความคิดเห็น",
  "comment.own.update": "แก้ไขความคิดเห็นของตัวเอง",
  "comment.own.delete": "ลบความคิดเห็นของตัวเอง",
  "comment.all.delete": "ลบความคิดเห็นทั้งหมด",
  "user.view": "ดูผู้ใช้",
  "user.create": "สร้างผู้ใช้",
  "user.update": "แก้ไขผู้ใช้",
  "user.delete": "ลบผู้ใช้",
  "category.view": "ดูหมวดหมู่",
  "category.create": "สร้างหมวดหมู่",
  "category.update": "แก้ไขหมวดหมู่",
  "category.visibility.update": "อัปเดตการมองเห็นหมวดหมู่",
  "category.delete": "ลบหมวดหมู่",
  "status.view": "ดูสถานะ",
  "status.create": "สร้างสถานะ",
  "status.update": "แก้ไขสถานะ",
  "status.delete": "ลบสถานะ",
  "priority.view": "ดูความสำคัญ",
  "priority.create": "สร้างความสำคัญ",
  "priority.update": "แก้ไขความสำคัญ",
  "priority.delete": "ลบความสำคัญ",
  "skill.view": "ดูทักษะ",
  "skill.create": "สร้างทักษะ",
  "skill.update": "แก้ไขทักษะ",
  "skill.delete": "ลบทักษะ",
  "report.view": "ดูรายงาน",
  "report.export": "ส่งออกรายงาน",
  "permission.view": "ดูสิทธิ์",
  "permission.update": "แก้ไขสิทธิ์",
  "board.view": "ดูบอร์ด",
  "board.column.create": "สร้างคอลัมน์ในบอร์ด",
  "board.column.update": "แก้ไขคอลัมน์ในบอร์ด",
  "board.column.delete": "ลบคอลัมน์ในบอร์ด",
  "position.view": "ดูตำแหน่ง",
  "position.create": "สร้างตำแหน่ง",
  "position.update": "แก้ไขตำแหน่ง",
  "position.delete": "ลบตำแหน่ง",
  "role.view": "ดูบทบาท",
  "role.create": "สร้างบทบาท",
  "role.update": "แก้ไขบทบาท",
  "role.delete": "ลบบทบาท",
  "role.permission.update": "แก้ไขสิทธิ์บทบาท",
};

export const POSITION_TEMPLATES: Record<string, readonly Permission[]> = {
  customer: ROLE_PERMISSIONS.customer,
  staff: ROLE_TEMPLATES.staff,
  manager: ROLE_TEMPLATES.manager,
};

export function permissionsForRole(role: string): readonly Permission[] {
  return ROLE_PERMISSIONS[role as RoleName] ?? ROLE_PERMISSIONS.customer;
}

export function roleHasPermission(role: string, permission: Permission): boolean {
  if (role === "admin") return true;
  return permissionsForRole(role).includes(permission);
}
