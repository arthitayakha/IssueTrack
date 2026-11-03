import { BadRequestException, Injectable } from "@nestjs/common";
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
 * Clicking a chart drills deeper through read-only endpoints that all reuse
 * the same scope: GET /dashboard/trend-issues (one bar), GET /dashboard/
 * drilldown (counts inside one slice — app → category) and GET /dashboard/
 * dimension-issues (the issues behind one slice).
 *
 * `statusId` cross-filters the page: every aggregate except the status
 * ring's context pair (`statuses` + `total`) narrows to one status, so
 * picking a status slice re-cuts the priorities, apps, categories, trend and
 * workload. The ring that set the filter deliberately does NOT filter itself
 * — it keeps every column as context and the client highlights the choice
 * instead (Tableau's "Ignore Actions" / Power BI's cross-highlight),
 * otherwise it would collapse to one slice.
 *
 * Scoping mirrors GET /issues: a caller without `dashboard.overview.view`
 * only ever sees cards they reported or were assigned ("own"), computed
 * server-side. No schema writes — every query here is read-only.
 */

/** Requested/returned data scope. `"own"` = assigned-to-me OR reported-by-me. */
export type DashboardScope = "all" | "assigned" | "reported" | "own";

/** Requested trend granularity; also decides the look-back window. */
export type DashboardPeriod = "day" | "week" | "month" | "year";

/**
 * Custom trend window — `yyyy-mm-dd`, both bounds read as Bangkok days.
 * Absent bounds fall back to the period's look-back window.
 */
export interface DashboardRange {
  from?: string;
  to?: string;
}

/** A labeled count row (status / priority / app / category dimension). */
export interface DashboardCountRow {
  id: number | null;
  name: string | null;
  /** Board column color (`issue_statuses.color`) — statuses only. */
  color?: string | null;
  count: number;
}

/** One trend bucket — `bucket` is `yyyy-mm-dd` (bucket start, Bangkok time). */
export interface DashboardTrendRow {
  bucket: string;
  count: number;
}

/**
 * One programmer's open load + timer hours banked on those open cards
 * (sorted by open load desc). The position rides along so the card can build
 * its filter dropdown client-side without a second request.
 */
export interface DashboardWorkloadRow {
  userId: number;
  name: string;
  openCount: number;
  hours: number;
  /** The programmer's `positions` row — null when they hold no position. */
  positionId: number | null;
  positionName: string | null;
}

/** GET /dashboard/summary response — aggregates only, no issue content. */
export interface DashboardSummary {
  /** The scope actually applied (may fall back from "all" to "own"). */
  scope: DashboardScope;
  period: DashboardPeriod;
  /** Echoed trend window — null when the period's look-back is in use. */
  from: string | null;
  to: string | null;
  /**
   * Echoed cross-filter — the status every aggregate was narrowed to, or null
   * when the page shows everything. `statuses` and `total` are the status
   * ring's context pair and are deliberately exempt: the chart that sets the
   * filter must not change its own numbers. The client reads the echoed
   * value, never the one it asked for.
   */
  statusId: number | null;
  /** Page-wide total — never narrowed by `statusId` (see above). */
  total: number;
  statuses: DashboardCountRow[];
  priorities: DashboardCountRow[];
  apps: DashboardCountRow[];
  categories: DashboardCountRow[];
  trend: DashboardTrendRow[];
  workload: DashboardWorkloadRow[];
}

/** One card inside a clicked trend bucket (GET /dashboard/trend-issues). */
export interface DashboardTrendIssue {
  id: number;
  issueNumber: string | null;
  title: string;
  createdAt: string;
  status: { id: number; name: string; color: string | null } | null;
  priority: { id: number; name: string } | null;
  reporter: { id: number; name: string } | null;
  assignee: { id: number; name: string } | null;
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

/** One drill-down list is bounded by the bar it came from — never more. */
const TREND_ISSUES_LIMIT = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `yyyy-mm-dd` → Date at **that Bangkok day's** 00:00 (explicit +07:00, so the
 * DB server's timezone never leaks into the boundary); null when malformed.
 * Bangkok has no DST, so "the next day" is always a clean +24h.
 */
function bkkDayStart(value?: string): Date | null {
  if (!value || !YMD_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Start of the day **after** `value` — the exclusive upper bound. */
function bkkDayAfter(value?: string): Date | null {
  const start = bkkDayStart(value);
  return start ? new Date(start.getTime() + DAY_MS) : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

type RawCount = string | number;

function num(value: RawCount | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A drill-down dimension must name a real slice — there is no safe default.
 * `status` only reaches GET /dashboard/dimension-issues (the list behind the
 * status ring); `drilldown` rejects it there because a status has no level 2.
 */
function parseDim(value: string): "app" | "category" | "status" {
  if (value !== "app" && value !== "category" && value !== "status") {
    throw new BadRequestException('dim must be "app", "category" or "status"');
  }
  return value;
}

/**
 * A drill-down id straight from the query string: `Number("")` is 0 and
 * `Number("abc")` is NaN, so one check rejects both plus negatives and
 * fractions. Never a silent fallback — a wrong id would show the wrong list.
 */
function parsePositiveId(value: string | undefined, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }
  return n;
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

  /**
   * Base visibility filter: live cards, narrowed to the caller's scope and —
   * when the page is cross-filtered — to one status (`statusId`).
   */
  private baseQb(
    scope: DashboardScope,
    uid: number,
    statusId?: number,
  ): SelectQueryBuilder<Issue> {
    const qb = this.issues.createQueryBuilder("issue").where("issue.deleted_at IS NULL");
    if (statusId != null) {
      qb.andWhere("issue.status_id = :statusId", { statusId });
    }
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
   * order, so the status ring always renders even when one column is empty.
   * Cards without a status are not part of `statuses` (they sit on no column)
   * but ARE counted in `total`.
   *
   * Together with `total` this is the ring's context pair, and it IGNORES
   * `statusId`: it is the ring the user clicks to set the cross-filter, so it
   * must keep every column — the client highlights the selected slice rather
   * than collapsing the ring.
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
    return statuses.map((s) => ({
      id: s.id,
      name: s.name,
      // board column color — the cards match the board without name heuristics
      color: s.color,
      count: byId.get(s.id) ?? 0,
    }));
  }

  /** Counts per priority — includes an `id: null` group (ไม่ระบุ) when present. */
  private async priorityCounts(
    scope: DashboardScope,
    uid: number,
    statusId?: number,
  ): Promise<DashboardCountRow[]> {
    const raw = await this.baseQb(scope, uid, statusId)
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
  private async appCounts(
    scope: DashboardScope,
    uid: number,
    statusId?: number,
  ): Promise<DashboardCountRow[]> {
    return this.namedCounts(scope, uid, "app", undefined, statusId);
  }

  /** Counts per category — only cards that carry one; busiest first. */
  private async categoryCounts(
    scope: DashboardScope,
    uid: number,
    statusId?: number,
  ): Promise<DashboardCountRow[]> {
    return this.namedCounts(scope, uid, "category", undefined, statusId);
  }

  /**
   * Shared GROUP BY over a named dimension (app / category).
   *
   * `parentAppId` narrows the ring to one app's cards — that is level 2 of the
   * usage donut (categories inside the app the user clicked). Same scope, same
   * grouping and the same ordering as the top-level ring, so a child slice can
   * never disagree with the parent slice it came from. `statusId` keeps that
   * promise too: a level-2 ring must honour the page's cross-filter or its
   * numbers would not add up to the filtered parent slice.
   */
  private async namedCounts(
    scope: DashboardScope,
    uid: number,
    dim: "app" | "category",
    parentAppId?: number,
    statusId?: number,
  ): Promise<DashboardCountRow[]> {
    const qb = this.baseQb(scope, uid, statusId)
      .leftJoin(`issue.${dim}`, "dim")
      .andWhere(`issue.${dim}_id IS NOT NULL`);
    if (parentAppId != null) {
      qb.andWhere("issue.app_id = :parentAppId", { parentAppId });
    }
    const raw = await qb
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
   * GET /dashboard/drilldown — one dimension nested under a parent app.
   *
   * Level 2 of the usage donut: the categories that still have cards once the
   * clicked app's filter is applied. Read-only, scope-checked exactly like the
   * top-level counts (a caller without `dashboard.overview.view` only ever
   * sees their own cards), so the child ring and the parent slice agree.
   */
  async drilldown(
    requestedScope: DashboardScope,
    dim: string,
    app: string,
    user?: AuthUser | null,
    statusId?: number,
  ): Promise<DashboardCountRow[]> {
    const dimName = parseDim(dim);
    // a status has no level-2 ring — this endpoint only ever nests in an app
    if (dimName === "status") {
      throw new BadRequestException('dim must be "app" or "category"');
    }
    const parentAppId = parsePositiveId(app, "app");
    const scope = await this.effectiveScope(requestedScope, user);
    const uid = Number(user?.id ?? 0);
    return this.namedCounts(scope, uid, dimName, parentAppId, statusId);
  }

  /**
   * New cards per bucket — `date_trunc` in Bangkok time so "today" means the
   * Thai day regardless of the DB server timezone. The client zero-fills the
   * gaps inside the window (that is presentation, not aggregation).
   *
   * Window: a custom `from`/`to` (Bangkok days) wins; a missing bound falls
   * back to the period's look-back — counted back from `to` when only `to`
   * was given, from now otherwise. Only the trend honours the date range; the
   * status cross-filter (`statusId`) applies to every aggregate on the page.
   */
  private async trendCounts(
    scope: DashboardScope,
    uid: number,
    period: DashboardPeriod,
    range: DashboardRange = {},
    statusId?: number,
  ): Promise<DashboardTrendRow[]> {
    const upperExclusive = bkkDayAfter(range.to);
    const lower =
      bkkDayStart(range.from) ??
      new Date((upperExclusive?.getTime() ?? Date.now()) - TREND_WINDOW_DAYS[period] * DAY_MS);
    const qb = this.baseQb(scope, uid, statusId).andWhere("issue.created_at >= :trendFrom", {
      trendFrom: lower,
    });
    if (upperExclusive) {
      qb.andWhere("issue.created_at < :trendTo", { trendTo: upperExclusive });
    }
    const raw = await qb
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
   * The issues behind one trend bar — GET /dashboard/trend-issues.
   *
   * Same `baseQb` (scope + the page's status cross-filter) and the very same
   * Bangkok `date_trunc` expression as `trendCounts`, so the list always adds
   * up to the number on the bar. Rows are capped: a bucket can never return
   * more than TREND_ISSUES_LIMIT.
   */
  async trendIssues(
    requestedScope: DashboardScope,
    period: DashboardPeriod,
    bucket: string,
    user?: AuthUser | null,
    statusId?: number,
  ): Promise<DashboardTrendIssue[]> {
    if (!YMD_RE.test(bucket)) {
      throw new BadRequestException("bucket must be a yyyy-mm-dd date");
    }
    const scope = await this.effectiveScope(requestedScope, user);
    const uid = Number(user?.id ?? 0);
    const rows = await this.baseQb(scope, uid, statusId)
      .andWhere(
        `to_char(date_trunc('${period}', issue.created_at AT TIME ZONE '${TREND_TIMEZONE}'), 'YYYY-MM-DD') = :bucket`,
        { bucket },
      )
      .leftJoinAndSelect("issue.status", "status")
      .leftJoinAndSelect("issue.priority", "priority")
      .leftJoinAndSelect("issue.customer", "customer")
      .leftJoinAndSelect("issue.programmer", "programmer")
      .orderBy("issue.created_at", "DESC")
      .addOrderBy("issue.id", "DESC")
      .limit(TREND_ISSUES_LIMIT)
      .getMany();

    return rows.map((issue) => this.toDrillRow(issue));
  }

  /**
   * The issues behind one donut slice — GET /dashboard/dimension-issues.
   *
   * `dim` is the dimension the slice was cut from (`id` = that row's id) and
   * `app` is the app the caller drilled through first, so a level-2 slice's
   * list adds up to the number printed on it (`app_id AND category_id`).
   * `statusId` is the page's cross-filter and rides along for the same reason
   * — the list must match the filtered slice it came from (the client leaves
   * it out when `dim` itself is the status filter, so the two never conflict).
   * Same `baseQb` scope and the same 200-row cap as the trend drill-down, so
   * a personal scope can never leak someone else's cards here either.
   */
  async dimensionIssues(
    requestedScope: DashboardScope,
    dim: string,
    id: string,
    app: string | undefined,
    user?: AuthUser | null,
    statusId?: number,
  ): Promise<DashboardTrendIssue[]> {
    const dimName = parseDim(dim);
    const dimId = parsePositiveId(id, "id");
    const parentAppId = app == null || app === "" ? null : parsePositiveId(app, "app");
    const scope = await this.effectiveScope(requestedScope, user);
    const uid = Number(user?.id ?? 0);

    const qb = this.baseQb(scope, uid, statusId).andWhere(`issue.${dimName}_id = :dimId`, { dimId });
    if (parentAppId != null) {
      qb.andWhere("issue.app_id = :appId", { appId: parentAppId });
    }

    const rows = await qb
      .leftJoinAndSelect("issue.status", "status")
      .leftJoinAndSelect("issue.priority", "priority")
      .leftJoinAndSelect("issue.customer", "customer")
      .leftJoinAndSelect("issue.programmer", "programmer")
      .orderBy("issue.created_at", "DESC")
      .addOrderBy("issue.id", "DESC")
      .limit(TREND_ISSUES_LIMIT)
      .getMany();

    return rows.map((issue) => this.toDrillRow(issue));
  }

  /**
   * One drill-down row — shared by the trend bar and the donut slices so both
   * lists render the exact same shape (and the same `/boards?issue=` deep
   * link on the client).
   */
  private toDrillRow(issue: Issue): DashboardTrendIssue {
    const displayName = (u?: { name?: string | null; email?: string | null } | null) =>
      u ? (u.name?.trim() || u.email || null) : null;

    return {
      id: issue.id,
      issueNumber: issue.issueNumber ?? null,
      title: issue.title,
      createdAt:
        issue.createdAt instanceof Date ? issue.createdAt.toISOString() : String(issue.createdAt),
      status: issue.status
        ? { id: issue.status.id, name: issue.status.name, color: issue.status.color ?? null }
        : null,
      priority: issue.priority ? { id: issue.priority.id, name: issue.priority.name } : null,
      reporter: issue.customer
        ? { id: issue.customer.id, name: displayName(issue.customer) ?? "" }
        : null,
      assignee: issue.programmer
        ? { id: issue.programmer.id, name: displayName(issue.programmer) ?? "" }
        : null,
    };
  }

  /**
   * Per-programmer load: open cards (not yet in the done column) + timer
   * hours banked **on those open cards only** (finished work is excluded from
   * both numbers, so the card answers "who is holding what right now").
   * Busiest open load first, hours as the tiebreak. The programmer's position
   * rides along so the client can build its filter dropdown from this list
   * alone — no second request, no `position.view` needed.
   * Programmers only (role = 'programmer').
   * Only computed for overview readers (scope "all"); everyone else gets [].
   */
  private async workload(
    scope: DashboardScope,
    uid: number,
    statusId?: number,
  ): Promise<DashboardWorkloadRow[]> {
    if (scope !== "all") return [];
    const openFilter = `COALESCE(issue.status_id, 0) <> ${DONE_STATUS_ID}`;
    const raw = await this.baseQb(scope, uid, statusId)
      .innerJoin("issue.programmer", "person")
      .innerJoin("person.role", "role")
      .leftJoin("person.position", "pos")
      .andWhere("role.name = :roleName", { roleName: "programmer" })
      .select("person.id", "userId")
      .addSelect("COALESCE(NULLIF(TRIM(person.name), ''), person.email)", "name")
      .addSelect(`COUNT(*) FILTER (WHERE ${openFilter})::int`, "openCount")
      .addSelect(`COALESCE(SUM(issue.tracked_duration) FILTER (WHERE ${openFilter}), 0)`, "seconds")
      .addSelect("pos.id", "positionId")
      .addSelect("pos.name", "positionName")
      .groupBy("person.id")
      // pos.* is not functionally dependent on person.id — name it explicitly
      .addGroupBy("pos.id")
      .addGroupBy("pos.name")
      .orderBy(`COUNT(*) FILTER (WHERE ${openFilter})`, "DESC")
      .addOrderBy(`COALESCE(SUM(issue.tracked_duration) FILTER (WHERE ${openFilter}), 0)`, "DESC")
      .getRawMany();
    return raw.map((r) => ({
      userId: Number(r.userId),
      name: String(r.name ?? ""),
      openCount: num(r.openCount),
      hours: round1(num(r.seconds) / 3600),
      positionId: r.positionId == null ? null : Number(r.positionId),
      positionName: r.positionName == null ? null : String(r.positionName),
    }));
  }

  /**
   * GET /dashboard/summary — every dashboard aggregate in one call.
   *
   * `statusId` is the page's cross-filter: it narrows everything except the
   * status ring's context pair (`statuses` + `total`), so the ring that set
   * the filter keeps its columns and its total while the rest of the page
   * answers "what does this status look like?".
   */
  async summary(
    requestedScope: DashboardScope,
    period: DashboardPeriod,
    user?: AuthUser | null,
    range: DashboardRange = {},
    statusId?: number,
  ): Promise<DashboardSummary> {
    const scope = await this.effectiveScope(requestedScope, user);
    const uid = Number(user?.id ?? 0);

    const [total, statuses, priorities, apps, categories, trend, workload] = await Promise.all([
      // the ring's context pair — total + statuses are NEVER narrowed by the
      // cross-filter, so the card that sets it never changes its own numbers
      this.baseQb(scope, uid).getCount(),
      this.statusCounts(scope, uid), // never filtered — it is the chart that sets the filter
      this.priorityCounts(scope, uid, statusId),
      this.appCounts(scope, uid, statusId),
      this.categoryCounts(scope, uid, statusId),
      this.trendCounts(scope, uid, period, range, statusId),
      this.workload(scope, uid, statusId),
    ]);

    return {
      scope,
      period,
      from: range.from ?? null,
      to: range.to ?? null,
      statusId: statusId ?? null,
      total,
      statuses,
      priorities,
      apps,
      categories,
      trend,
      workload,
    };
  }
}
