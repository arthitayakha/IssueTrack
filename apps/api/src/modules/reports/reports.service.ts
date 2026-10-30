import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, type ObjectLiteral, type SelectQueryBuilder } from "typeorm";
import { Issue } from "../issues/entities/issue.entity";
import { Comment } from "../comments/entities/comment.entity";
import { Attachment } from "../attachments/entities/attachment.entity";
import { AuthUser } from "../auth/auth-user";
import { PermissionsService } from "../permissions/permissions.service";
import { paginate, type Paginated, type PaginationParams } from "../../common/pagination";

/**
 * Reports backend — powers the /reports page.
 *
 * `GET /reports/summary`   grouped aggregates (by assignee / by category /
 *                          by app),
 *                          same filters as GET /issues, hours from
 *                          issues.tracked_duration (ชั่วโมงจริง) and
 *                          issues.actual_fix_duration (ชั่วโมงกรอก).
 * `GET /reports/activity`  comments + attachments across issues, merged into
 *                          one "who did what" feed with the shared filters.
 * `GET /reports/people`    distinct assignees / reporters occurring in
 *                          issues — the filter panel's two people lists.
 */

/** Filters shared with GET /issues — id lists already parsed by the controller. */
export interface ReportIssueFilters {
  createdFrom?: string;
  createdTo?: string;
  search?: string;
  assigneeIds?: number[];
  reporterIds?: number[];
  categoryIds?: number[];
  statuses?: number[];
  priorityIds?: number[];
  appIds?: number[];
}

/** Median minutes per issue (1 decimal); null = no task in the group has a recorded time. */
export interface SummaryMedians {
  medianActualMinutes: number | null;
  medianEnteredMinutes: number | null;
}

/**
 * A grouped row before medians are merged in — the `groupBy*` helpers only
 * produce the sums/labels; `summary()` runs the median queries and completes
 * every row, so they never return the full `SummaryRow`.
 */
type SummarySeed = Omit<SummaryRow, keyof SummaryMedians>;

/** Matches the frontend `SummaryRow` shape exactly (hours, not seconds). */
export interface SummaryRow extends SummaryMedians {
  personId?: number | null;
  categoryId?: number | null;
  appId?: number | null;
  label: string | null;
  labelKey?: "unassigned" | "total" | "noCategory" | "noApp";
  issueCount: number;
  openCount: number;
  hoursActual: number;
  hoursEntered: number;
  lastAt: string | null;
  topAssignee?: string | null;
  isTotal?: boolean;
}

/** One person for the filter panel's people lists. */
export interface ReportPerson {
  id: number;
  name: string;
}

/** GET /reports/people — assignees and reporters that actually occur in issues. */
export interface ReportPeople {
  assignees: ReportPerson[];
  reporters: ReportPerson[];
}

/** Matches the frontend `ActivityRow` shape. */
export interface ActivityRow {
  id: string;
  type: "comment" | "attachment";
  actorId: number | null;
  actorName: string;
  issueId: string;
  issueLabel: string;
  content: string;
  createdAt: string;
}

/**
 * Each activity source is capped before the in-memory merge — small teams are
 * far below this, and it keeps comments/attachments (two tables) paged as one
 * feed without a UNION query.
 */
const ACTIVITY_FETCH_CAP = 2000;

/**
 * The completion status — created as "Done", since renamed to "เสร็จสิ้น".
 * Ids do not move when names do, so open counts key off the id, not the name.
 */
const DONE_STATUS_ID = 4;

function isDay(value?: string): boolean {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dayStart(value?: string): Date | null {
  if (!isDay(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayEnd(value?: string): Date | null {
  if (!isDay(value)) return null;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function toIso(value: unknown): string {
  return new Date(value as string | number | Date).toISOString();
}

/** `#281026-002 · Title` (falls back to the raw issue id when unmapped). */
function issueLabelOf(row: {
  issueId: unknown;
  issueNumber?: string | null;
  issueTitle?: string | null;
}): string {
  const number = row.issueNumber as string | null;
  const title = row.issueTitle as string | null;
  if (!number) return `#${row.issueId}`;
  return title ? `#${number} · ${title}` : `#${number}`;
}

type RawCount = string | number;

function num(value: RawCount | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Median (ค่ากลาง) of a duration column in **minutes**, 1 decimal —
 * `PERCENTILE_CONT(0.5)` is PostgreSQL's continuous median: sort every
 * recorded duration and take the middle value, so one outlier task cannot
 * skew the group the way sum ÷ count does.
 *
 * Only tasks with a recorded time count (`> 0`): an untouched task (0 or
 * NULL) is "no data", and letting zeros into the distribution would drag the
 * median of every group toward 0. A group with no recorded time at all
 * aggregates to NULL → surfaced as `null` → the table shows "—".
 */
function medianMinutesSql(column: string): string {
  return `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${column}) FILTER (WHERE ${column} > 0)`;
}

/** Raw `percentile_cont` seconds (or NULL) → minutes with one decimal. */
function toMedianMinutes(value: unknown): number | null {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return null;
  return round1(n / 60);
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Issue)
    private readonly issues: Repository<Issue>,
    @InjectRepository(Comment)
    private readonly comments: Repository<Comment>,
    @InjectRepository(Attachment)
    private readonly attachments: Repository<Attachment>,
    private readonly permissions: PermissionsService,
  ) {}

  /** Report readers with only `issue.own.view` see their own cards (board parity). */
  private async canViewAll(user?: AuthUser | null): Promise<boolean> {
    if (!user) return true;
    const perms = await this.permissions.getUserPermissions(user.roleId, user.positionId);
    return perms.includes("issue.all.view");
  }

  /** Visibility + dimension filters on the shared `issue` alias. */
  private applyIssueDims<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    f: ReportIssueFilters,
    canViewAll: boolean,
    uid: number,
  ): void {
    if (!canViewAll) {
      qb.andWhere("(issue.programmer_id = :uid OR issue.customer_id = :uid)", { uid });
    }
    if (f.assigneeIds?.length) {
      qb.andWhere("issue.programmer_id IN (:...assigneeIds)", { assigneeIds: f.assigneeIds });
    }
    if (f.reporterIds?.length) {
      qb.andWhere("issue.customer_id IN (:...reporterIds)", { reporterIds: f.reporterIds });
    }
    if (f.categoryIds?.length) {
      qb.andWhere("issue.category_id IN (:...categoryIds)", { categoryIds: f.categoryIds });
    }
    if (f.statuses?.length) {
      qb.andWhere("issue.status_id IN (:...statuses)", { statuses: f.statuses });
    }
    if (f.priorityIds?.length) {
      qb.andWhere("issue.priority_id IN (:...priorityIds)", { priorityIds: f.priorityIds });
    }
    if (f.appIds?.length) {
      qb.andWhere("issue.app_id IN (:...appIds)", { appIds: f.appIds });
    }
  }

  private applyIssueDate(qb: SelectQueryBuilder<Issue>, f: ReportIssueFilters): void {
    const from = dayStart(f.createdFrom);
    if (from) qb.andWhere("issue.created_at >= :repFrom", { repFrom: from });
    const to = dayEnd(f.createdTo);
    if (to) qb.andWhere("issue.created_at <= :repTo", { repTo: to });
  }

  /**
   * Title/description/label search via EXISTS — the list endpoint joins the
   * M2M labels instead, but joins would multiply rows and break aggregates.
   */
  private applyIssueSearch(qb: SelectQueryBuilder<Issue>, f: ReportIssueFilters): void {
    const q = f.search?.trim();
    if (!q) return;
    qb.andWhere(
      `(issue.title ILIKE :q OR issue.description ILIKE :q
        OR EXISTS (
          SELECT 1 FROM issue_labels il
          INNER JOIN labels lb ON lb.id = il.label_id
          WHERE il.issue_id = issue.id AND lb.name ILIKE :q
        )
        OR EXISTS (
          SELECT 1 FROM labels lb2
          WHERE lb2.id = issue.label_id AND lb2.name ILIKE :q
        ))`,
      { q: `%${q}%` },
    );
  }

  /**
   * GET /reports/summary — grouped rows for the "by assignee" / "by category" /
   * "by app" views. Returns every group (tens at most); the client sorts and pages.
   * Besides the sums (hours), every row carries the **median** minutes for the
   * timer and the entered time, computed in SQL at the final group grain.
   */
  async summary(
    groupBy: "person" | "category" | "app",
    f: ReportIssueFilters,
    user?: AuthUser | null,
  ): Promise<SummaryRow[]> {
    const canViewAll = await this.canViewAll(user);
    const uid = Number(user?.id ?? 0);
    const qb = this.summaryBaseQb(f, canViewAll, uid)
      .leftJoin("issue.programmer", "person")
      .leftJoin("issue.status", "st");

    const seeds =
      groupBy === "category"
        ? await this.groupByCategory(qb)
        : groupBy === "app"
          ? await this.groupByApp(qb)
          : await this.groupByPerson(qb);
    if (seeds.length === 0) return [];

    // medians live at the group grain (one value per final row), so they are
    // their own queries — an average-of-averages / median-of-medians would be wrong
    const dimColumn =
      groupBy === "person"
        ? "issue.programmer_id"
        : groupBy === "category"
          ? "issue.category_id"
          : "issue.app_id";
    const [medians, total] = await Promise.all([
      this.mediansByGroup(dimColumn, f, canViewAll, uid),
      this.totalMedians(f, canViewAll, uid),
    ]);
    const keyOf = (r: SummarySeed): number | null =>
      groupBy === "person"
        ? (r.personId ?? null)
        : groupBy === "category"
          ? (r.categoryId ?? null)
          : (r.appId ?? null);
    const empty: SummaryMedians = { medianActualMinutes: null, medianEnteredMinutes: null };
    const rows: SummaryRow[] = seeds.map((seed) => ({
      ...seed,
      ...(medians.get(keyOf(seed)) ?? empty),
    }));

    appendTotals(rows, total);
    return rows;
  }

  /** Shared WHERE (visibility + dimension + date + search) on the bare `issue` alias. */
  private summaryBaseQb(
    f: ReportIssueFilters,
    canViewAll: boolean,
    uid: number,
  ): SelectQueryBuilder<Issue> {
    const qb = this.issues
      .createQueryBuilder("issue")
      .where("issue.deleted_at IS NULL");
    this.applyIssueDims(qb, f, canViewAll, uid);
    this.applyIssueDate(qb, f);
    this.applyIssueSearch(qb, f);
    return qb;
  }

  /**
   * Median timer / entered minutes per group key (see `medianMinutesSql`).
   * Runs against the same filters as the main query, grouped at the row grain.
   */
  private async mediansByGroup(
    dimColumn: string,
    f: ReportIssueFilters,
    canViewAll: boolean,
    uid: number,
  ): Promise<Map<number | null, SummaryMedians>> {
    const raw = await this.summaryBaseQb(f, canViewAll, uid)
      .select(dimColumn, "key")
      .addSelect(medianMinutesSql("issue.tracked_duration"), "actualMedian")
      .addSelect(medianMinutesSql("issue.actual_fix_duration"), "enteredMedian")
      .groupBy(dimColumn)
      .getRawMany();
    return new Map(
      raw.map((r) => [
        r.key == null ? null : Number(r.key),
        {
          medianActualMinutes: toMedianMinutes(r.actualMedian),
          medianEnteredMinutes: toMedianMinutes(r.enteredMedian),
        } satisfies SummaryMedians,
      ]),
    );
  }

  /** Median over every matching task — what the "รวมทั้งหมด" row shows. */
  private async totalMedians(
    f: ReportIssueFilters,
    canViewAll: boolean,
    uid: number,
  ): Promise<SummaryMedians> {
    const raw = await this.summaryBaseQb(f, canViewAll, uid)
      .select(medianMinutesSql("issue.tracked_duration"), "actualMedian")
      .addSelect(medianMinutesSql("issue.actual_fix_duration"), "enteredMedian")
      .getRawMany();
    const r = raw[0] ?? {};
    return {
      medianActualMinutes: toMedianMinutes(r.actualMedian),
      medianEnteredMinutes: toMedianMinutes(r.enteredMedian),
    };
  }

  private async groupByPerson(qb: SelectQueryBuilder<Issue>): Promise<SummarySeed[]> {
    const raw = await qb
      .select("issue.programmer_id", "key")
      .addSelect("COALESCE(NULLIF(person.name, ''), person.email)", "label")
      .addSelect("COUNT(*)::int", "issueCount")
      .addSelect(
        `COUNT(*) FILTER (WHERE COALESCE(st.id, 0) <> ${DONE_STATUS_ID})::int`,
        "openCount",
      )
      .addSelect("COALESCE(SUM(issue.tracked_duration), 0)", "actualSeconds")
      .addSelect("COALESCE(SUM(issue.actual_fix_duration), 0)", "enteredSeconds")
      .addSelect("MAX(issue.created_at)", "lastAt")
      .groupBy("issue.programmer_id")
      .addGroupBy("person.id")
      .getRawMany();

    return raw.map((r) => ({
      personId: r.key == null ? null : Number(r.key),
      label: (r.label as string | null) ?? null,
      ...(r.key == null ? { labelKey: "unassigned" as const } : {}),
      issueCount: num(r.issueCount),
      openCount: num(r.openCount),
      hoursActual: round1(num(r.actualSeconds) / 3600),
      hoursEntered: round1(num(r.enteredSeconds) / 3600),
      lastAt: r.lastAt ? toIso(r.lastAt) : null,
    }));
  }

  private async groupByCategory(qb: SelectQueryBuilder<Issue>): Promise<SummarySeed[]> {
    // grouped at (category × person) grain so each category can name the
    // person who spent the most time on it
    const raw = await qb
      .select("issue.category_id", "catKey")
      .addSelect("cat.name", "catName")
      .addSelect("issue.programmer_id", "personKey")
      .addSelect("COALESCE(NULLIF(person.name, ''), person.email)", "personLabel")
      .addSelect("COUNT(*)::int", "issueCount")
      .addSelect(
        `COUNT(*) FILTER (WHERE COALESCE(st.id, 0) <> ${DONE_STATUS_ID})::int`,
        "openCount",
      )
      .addSelect("COALESCE(SUM(issue.tracked_duration), 0)", "actualSeconds")
      .addSelect("COALESCE(SUM(issue.actual_fix_duration), 0)", "enteredSeconds")
      .addSelect("MAX(issue.created_at)", "lastAt")
      .leftJoin("issue.category", "cat")
      .groupBy("issue.category_id")
      .addGroupBy("cat.id")
      .addGroupBy("issue.programmer_id")
      .addGroupBy("person.id")
      .getRawMany();

    interface CatAgg {
      label: string | null;
      issueCount: number;
      openCount: number;
      actualSeconds: number;
      enteredSeconds: number;
      lastAt: Date | null;
      perPerson: Map<number, { label: string; hours: number }>;
    }
    const byCat = new Map<number | null, CatAgg>();

    for (const r of raw) {
      const catId = r.catKey == null ? null : Number(r.catKey);
      let agg = byCat.get(catId);
      if (!agg) {
        agg = {
          label: catId == null ? null : ((r.catName as string | null) ?? null),
          issueCount: 0,
          openCount: 0,
          actualSeconds: 0,
          enteredSeconds: 0,
          lastAt: null,
          perPerson: new Map(),
        };
        byCat.set(catId, agg);
      }
      agg.issueCount += num(r.issueCount);
      agg.openCount += num(r.openCount);
      agg.actualSeconds += num(r.actualSeconds);
      agg.enteredSeconds += num(r.enteredSeconds);
      const at = r.lastAt ? new Date(r.lastAt as string | Date) : null;
      if (at && (!agg.lastAt || at > agg.lastAt)) agg.lastAt = at;

      const personKey = r.personKey == null ? null : Number(r.personKey);
      const personLabel = r.personLabel as string | null;
      if (personKey != null && personLabel) {
        agg.perPerson.set(personKey, { label: personLabel, hours: num(r.actualSeconds) / 3600 });
      }
    }

    return [...byCat.entries()].map(([catId, agg]) => {
      let topAssignee: string | null = null;
      let topHours = -1;
      for (const person of agg.perPerson.values()) {
        if (person.hours > topHours) {
          topHours = person.hours;
          topAssignee = person.label;
        }
      }
      return {
        categoryId: catId,
        label: agg.label,
        ...(catId == null ? { labelKey: "noCategory" as const } : {}),
        issueCount: agg.issueCount,
        openCount: agg.openCount,
        hoursActual: round1(agg.actualSeconds / 3600),
        hoursEntered: round1(agg.enteredSeconds / 3600),
        lastAt: agg.lastAt ? agg.lastAt.toISOString() : null,
        topAssignee,
      };
    });
  }

  /**
   * The "by app" view — same shape as by-category but grouped on `app_id`.
   * Apps and categories are sibling dimensions (both hang off issues), so the
   * query only swaps the grouping key and the label join. Still grouped at
   * (app × person) grain so each app can name the person who spent the most
   * time on it. Median minutes come from `summary()` (own SQL at row grain).
   */
  private async groupByApp(qb: SelectQueryBuilder<Issue>): Promise<SummarySeed[]> {
    const raw = await qb
      .select("issue.app_id", "appKey")
      .addSelect("app.name", "appName")
      .addSelect("issue.programmer_id", "personKey")
      .addSelect("COALESCE(NULLIF(person.name, ''), person.email)", "personLabel")
      .addSelect("COUNT(*)::int", "issueCount")
      .addSelect(
        `COUNT(*) FILTER (WHERE COALESCE(st.id, 0) <> ${DONE_STATUS_ID})::int`,
        "openCount",
      )
      .addSelect("COALESCE(SUM(issue.tracked_duration), 0)", "actualSeconds")
      .addSelect("COALESCE(SUM(issue.actual_fix_duration), 0)", "enteredSeconds")
      .addSelect("MAX(issue.created_at)", "lastAt")
      .leftJoin("issue.app", "app")
      .groupBy("issue.app_id")
      .addGroupBy("app.id")
      .addGroupBy("issue.programmer_id")
      .addGroupBy("person.id")
      .getRawMany();

    interface AppAgg {
      label: string | null;
      issueCount: number;
      openCount: number;
      actualSeconds: number;
      enteredSeconds: number;
      lastAt: Date | null;
      perPerson: Map<number, { label: string; hours: number }>;
    }
    const byApp = new Map<number | null, AppAgg>();

    for (const r of raw) {
      const appId = r.appKey == null ? null : Number(r.appKey);
      let agg = byApp.get(appId);
      if (!agg) {
        agg = {
          label: appId == null ? null : ((r.appName as string | null) ?? null),
          issueCount: 0,
          openCount: 0,
          actualSeconds: 0,
          enteredSeconds: 0,
          lastAt: null,
          perPerson: new Map(),
        };
        byApp.set(appId, agg);
      }
      agg.issueCount += num(r.issueCount);
      agg.openCount += num(r.openCount);
      agg.actualSeconds += num(r.actualSeconds);
      agg.enteredSeconds += num(r.enteredSeconds);
      const at = r.lastAt ? new Date(r.lastAt as string | Date) : null;
      if (at && (!agg.lastAt || at > agg.lastAt)) agg.lastAt = at;

      const personKey = r.personKey == null ? null : Number(r.personKey);
      const personLabel = r.personLabel as string | null;
      if (personKey != null && personLabel) {
        agg.perPerson.set(personKey, { label: personLabel, hours: num(r.actualSeconds) / 3600 });
      }
    }

    return [...byApp.entries()].map(([appId, agg]) => {
      let topAssignee: string | null = null;
      let topHours = -1;
      for (const person of agg.perPerson.values()) {
        if (person.hours > topHours) {
          topHours = person.hours;
          topAssignee = person.label;
        }
      }
      return {
        appId,
        label: agg.label,
        ...(appId == null ? { labelKey: "noApp" as const } : {}),
        issueCount: agg.issueCount,
        openCount: agg.openCount,
        hoursActual: round1(agg.actualSeconds / 3600),
        hoursEntered: round1(agg.enteredSeconds / 3600),
        lastAt: agg.lastAt ? agg.lastAt.toISOString() : null,
        topAssignee,
      };
    });
  }

  /**
   * GET /reports/activity — comments + attachments merged into one feed.
   * Sorted and paged after the merge (both sources are capped first).
   */
  async activity(
    f: ReportIssueFilters,
    sortBy: string,
    sortOrder: string,
    params: PaginationParams,
    user?: AuthUser | null,
  ): Promise<Paginated<ActivityRow>> {
    const canViewAll = await this.canViewAll(user);
    const uid = Number(user?.id ?? 0);
    const from = dayStart(f.createdFrom);
    const to = dayEnd(f.createdTo);

    const commentsQb = this.comments
      .createQueryBuilder("c")
      .innerJoin("c.issue", "issue")
      .leftJoin("c.user", "actor")
      .select("c.id", "id")
      .addSelect("c.comment", "content")
      .addSelect("c.user_id", "actorId")
      .addSelect("actor.name", "actorName")
      .addSelect("c.issue_id", "issueId")
      .addSelect("issue.issue_number", "issueNumber")
      .addSelect("issue.title", "issueTitle")
      .addSelect("c.created_at", "createdAt")
      .where("issue.deleted_at IS NULL");
    this.applyIssueDims(commentsQb, f, canViewAll, uid);
    if (from) commentsQb.andWhere("c.created_at >= :actFrom", { actFrom: from });
    if (to) commentsQb.andWhere("c.created_at <= :actTo", { actTo: to });
    if (f.search?.trim()) {
      commentsQb.andWhere("(c.comment ILIKE :q OR issue.title ILIKE :q)", {
        q: `%${f.search.trim()}%`,
      });
    }
    const commentRows = await commentsQb
      .orderBy("c.created_at", "DESC")
      .limit(ACTIVITY_FETCH_CAP)
      .getRawMany();

    const attachmentsQb = this.attachments
      .createQueryBuilder("a")
      .innerJoin("a.issue", "issue")
      .leftJoin("a.uploadedByUser", "actor")
      .select("a.id", "id")
      .addSelect("a.file_name", "content")
      .addSelect("a.uploaded_by", "actorId")
      .addSelect("actor.name", "actorName")
      .addSelect("a.issue_id", "issueId")
      .addSelect("issue.issue_number", "issueNumber")
      .addSelect("issue.title", "issueTitle")
      .addSelect("a.created_at", "createdAt")
      .where("issue.deleted_at IS NULL");
    this.applyIssueDims(attachmentsQb, f, canViewAll, uid);
    if (from) attachmentsQb.andWhere("a.created_at >= :actFrom", { actFrom: from });
    if (to) attachmentsQb.andWhere("a.created_at <= :actTo", { actTo: to });
    if (f.search?.trim()) {
      attachmentsQb.andWhere("(a.file_name ILIKE :q OR issue.title ILIKE :q)", {
        q: `%${f.search.trim()}%`,
      });
    }
    const attachmentRows = await attachmentsQb
      .orderBy("a.created_at", "DESC")
      .limit(ACTIVITY_FETCH_CAP)
      .getRawMany();

    const rows: ActivityRow[] = [
      ...commentRows.map(
        (r): ActivityRow => ({
          id: `c-${r.id}`,
          type: "comment",
          actorId: r.actorId == null ? null : Number(r.actorId),
          actorName: (r.actorName as string | null) ?? "",
          issueId: String(r.issueId),
          issueLabel: issueLabelOf(r),
          content: (r.content as string | null) ?? "",
          createdAt: toIso(r.createdAt),
        }),
      ),
      ...attachmentRows.map(
        (r): ActivityRow => ({
          id: `a-${r.id}`,
          type: "attachment",
          actorId: r.actorId == null ? null : Number(r.actorId),
          actorName: (r.actorName as string | null) ?? "",
          issueId: String(r.issueId),
          issueLabel: issueLabelOf(r),
          content: (r.content as string | null) ?? "",
          createdAt: toIso(r.createdAt),
        }),
      ),
    ];

    const dir = sortOrder === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortBy === "actorName") {
        return dir * (a.actorName || "").localeCompare(b.actorName || "", "th");
      }
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return dir * diff || b.id.localeCompare(a.id);
    });

    return paginate(rows, params);
  }

  /**
   * GET /reports/people — the two people lists for the filter panel. Assignees
   * are the users who actually occur as `programmer_id` **and** hold the
   * `programmer` role (the section is "ผู้รับผิดชอบ" = programmers), reporters
   * are the ones who occur as `customer_id` with no role restriction. Cards
   * assigned to a non-programmer (e.g. an admin) therefore stay unfilterable
   * by design. `issue.own.view` readers only see people from their own cards.
   */
  async people(user?: AuthUser | null): Promise<ReportPeople> {
    const canViewAll = await this.canViewAll(user);
    const uid = Number(user?.id ?? 0);
    const [assignees, reporters] = await Promise.all([
      this.distinctPeople("programmer_id", "programmer", canViewAll, uid, "programmer"),
      this.distinctPeople("customer_id", "customer", canViewAll, uid),
    ]);
    return { assignees, reporters };
  }

  private async distinctPeople(
    column: "programmer_id" | "customer_id",
    relation: "programmer" | "customer",
    canViewAll: boolean,
    uid: number,
    roleName?: string,
  ): Promise<ReportPerson[]> {
    // innerJoin drops orphan FKs (card still points at a deleted user).
    const qb = this.issues
      .createQueryBuilder("issue")
      .innerJoin(`issue.${relation}`, "person")
      .select("DISTINCT person.id", "id")
      .addSelect("COALESCE(NULLIF(person.name, ''), person.email)", "name")
      .where("issue.deleted_at IS NULL")
      .andWhere(`issue.${column} IS NOT NULL`);
    if (roleName) {
      qb.innerJoin("person.role", "role").andWhere("role.name = :roleName", { roleName });
    }
    if (!canViewAll) {
      qb.andWhere("(issue.programmer_id = :uid OR issue.customer_id = :uid)", { uid });
    }
    const raw = await qb.orderBy("name", "ASC").getRawMany();
    return raw
      .filter((r) => r.id != null)
      .map((r) => ({ id: Number(r.id), name: String(r.name ?? "") }));
  }
}

/** Appends the "total" row the frontend pins at the bottom of summaries. */
function appendTotals(rows: SummaryRow[], total: SummaryMedians): void {
  if (rows.length === 0) return;
  let issueCount = 0;
  let openCount = 0;
  let actual = 0;
  let entered = 0;
  let lastAt: string | null = null;
  for (const row of rows) {
    issueCount += row.issueCount;
    openCount += row.openCount;
    actual += row.hoursActual;
    entered += row.hoursEntered;
    if (row.lastAt && (!lastAt || row.lastAt > lastAt)) lastAt = row.lastAt;
  }
  rows.push({
    ...total,
    label: null,
    labelKey: "total",
    isTotal: true,
    issueCount,
    openCount,
    hoursActual: round1(actual),
    hoursEntered: round1(entered),
    lastAt,
  });
}
