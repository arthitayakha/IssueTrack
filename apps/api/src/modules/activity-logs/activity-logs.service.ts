import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Between,
  FindOptionsWhere,
  ILike,
  LessThanOrEqual,
  MoreThanOrEqual,
  Like,
  Repository,
} from "typeorm";
import type { ActivityActorDto, ActivityLogDto } from "@kanban/shared";
import { ACTIVITY_GROUP_PREFIXES, groupOfAction } from "@kanban/shared";
import { normalizePagination, type Paginated } from "../../common/pagination";
import { ActivityLog } from "./entities/activity-log.entity";

export interface ActorInfo {
  actorId: number | null;
  actorName: string | null;
  actorRole: string | null;
}

export interface ActivityLogFilters {
  page?: string;
  limit?: string;
  /** Actor (user) id — "all" or missing means everyone. */
  actorId?: string;
  /** One of the 5 groups in `ACTIVITY_GROUP_PREFIXES` — missing/unknown = every group. */
  type?: string;
  /** Free-text match on the row's `detail` column (title, status names…). */
  search?: string;
  createdFrom?: string;
  createdTo?: string;
}

function isDay(value?: string): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** detail is free text that usually holds JSON — hand back the object or null. */
function parseDetail(detail: string | null): Record<string, unknown> | null {
  if (!detail) return null;
  try {
    const parsed: unknown = JSON.parse(detail);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

@Injectable()
export class ActivityLogsService {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityLogs: Repository<ActivityLog>,
  ) {}

  async findByIssue(issueId: number) {
    const logs = await this.activityLogs.find({
      // **include-list, not `NOT rule.%`**: the interceptor gives every row an
      // `entityId` too (user id, app id, attachment id …), and `NOT rule.%`
      // would let `user.updated` #5 leak into issue #5's card history. A
      // top-level array is TypeORM's OR (a per-property one is not typed);
      // card + comment are also exactly what this timeline showed before the
      // interceptor existed, so old rows behave identically.
      where: [
        { entityId: issueId, action: Like("card.%") },
        { entityId: issueId, action: Like("comment.%") },
      ],
      order: { createdAt: "ASC" },
      // name/role are read off `users` (+`roles`) — nothing is stored per row
      relations: ["actor", "actor.role"],
    });
    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      actorId: log.actorId,
      actorName: log.actor?.name ?? null,
      actorRole: log.actor?.role?.name ?? null,
      entityId: log.entityId,
      detail: log.detail,
      createdAt: log.createdAt,
    }));
  }

  /**
   * The whole `activity_logs` table as one feed — every group together
   * (cards, comments, rules, users/permissions, master data), newest first.
   * Filters: one actor, one group, free text on `detail`, and a created-at
   * range (yyyy-mm-dd, inclusive on both ends).
   */
  async findAll(filters: ActivityLogFilters): Promise<Paginated<ActivityLogDto>> {
    const params = normalizePagination(filters);
    const where: FindOptionsWhere<ActivityLog> = {};

    // indexed by a raw string on purpose: an unknown `type` (typo, stale
    // client) reads as `undefined` → no prefixes → no clause → "all", rather
    // than crashing or silently returning an empty feed
    const prefixes = (ACTIVITY_GROUP_PREFIXES as Record<string, readonly string[]>)[
      filters.type ?? ""
    ];

    const actorId = Number(filters.actorId);
    if (filters.actorId !== undefined && Number.isInteger(actorId) && actorId > 0) {
      where.actorId = actorId;
    }

    // `detail` is a text column — ILIKE keeps the search accent/case-insensitive
    if (filters.search?.trim()) where.detail = ILike(`%${filters.search.trim()}%`);

    if (isDay(filters.createdFrom)) {
      const from = new Date(`${filters.createdFrom}T00:00:00`);
      const to = isDay(filters.createdTo)
        ? new Date(`${filters.createdTo}T23:59:59.999`)
        : null;
      where.createdAt = to ? Between(from, to) : MoreThanOrEqual(from);
    } else if (isDay(filters.createdTo)) {
      where.createdAt = LessThanOrEqual(new Date(`${filters.createdTo}T23:59:59.999`));
    }

    // A group spans **several** prefixes (`user` = user/role/position/
    // permission/auth) — one `Like("user.%")` would hide the other four. TypeORM
    // ORs a *top-level* array of where-objects (a per-property array is not in
    // the types), so the shared filters are copied into each branch; no prefix
    // → the plain object, i.e. every group.
    const effectiveWhere: FindOptionsWhere<ActivityLog> | FindOptionsWhere<ActivityLog>[] =
      prefixes && prefixes.length > 0
        ? prefixes.map((prefix) => ({ ...where, action: Like(`${prefix}.%`) }))
        : where;

    const [rows, total] = await this.activityLogs.findAndCount({
      where: effectiveWhere,
      order: { createdAt: "DESC", id: "DESC" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      // name/role are read off `users` (+`roles`) — nothing is stored per row
      relations: ["actor", "actor.role"],
    });

    const data: ActivityLogDto[] = rows.map((log) => ({
      id: log.id,
      action: log.action,
      type: groupOfAction(log.action),
      actorId: log.actorId,
      actorName: log.actor?.name ?? null,
      actorRole: log.actor?.role?.name ?? null,
      entityId: log.entityId,
      payload: parseDetail(log.detail),
      createdAt: new Date(log.createdAt).toISOString(),
    }));

    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.max(1, Math.ceil(total / params.limit)),
    };
  }

  /**
   * Distinct actors for the feed's dropdown — reads `activity_logs` itself
   * instead of `GET /users`, so it works without `user.view`. One DISTINCT
   * query; name/role are functionally tied to the actor id, so one row per
   * actor comes back.
   */
  async findActors(): Promise<ActivityActorDto[]> {
    const rows = await this.activityLogs
      .createQueryBuilder("log")
      // `.distinct(true)`, NOT `.select("DISTINCT ...")` — with addSelect the
      // latter emits `SELECT a, DISTINCT b`, which Postgres rejects
      .distinct(true)
      .innerJoin("log.actor", "actor")
      .leftJoin("actor.role", "role")
      .select("log.actor_id", "actorId")
      .addSelect("actor.name", "name")
      .addSelect("role.name", "role")
      .orderBy("actor.name", "ASC")
      .getRawMany<{ actorId: number; name: string; role: string | null }>();

    return rows.map((r) => ({ id: Number(r.actorId), name: r.name, role: r.role ?? null }));
  }
}
