import { NotFoundException } from "@nestjs/common";
import type { Repository } from "typeorm";
import type { Issue } from "./entities/issue.entity";
import type { PermissionsService } from "../permissions/permissions.service";
import type { AuthUser } from "../auth/auth-user";

/**
 * **ขอบเขตการเข้าถึงงานรายใบ** — เกณฑ์เดียวกับที่ `GET /issues` (list) ใช้:
 * ถ้าผู้เรียกมี `issue.all.view` = เห็นทุกใบ มิฉะนั้นเห็นเฉพาะใบที่ตัวเองเป็น
 * ผู้รับผิดชอบ (`programmer_id`) หรือผู้แจ้ง (`customer_id`)
 *
 * **ทำไมต้องมี**: เดิมมีแค่ list ที่กรอบไว้ — เส้น detail ทั้ง家族
 * (`GET /issues/:id`, activity, comments, attachments) โหลดด้วย id ล้วน →
 * บทบาท `customer` (ซึ่งมี `issue.detail.view` / `comment.view` / `board.view`)
 * เดา id แล้วอ่าน/คอมเมนต์งานคนอื่นได้ (IDOR)
 *
 * **404 ไม่ใช่ 403**: ข้อความเดียวกับ "ไม่พบงาน" เป๊ะ — ผู้ไม่มีสิทธิ์จะแยก
 * ไม่ออกว่า id มีอยู่จริงหรือเปล่า (กันการ probe id ต่อเนื่อง)
 *
 * ใช้ร่วมกันทุกเส้น detail → list กับ detail จะไม่มีทางขัดกัน
 */

/** ข้อความเดียวกับ `IssuesService.findOne` — ผู้ไม่มีสิทธิ์แยก 404 สองแบบไม่ได้ */
export function issueNotFound(issueId: number): NotFoundException {
  return new NotFoundException(`Issue ${issueId} not found`);
}

/**
 * "เห็นงานทุกใบ" = มี `issue.all.view` — mirror ของ `GET /issues` (findAll)
 * ทุกประการรวม position whitelist (`getUserPermissions` บทบาท admin คืนทุกสิทธิ์)
 */
export async function canViewAllIssues(
  permissions: PermissionsService,
  user?: AuthUser | null,
): Promise<boolean> {
  if (!user) return true; // ตาม list เดิม — เป็นไปไม่ได้จริง (JwtAuthGuard ระดับแอป)
  const granted = await permissions.getUserPermissions(user.roleId, user.positionId);
  return granted.includes("issue.all.view");
}

/**
 * เช็คบนแถวที่โหลดมาแล้ว — throw 404 เมื่อไม่พบหรือ**อยู่นอกขอบเขต**
 *
 * ⚠️ ไม่มี `user` = ไม่ผ่าน (fail-closed) — เส้นที่เรียกทุกเส้นอยู่หลัง
 * `JwtAuthGuard` อยู่แล้ว การไม่มี actor คือบั๊กของโค้ด ไม่ใช่กรณีที่จะปล่อยผ่าน
 */
export async function assertIssueVisible(
  issue: Issue,
  permissions: PermissionsService,
  user?: AuthUser | null,
): Promise<void> {
  if (!user) throw issueNotFound(issue.id);
  if (await canViewAllIssues(permissions, user)) return;
  const uid = Number(user.id);
  if (Number(issue.programmerId) !== uid && Number(issue.customerId) !== uid) {
    throw issueNotFound(issue.id);
  }
}

/**
 * โหลดงานตาม id แล้วเช็คขอบเขตในคำเดียว — ใช้ในเส้นที่ไม่ได้เริ่มจาก
 * `IssuesService` (comments / attachments)
 *
 * @param relations — relations เพิ่มที่ service ผู้เรียกต้องใช้ต่อ (เช่น rules
 *   engine ของ comment ต้องการ `category`) — เช็คสิทธิ์ไม่ขึ้นกับตรงนี้
 */
export async function loadVisibleIssue(
  issues: Repository<Issue>,
  permissions: PermissionsService,
  issueId: number,
  user?: AuthUser | null,
  relations?: string[],
): Promise<Issue> {
  const issue = await issues.findOne({
    where: { id: issueId },
    ...(relations && relations.length > 0 ? { relations } : {}),
  });
  if (!issue) throw issueNotFound(issueId);
  await assertIssueVisible(issue, permissions, user);
  return issue;
}
