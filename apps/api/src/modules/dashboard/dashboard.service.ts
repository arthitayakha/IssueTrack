import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, type SelectQueryBuilder } from "typeorm";
import { Issue } from "../issues/entities/issue.entity";
import { IssueStatus } from "../issue-statuses/entities/issue-status.entity";
import { AuthUser } from "../auth/auth-user";
import { PermissionsService } from "../permissions/permissions.service";
import { DONE_MOVE_MATCH, DONE_STATUS_ID, doneMoveParams } from "../../common/done-moves";

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
 *
 * `companyIds` is the company filter and uses the SAME rule as GET /issues
 * and GET /reports (card → REPORTER → `users.company_id`), so all three
 * screens agree on which company a card belongs to. It is a data scope like
 * `scope`, NOT a cross-highlight like `statusId`: it narrows every aggregate
 * including the status ring and `total`.
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

/**
 * Which of the chart's two series a drill-down list belongs to — the trend
 * bar shows "created" and "completed" side by side, and a list must add up
 * to the number on the bar it came from.
 */
export type DashboardTrendSeries = "created" | "completed";

/**
 * One trend bucket — `bucket` is `yyyy-mm-dd` (bucket start, Bangkok time).
 * Two counts live in the same row so one round trip feeds both bars:
 * `created` = cards born in the bucket, `completed` = moves into the done
 * status that happened in the bucket (an event count — a card that leaves
 * and re-enters counts twice).
 */
export interface DashboardTrendRow {
  bucket: string;
  created: number;
  completed: number;
}

/**
 * One programmer's open load (sorted by open load desc). The position rides
 * along so the client can build its filter dropdown from this list alone —
 * no second request, no `position.view` needed.
 */
export interface DashboardWorkloadRow {
  userId: number;
  name: string;
  openCount: number;
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
  /**
   * Echoed company filter — every aggregate (INCLUDING `statuses` + `total`)
   * was cut to cards whose REPORTER belongs to one of these companies
   * (`[]` = no filter). A data scope like `scope`, not a cross-highlight:
   * the status ring narrows with the rest of the page.
   */
  companyIds: number[];
  /** Page-wide total — narrowed by `companyIds`, never by `statusId`. */
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
   * Base visibility filter: live cards, narrowed to the caller's scope, to one
   * status when the page is cross-filtered (`statusId`) and to the selected
   * companies (`companyIds`).
   *
   * The company clause follows the SAME path as `GET /issues` / `GET /reports`
   * (card → REPORTER → `users.company_id`) so the three screens can never
   * disagree about which company a card belongs to. It sits in `baseQb` — i.e.
   * it narrows EVERY aggregate including the status ring and `total`, because
   * unlike `statusId` (a cross-highlight) the company picker is a data scope.
   */
  private baseQb(
    scope: DashboardScope,
    uid: number,
    statusId?: number,
    companyIds?: number[],
  ): SelectQueryBuilder<Issue> {
    const qb = this.issues.createQueryBuilder("issue").where("issue.deleted_at IS NULL");
    if (statusId != null) {
      qb.andWhere("issue.status_id = :statusId", { statusId });
    }
    if (companyIds && companyIds.length > 0) {
      qb.andWhere(
        "EXISTS (SELECT 1 FROM users u WHERE u.id = issue.customer_id AND u.company_id IN (:...companyIds))",
        { companyIds },
      );
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
   * than collapsing the ring. The company filter DOES apply (it is a data
   * scope), so the ring answers "how is THIS COMPANY's work spread?".
   */
  private async statusCounts(
    scope: DashboardScope,
    uid: number,
    companyIds?: number[],
  ): Promise<DashboardCountRow[]> {
    const [statuses, raw] = await Promise.all([
      this.statuses.find({ order: { position: "ASC" } }),
      this.baseQb(scope, uid, undefined, companyIds)
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
    companyIds?: number[],
  ): Promise<DashboardCountRow[]> {
    const raw = await this.baseQb(scope, uid, statusId, companyIds)
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

  /** Counts per app — cards with no app land in the `id: null` slice; busiest first. */
  private async appCounts(
    scope: DashboardScope,
    uid: number,
    statusId?: number,
    companyIds?: number[],
  ): Promise<DashboardCountRow[]> {
    return this.namedCounts(scope, uid, "app", undefined, statusId, companyIds);
  }

  /** Counts per category — cards with no category land in the `id: null` slice. */
  private async categoryCounts(
    scope: DashboardScope,
    uid: number,
    statusId?: number,
    companyIds?: number[],
  ): Promise<DashboardCountRow[]> {
    return this.namedCounts(scope, uid, "category", undefined, statusId, companyIds);
  }

  /**
   * Shared GROUP BY over a named dimension (app / category).
   *
   * Cards whose `*_id` is NULL are **not** filtered out: the LEFT JOIN makes
   * SQL return one `id: null, name: null` group for them, which the client
   * labels "ไม่มีหมวดหมู่" / "ไม่มีแอป". Dropping them silently made the ring
   * disagree with `total` (and with the folder counts on the board) — e.g. a
   * free-text "อื่น ๆ" report stores `custom_category` with `category_id`
   * NULL, so that whole bucket used to vanish from the chart.
   *
   * `parentAppId` narrows the ring to one app's cards — that is level 2 of the
   * usage donut (categories inside the app the user clicked). Same scope, same
   * grouping and the same ordering as the top-level ring, so a child slice can
   * never disagree with the parent slice it came from. `statusId` keeps that
   * promise too: a level-2 ring must honour the page's cross-filter or its
   * numbers would not add up to the filtered parent slice. `companyIds` rides
   * along for exactly the same reason (and applies to the top-level rings too
   * — it is a data scope, see `baseQb`).
   */
  private async namedCounts(
    scope: DashboardScope,
    uid: number,
    dim: "app" | "category",
    parentAppId?: number,
    statusId?: number,
    companyIds?: number[],
  ): Promise<DashboardCountRow[]> {
    const qb = this.baseQb(scope, uid, statusId, companyIds).leftJoin(`issue.${dim}`, "dim");
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
    // Number(null) is 0 — a NULL group must stay `id: null`, never id 0
    return raw.map((r) => ({
      id: r.id == null ? null : Number(r.id),
      name: (r.name as string | null) ?? null,
      count: num(r.count),
    }));
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
    companyIds?: number[],
  ): Promise<DashboardCountRow[]> {
    const dimName = parseDim(dim);
    // a status has no level-2 ring — this endpoint only ever nests in an app
    if (dimName === "status") {
      throw new BadRequestException('dim must be "app" or "category"');
    }
    const parentAppId = parsePositiveId(app, "app");
    const scope = await this.effectiveScope(requestedScope, user);
    const uid = Number(user?.id ?? 0);
    return this.namedCounts(scope, uid, dimName, parentAppId, statusId, companyIds);
  }

  /**
   * New cards AND completions per bucket — `date_trunc` in Bangkok time so
   * "today" means the Thai day regardless of the DB server timezone. The
   * client zero-fills the gaps inside the window (that is presentation, not
   * aggregation), and one row carries BOTH series so the two bars can never
   * disagree about the window:
   *
   *   - `created`  — cards whose `created_at` falls in the bucket (unchanged);
   *   - `completed` — one row per move INTO the done status, bucketed by the
   *     MOVE's own `activity_logs.created_at`, so "how many finished that
   *     day" is answered by the day they finished, not the day they were
   *     born. Same `baseQb` scope (status cross-filter + company + personal
   *     scope) as every other aggregate on the page.
   *
   * Window: a custom `from`/`to` (Bangkok days) wins; a missing bound falls
   * back to the period's look-back — counted back from `to` when only `to`
   * was given, from now otherwise. Only the trend honours the date range; the
   * status cross-filter (`statusId`) and the company filter (`companyIds`)
   * apply to every aggregate on the page.
   */
  private async trendCounts(
    scope: DashboardScope,
    uid: number,
    period: DashboardPeriod,
    range: DashboardRange = {},
    statusId?: number,
    companyIds?: number[],
  ): Promise<DashboardTrendRow[]> {
    const upperExclusive = bkkDayAfter(range.to);
    const lower =
      bkkDayStart(range.from) ??
      new Date((upperExclusive?.getTime() ?? Date.now()) - TREND_WINDOW_DAYS[period] * DAY_MS);

    const bucketOf = (column: string): string =>
      `to_char(date_trunc('${period}', ${column} AT TIME ZONE '${TREND_TIMEZONE}'), 'YYYY-MM-DD')`;
    const window = (qb: SelectQueryBuilder<Issue>, column: string): void => {
      qb.andWhere(`${column} >= :trendFrom`, { trendFrom: lower });
      if (upperExclusive) qb.andWhere(`${column} < :trendTo`, { trendTo: upperExclusive });
    };
    const countByBucket = (qb: SelectQueryBuilder<Issue>, column: string) =>
      qb
        .select(bucketOf(column), "bucket")
        .addSelect("COUNT(*)::int", "count")
        .groupBy("bucket")
        .orderBy("bucket", "ASC")
        .getRawMany();

    // 1) created — the card's own birth date
    const createdQb = this.baseQb(scope, uid, statusId, companyIds);
    window(createdQb, "issue.created_at");

    // 2) completed — the log rows behind the second bar. The join is a raw
    //    table (no `ActivityLog` relation exists on `Issue`), and the window
    //    keys off `al.created_at`, NOT `issue.created_at`.
    const completedQb = this.baseQb(scope, uid, statusId, companyIds)
      .innerJoin("activity_logs", "al", "al.entity_id = issue.id")
      .andWhere("al.action = 'card.moved'")
      .andWhere(DONE_MOVE_MATCH, doneMoveParams());
    window(completedQb, "al.created_at");

    const [createdRaw, completedRaw] = await Promise.all([
      countByBucket(createdQb, "issue.created_at"),
      countByBucket(completedQb, "al.created_at"),
    ]);

    const merged = new Map<string, DashboardTrendRow>();
    const rowFor = (bucket: string): DashboardTrendRow => {
      let row = merged.get(bucket);
      if (!row) {
        row = { bucket, created: 0, completed: 0 };
        merged.set(bucket, row);
      }
      return row;
    };
    for (const r of createdRaw) rowFor(String(r.bucket)).created = num(r.count);
    for (const r of completedRaw) rowFor(String(r.bucket)).completed = num(r.count);
    return [...merged.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  /**
   * The issues behind one trend bar — GET /dashboard/trend-issues.
   *
   * Same `baseQb` (scope + the page's status cross-filter + its company
   * filter) and the very same Bangkok `date_trunc` expression as
   * `trendCounts`, so the list always adds up to the number on the bar — for
   * BOTH series: `created` buckets `issue.created_at` (the default, so old
   * callers keep their behaviour), `completed` buckets the move's own
   * `al.created_at` behind the second bar. Rows are capped: a bucket can
   * never return more than TREND_ISSUES_LIMIT.
   */
  async trendIssues(
    requestedScope: DashboardScope,
    period: DashboardPeriod,
    bucket: string,
    user?: AuthUser | null,
    statusId?: number,
    companyIds?: number[],
    series: DashboardTrendSeries = "created",
  ): Promise<DashboardTrendIssue[]> {
    if (!YMD_RE.test(bucket)) {
      throw new BadRequestException("bucket must be a yyyy-mm-dd date");
    }
    const scope = await this.effectiveScope(requestedScope, user);
    const uid = Number(user?.id ?? 0);
    const qb = this.baseQb(scope, uid, statusId, companyIds);
    if (series === "completed") {
      // one row per completion — a card that entered the column twice in the
      // same bucket still comes back once (`getMany` groups by primary key)
      qb.innerJoin("activity_logs", "al", "al.entity_id = issue.id")
        .andWhere("al.action = 'card.moved'")
        .andWhere(DONE_MOVE_MATCH, doneMoveParams())
        .andWhere(
          `to_char(date_trunc('${period}', al.created_at AT TIME ZONE '${TREND_TIMEZONE}'), 'YYYY-MM-DD') = :bucket`,
          { bucket },
        )
        // newest completion first — the mirror of the created list's order
        .orderBy("al.created_at", "DESC")
        .addOrderBy("al.id", "DESC");
    } else {
      qb.andWhere(
        `to_char(date_trunc('${period}', issue.created_at AT TIME ZONE '${TREND_TIMEZONE}'), 'YYYY-MM-DD') = :bucket`,
        { bucket },
      )
        .orderBy("issue.created_at", "DESC")
        .addOrderBy("issue.id", "DESC");
    }
    const rows = await qb
      .leftJoinAndSelect("issue.status", "status")
      .leftJoinAndSelect("issue.priority", "priority")
      .leftJoinAndSelect("issue.customer", "customer")
      .leftJoinAndSelect("issue.programmer", "programmer")
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
   * `id=none` is the "no app / no category" slice (`*_id IS NULL`) — it has
   * no id, and a dead legend button would hide the very cards the slice counts.
   * `statusId` is the page's cross-filter and rides along for the same reason
   * — the list must match the filtered slice it came from (the client leaves
   * it out when `dim` itself is the status filter, so the two never conflict)
   * — and `companyIds` rides along for the very same reason. Same `baseQb`
   * scope and the same 200-row cap as the trend drill-down, so
   * a personal scope can never leak someone else's cards here either.
   */
  async dimensionIssues(
    requestedScope: DashboardScope,
    dim: string,
    id: string,
    app: string | undefined,
    user?: AuthUser | null,
    statusId?: number,
    companyIds?: number[],
  ): Promise<DashboardTrendIssue[]> {
    const dimName = parseDim(dim);
    const none = id === "none";
    const dimId = none ? null : parsePositiveId(id, "id");
    const parentAppId = app == null || app === "" ? null : parsePositiveId(app, "app");
    const scope = await this.effectiveScope(requestedScope, user);
    const uid = Number(user?.id ?? 0);

    // `id=none` → the NULL slice; dimName is already validated by parseDim
    const qb = none
      ? this.baseQb(scope, uid, statusId, companyIds).andWhere(
          `issue.${dimName}_id IS NULL`,
        )
      : this.baseQb(scope, uid, statusId, companyIds).andWhere(
          `issue.${dimName}_id = :dimId`,
          { dimId },
        );
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
   * Per-programmer load: open cards (not yet in the done column) — the card
   * answers "who is holding what right now", so finished work counts for
   * nothing here. Busiest open load first (person.id breaks ties so equal
   * loads keep a stable order). The programmer's position rides along so the
   * client can build its filter dropdown from this list alone — no second
   * request, no `position.view` needed.
   * Programmers only (role = 'programmer').
   * Only computed for overview readers (scope "all"); everyone else gets [].
   */
  private async workload(
    scope: DashboardScope,
    uid: number,
    statusId?: number,
    companyIds?: number[],
  ): Promise<DashboardWorkloadRow[]> {
    if (scope !== "all") return [];
    const openFilter = `COALESCE(issue.status_id, 0) <> ${DONE_STATUS_ID}`;
    const raw = await this.baseQb(scope, uid, statusId, companyIds)
      .innerJoin("issue.programmer", "person")
      .innerJoin("person.role", "role")
      .leftJoin("person.position", "pos")
      .andWhere("role.name = :roleName", { roleName: "programmer" })
      .select("person.id", "userId")
      .addSelect("COALESCE(NULLIF(TRIM(person.name), ''), person.email)", "name")
      .addSelect(`COUNT(*) FILTER (WHERE ${openFilter})::int`, "openCount")
      .addSelect("pos.id", "positionId")
      .addSelect("pos.name", "positionName")
      .groupBy("person.id")
      // pos.* is not functionally dependent on person.id — name it explicitly
      .addGroupBy("pos.id")
      .addGroupBy("pos.name")
      .orderBy(`COUNT(*) FILTER (WHERE ${openFilter})`, "DESC")
      // ties on open load fall back to a stable order (no hours to rank by)
      .addOrderBy("person.id", "ASC")
      .getRawMany();
    return raw.map((r) => ({
      userId: Number(r.userId),
      name: String(r.name ?? ""),
      openCount: num(r.openCount),
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
   *
   * `companyIds` is a **data scope** instead (like `scope`): it narrows EVERY
   * aggregate including `statuses` + `total`, so picking a company re-cuts the
   * whole page — ring, priorities, usage, trend and workload alike. The list
   * is echoed back so the client renders what the server really applied.
   */
  async summary(
    requestedScope: DashboardScope,
    period: DashboardPeriod,
    user?: AuthUser | null,
    range: DashboardRange = {},
    statusId?: number,
    companyIds: number[] = [],
  ): Promise<DashboardSummary> {
    const scope = await this.effectiveScope(requestedScope, user);
    const uid = Number(user?.id ?? 0);
    const companies = companyIds.length > 0 ? companyIds : [];

    const [total, statuses, priorities, apps, categories, trend, workload] = await Promise.all([
      // the ring's context pair — total + statuses are NEVER narrowed by the
      // cross-filter, so the card that sets it never changes its own numbers
      // (the company scope DOES narrow them — see the docblock above)
      this.baseQb(scope, uid, undefined, companies).getCount(),
      this.statusCounts(scope, uid, companies), // never narrowed by statusId — it is the chart that sets the filter
      this.priorityCounts(scope, uid, statusId, companies),
      this.appCounts(scope, uid, statusId, companies),
      this.categoryCounts(scope, uid, statusId, companies),
      this.trendCounts(scope, uid, period, range, statusId, companies),
      this.workload(scope, uid, statusId, companies),
    ]);

    return {
      scope,
      period,
      from: range.from ?? null,
      to: range.to ?? null,
      statusId: statusId ?? null,
      companyIds: companies,
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
