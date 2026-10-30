import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  Between,
  FindOptionsWhere,
  ILike,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  Like,
  Repository,
} from "typeorm";
import type { ActivityActorDto, ActivityLogDto, ActivityLogType } from "@kanban/shared";
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
  /** "card" | "comment" | "rule" — missing/unknown means every group. */
  type?: string;
  /** Free-text match on the row's `detail` column (title, status names…). */
  search?: string;
  createdFrom?: string;
  createdTo?: string;
}

/** The prefix every action of a group shares — `card.moved` → "card". */
function typeOf(action: string): ActivityLogType | null {
  const prefix = action.split(".")[0];
  return prefix === "card" || prefix === "comment" || prefix === "rule" ? prefix : null;
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
      where: {
        entityId: issueId,
        // `rule.*` audit rows share the entityId column — a rule #5 must not
        // show up in issue #5's card history
        action: Not(Like("rule.%")),
      },
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
   * The whole `activity_logs` table as one feed — cards, comments and rule
   * audit rows together, newest first. Filters: one actor, one group
   * (card/comment/rule), free text on `detail`, and a created-at range
   * (yyyy-mm-dd, inclusive on both ends).
   */
  async findAll(filters: ActivityLogFilters): Promise<Paginated<ActivityLogDto>> {
    const params = normalizePagination(filters);
    const where: FindOptionsWhere<ActivityLog> = {};

    if (typeOf(filters.type ?? "") === filters.type) {
      // every action of a group starts with "<group>." — an unknown value
      // would hide every row, so it is treated as "all" instead
      where.action = Like(`${filters.type}.%`);
    }

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

    const [rows, total] = await this.activityLogs.findAndCount({
      where,
      order: { createdAt: "DESC", id: "DESC" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
      // name/role are read off `users` (+`roles`) — nothing is stored per row
      relations: ["actor", "actor.role"],
    });

    const data: ActivityLogDto[] = rows.map((log) => ({
      id: log.id,
      action: log.action,
      type: typeOf(log.action) ?? "card",
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
