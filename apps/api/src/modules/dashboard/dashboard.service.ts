import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, type SelectQueryBuilder } from "typeorm";
import { Issue } from "../issues/entities/issue.entity";
import { IssueStatus } from "../issue-statuses/entities/issue-status.entity";
import { AuthUser } from "../auth/auth-user";
import { PermissionsService } from "../permissions/permissions.service";

/**
 * Dashboard backend — powers the `/` page (GET /dashboard/summary).
 *
 * One round trip returns every number the dashboard shows: status cards,
 * the new-issues trend, the app/category donuts, the priority bars and the
 * programmers' workload. Only **aggregates** cross the wire — never issue
 * rows — so the payload stays tiny no matter how many cards exist.
 *
 * Scoping mirrors GET /issues: a caller without `dashboard.overview.view`
 * only ever sees cards they reported or were assigned ("own"), computed
 * server-side. No schema writes — every query here is read-only.
 */

/** Requested/returned data scope. `"own"` = assigned-to-me OR reported-by-me. */
export type DashboardScope = "all" | "assigned" | "reported" | "own";

/** Requested trend granularity; also decides the look-back window. */
export type DashboardPeriod = "day" | "week" | "month" | "year";

/** A labeled count row (status / priority / app / category dimension). */
export interface DashboardCountRow {
  id: number | null;
  name: string | null;
  count: number;
}

/** One trend bucket — `bucket` is `yyyy-mm-dd` (bucket start, Bangkok time). */
export interface DashboardTrendRow {
  bucket: string;
  count: number;
}

/** One programmer's open load + banked timer hours (desc by hours). */
export interface DashboardWorkloadRow {
  userId: number;
  name: string;
  openCount: number;
  hours: number;
}

/** GET /dashboard/summary response — aggregates only, no issue content. */
export interface DashboardSummary {
  /** The scope actually applied (may fall back from "all" to "own"). */
  scope: DashboardScope;
  period: DashboardPeriod;
  total: number;
  statuses: DashboardCountRow[];
  priorities: DashboardCountRow[];
  apps: DashboardCountRow[];
  categories: DashboardCountRow[];
  trend: DashboardTrendRow[];
  workload: DashboardWorkloadRow[];
}

/**
 * The completion status — created as "Done", since renamed to "เสร็จสิ้น".
 * Ids do not move when names do, so open counts key off the id (same constant
 * as reports.service.ts).
 */
const DONE_STATUS_ID = 4;

/** Trend buckets use Thai wall-clock days, not UTC or server-local ones. */
const TREND_TIMEZONE = "Asia/Bangkok";

/** Look-back window per period — 30 days / 12 weeks / 12 months / 3 years. */
const TREND_WINDOW_DAYS: Record<DashboardPeriod, number> = {
  day: 30,
  week: 84,
  month: 365,
  year: 1095,
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

type RawCount = string | number;

function num(value: RawCount | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    @InjectRepository(IssueStatus)
    private readonly statuses: Repository<IssueStatus>,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * "all" is the overview — only `dashboard.overview.view` readers get it;
   * anyone else falls back to "own" (their assigned + reported cards) so the
   * page always renders instead of erroring. Personal scopes are always
   * allowed: they only ever return the caller's own rows.
   */
  private async effectiveScope(
    requested: DashboardScope,
    user?: AuthUser | null,
  ): Promise<DashboardScope> {
    if (requested !== "all") return requested;
    if (!user) return "all";
    const perms = await this.permissions.getUserPermissions(user.roleId, user.positionId);
    return perms.includes("dashboard.overview.view") ? "all" : "own";
  }

  /** Base visibility filter: live cards, narrowed to the caller's scope. */
  private baseQb(scope: DashboardScope, uid: number): SelectQueryBuilder<Issue> {
    const qb = this.issues.createQueryBuilder("issue").where("issue.deleted_at IS NULL");
    if (scope === "assigned") {
      qb.andWhere("issue.programmer_id = :uid", { uid });
    } else if (scope === "reported") {
      qb.andWhere("issue.customer_id = :uid", { uid });
    } else if (scope === "own") {
      qb.andWhere("(issue.programmer_id = :uid OR issue.customer_id = :uid)", { uid });
    }
    return qb;
  }

  /**
   * Counts per status — every status comes back (zero-filled) in board column
   * order, so the four status cards always render even when one column is
   * empty. Cards without a status are not part of `statuses` (they sit on no
   * column) but ARE counted in `total`.
   */
  private async statusCounts(scope: DashboardScope, uid: number): Promise<DashboardCountRow[]> {
    const [statuses, raw] = await Promise.all([
      this.statuses.find({ order: { position: "ASC" } }),
      this.baseQb(scope, uid)
        .select("issue.status_id", "id")
        .addSelect("COUNT(*)::int", "count")
        .groupBy("issue.status_id")
        .getRawMany(),
    ]);
    const byId = new Map(raw.map((r) => [r.id == null ? null : Number(r.id), num(r.count)]));
    return statuses.map((s) => ({ id: s.id, name: s.name, count: byId.get(s.id) ?? 0 }));
  }

  /** Counts per priority — includes an `id: null` group (ไม่ระบุ) when present. */
  private async priorityCounts(scope: DashboardScope, uid: number): Promise<DashboardCountRow[]> {
    const raw = await this.baseQb(scope, uid)
      .leftJoin("issue.priority", "dim")
      .select("dim.id", "id")
      .addSelect("dim.name", "name")
      .addSelect("COUNT(*)::int", "count")
      .groupBy("dim.id")
      .addGroupBy("dim.name")
      .addGroupBy("dim.sort_order")
      .orderBy("MIN(dim.sort_order)", "ASC")
      .getRawMany();
    return raw.map((r) => ({ id: r.id == null ? null : Number(r.id), name: r.name, count: num(r.count) }));
  }

  /** Counts per app — only cards that carry one; busiest app first. */
  private async appCounts(scope: DashboardScope, uid: number): Promise<DashboardCountRow[]> {
    return this.namedCounts(scope, uid, "app");
  }

  /** Counts per category — only cards that carry one; busiest first. */
  private async categoryCounts(scope: DashboardScope, uid: number): Promise<DashboardCountRow[]> {
    return this.namedCounts(scope, uid, "category");
  }

  /** Shared GROUP BY over a named dimension (app / category). */
  private async namedCounts(
    scope: DashboardScope,
    uid: number,
    dim: "app" | "category",
  ): Promise<DashboardCountRow[]> {
    const raw = await this.baseQb(scope, uid)
      .leftJoin(`issue.${dim}`, "dim")
      .andWhere(`issue.${dim}_id IS NOT NULL`)
      .select("dim.id", "id")
      .addSelect("dim.name", "name")
      .addSelect("COUNT(*)::int", "count")
      .groupBy("dim.id")
      .addGroupBy("dim.name")
      .orderBy("COUNT(*)", "DESC")
      .getRawMany();
    return raw.map((r) => ({ id: Number(r.id), name: r.name as string, count: num(r.count) }));
  }

  /**
   * New cards per bucket — `date_trunc` in Bangkok time so "today" means the
   * Thai day regardless of the DB server timezone. The client zero-fills the
   * gaps inside the window (that is presentation, not aggregation).
   */
  private async trendCounts(
    scope: DashboardScope,
    uid: number,
    period: DashboardPeriod,
  ): Promise<DashboardTrendRow[]> {
    const from = new Date(Date.now() - TREND_WINDOW_DAYS[period] * 24 * 60 * 60 * 1000);
    const raw = await this.baseQb(scope, uid)
      .andWhere("issue.created_at >= :trendFrom", { trendFrom: from })
      .select(
        `to_char(date_trunc('${period}', issue.created_at AT TIME ZONE '${TREND_TIMEZONE}'), 'YYYY-MM-DD')`,
        "bucket",
      )
      .addSelect("COUNT(*)::int", "count")
      .groupBy("bucket")
      .orderBy("bucket", "ASC")
      .getRawMany();
    return raw.map((r) => ({ bucket: String(r.bucket), count: num(r.count) }));
  }

  /**
   * Per-programmer load: open cards (not yet in the done column) + timer
   * hours banked on the cards. Programmers only (role = 'programmer'), busiest
   * first — the card's list scrolls inside itself, so any team size fits.
   * Only computed for overview readers (scope "all"); everyone else gets [].
   */
  private async workload(scope: DashboardScope, uid: number): Promise<DashboardWorkloadRow[]> {
    if (scope !== "all") return [];
    const raw = await this.baseQb(scope, uid)
      .innerJoin("issue.programmer", "person")
      .innerJoin("person.role", "role")
      .andWhere("role.name = :roleName", { roleName: "programmer" })
      .select("person.id", "userId")
      .addSelect("COALESCE(NULLIF(TRIM(person.name), ''), person.email)", "name")
      .addSelect(
        `COUNT(*) FILTER (WHERE COALESCE(issue.status_id, 0) <> ${DONE_STATUS_ID})::int`,
        "openCount",
      )
      .addSelect("COALESCE(SUM(issue.tracked_duration), 0)", "seconds")
      .groupBy("person.id")
      .orderBy("SUM(issue.tracked_duration)", "DESC")
      .getRawMany();
    return raw.map((r) => ({
      userId: Number(r.userId),
      name: String(r.name ?? ""),
      openCount: num(r.openCount),
      hours: round1(num(r.seconds) / 3600),
    }));
  }

  /** GET /dashboard/summary — every dashboard aggregate in one call. */
  async summary(
    requestedScope: DashboardScope,
    period: DashboardPeriod,
    user?: AuthUser | null,
  ): Promise<DashboardSummary> {
    const scope = await this.effectiveScope(requestedScope, user);
    const uid = Number(user?.id ?? 0);

    const [total, statuses, priorities, apps, categories, trend, workload] = await Promise.all([
      this.baseQb(scope, uid).getCount(),
      this.statusCounts(scope, uid),
      this.priorityCounts(scope, uid),
      this.appCounts(scope, uid),
      this.categoryCounts(scope, uid),
      this.trendCounts(scope, uid, period),
      this.workload(scope, uid),
    ]);

    return { scope, period, total, statuses, priorities, apps, categories, trend, workload };
  }
}
