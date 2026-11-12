"use client";

import { cloneElement, Fragment, isValidElement } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useLocale, useTranslations } from "next-intl";
import DataTable, {
  DataTableHead,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from "@/components/data-table";
import { SORTABLE_FIELDS, periodUsedOf } from "@/lib/reports-api";
import type { DeductionState, PeriodUsage, UsageCount } from "@/lib/apps-api";
import type { ReportColumnDef } from "./report-columns";
import type {
  CompanyRow,
  IssueRow,
  ReportRows,
  ReportView,
  SortState,
  SummaryRow,
} from "@/lib/reports-api";
import { formatDay } from "@/lib/app-expiry";

/** Fields that sort newest/biggest first when first clicked. */
const DESC_DEFAULT_FIELDS = new Set([
  "hoursActual",
  "hoursEntered",
  "issueCount",
  "openCount",
  "minutes",
  "medianActualMinutes",
  "medianEnteredMinutes",
  "createdAt",
  "startedAt",
]);

/**
 * Minimum width (px) per column — dates and names never get squeezed, and
 * once the columns add up past the table box the table overflows it, which
 * is what makes the container's horizontal scrollbar (DataTable's
 * overflowX: auto) appear, MUI Data Grid style. Applied on the header cell,
 * which sets the column's floor in auto table layout.
 */
const COL_MIN: Record<string, number> = {
  // issues
  index: 60,
  issueNumber: 110,
  receivedAt: 150,
  assignee: 130,
  reporter: 130,
  title: 220,
  description: 200,
  analysis: 200,
  resolution: 200,
  workStarted: 150,
  workEnded: 150,
  duration: 160,
  enteredTime: 160,
  operators: 160,
  status: 130,
  category: 130,
  app: 130,
  company: 160,
  // ประเภทสัญญา (ต่ออายุ / ซื้อชั่วโมง) — chip ขอบบาง กว้างพอไม่ให้ตัดคำ
  kind: 130,
  maHours: 110,
  remaining: 110,
  // company view — วันที่สัญญา + ใช้ไป/คงเหลือ (รายรอบของแถว)
  startedAt: 130,
  expiresAt: 130,
  usedHours: 150,
  // จำนวนงานที่ถูกตัดจากรอบนั้น (ระดับแถว — แถวละ 1 รอบ) + ลูกศรกางรายการ
  deductedCount: 150,
  priority: 130,
  // summaries
  person: 150,
  issueCount: 110,
  openCount: 110,
  hoursActual: 150,
  hoursEntered: 150,
  medianActualMinutes: 150,
  medianEnteredMinutes: 150,
  lastAt: 120,
  topAssignee: 150,
};

/** Fallback floor for a key the table above doesn't know. */
const COL_MIN_DEFAULT = 120;

export interface ReportsTableProps {
  view: ReportView;
  rows: ReportRows[];
  total: number;
  /** Current page + size — drive the running row numbers in the issues view. */
  page: number;
  limit: number;
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  /** Column keys the user hid via the toolbar — both headers and cells honor it. */
  hidden: Set<string>;
  /** Columns for this view in the user's display order (pinned first). */
  columns: ReportColumnDef[];
  /** Person-detail table's hidden keys — same menu, its own section. */
  detailHidden: Set<string>;
  /** Person-detail table's columns in display order (ลำดับ pinned first). */
  detailColumns: ReportColumnDef[];
  expandedPersonId: number | null;
  personTasks: IssueRow[] | null;
  personTasksLoading: boolean;
  onTogglePerson: (personId: number) => void;
  /**
   * **รายการที่ถูกตัดจากช่วง MA** (view ตามบริษัท ที่แถว = 1 รอบ)
   *
   * - `counts` — `GET /apps/usage-counts` ยิงครั้งเดียวตอนเปิด view (ไม่ใช่ต่อแถว):
   *   ให้ทั้ง **จำนวนรายการที่ตัด** และ **"ใช้ไป" รายรอบของแถวนั้น** ซึ่งเป็น
   *   ตัวส่วนของ คงเหลือ = MA − ใช้ไป (เดิมใช้ map ระดับ**คู่** ต่างหาก → แถวที่
   *   เพิ่งซื้อชั่วโม์โชว์ "ใช้ไป 40 / คงเหลือ 0" ทั้งที่ยังไม่ได้ใช้ — ผู้ใช้ทัก
   *   จึงเปลี่ยนเป็นรายรอบทุกหน้า) · `status` แยก "ยังโหลด" (`…`) ออก "ดึงไม่ได้"
   *   (`—`) ออก "0 รายการ" ให้ชัด (ห้ามเดา)
   * - `detail` — รายการจริงของรอบที่กาง (`GET /apps/:id/companies/:recordId/usage`)
   *   **โหลดตอนกดกางเท่านั้น** ไม่ยิงตอนเปิด view
   */
  deductions: {
    counts: { status: "loading" | "ready" | "error"; byRecord: Map<number, UsageCount> };
    expandedRecordId: number | null;
    detail: DeductionState;
    onToggle: (recordId: number) => void;
    onRetryDetail: () => void;
  };
}

/**
 * The single table of the reports page — columns follow the order the user
 * set in the show/hide menu, headers sort where the view supports it, and in
 * the assignee view a row expands into that person's tasks with ชั่วโมงจริง
 * vs ชั่วโมงกรอก.
 */
export function ReportsTable({
  view,
  rows,
  total,
  page,
  limit,
  sort,
  onSortChange,
  hidden,
  columns,
  detailHidden,
  detailColumns,
  expandedPersonId,
  personTasks,
  personTasksLoading,
  onTogglePerson,
  deductions,
}: ReportsTableProps) {
  const t = useTranslations("Reports");
  /** คีย์ร่วมกับป๊อปอัพ `/systems` — คำของฟีเจอร์ "รายการที่ตัด" ชุดเดียวกัน */
  const st = useTranslations("Settings");
  const deductionTaskTypes = useTranslations("Boards");
  const theme = useTheme();
  const locale = useLocale();

  /** The grid: ordered columns the user hasn't hidden. */
  const visible = columns.filter((c) => !hidden.has(c.key));
  /** The expanded person row must span however many columns remain. */
  const assigneeSpan = visible.length;
  /** The person-detail table: same show/hide menu, its own section. */
  const detailVisible = detailColumns.filter((c) => !detailHidden.has(c.key));

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { dateStyle: "short" });

  /** ปัดเศษ 1 ตำแหน่ง — ชั่วโมงกรอกอาจมีเศษทศนิยม (วินาที → ชม.) */
  const round1 = (n: number): number => Math.round(n * 10) / 10;

  /** "0 ชั่วโมง 20 นาที" — the sheet's duration wording, localized. */
  const fmtDuration = (totalSeconds: number) => {
    const totalMinutes = Math.round((totalSeconds || 0) / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${t("duration.hours", { h })} ${t("duration.minutes", { m })}`;
  };

  /** Plain label (or an em dash) — no colored dots or chips in the tables. */
  const cellText = (value: string | null) =>
    value ? (
      <Typography variant="body2">{value}</Typography>
    ) : (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );

  /** Long free-text cell: single line, ellipsis, full text on hover. */
  const longText = (value: string | null) =>
    value ? (
      <Typography variant="body2" noWrap title={value} sx={{ maxWidth: 230 }}>
        {value}
      </Typography>
    ) : (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );

  const personCell = (name: string) => <Typography variant="body2">{name}</Typography>;

  /* ---------------- contract cells (ชั่วโมง MA / คงเหลือ) ---------------- */

  /** จุดว่างกลางเซลล์ — ใช้ทุกครั้งที่ "ยังไม่มีค่าจะโชว์" */
  const dash = (
    <Typography variant="body2" color="text.secondary">
      —
    </Typography>
  );

  /** จับรอยว่า "ยังไม่กรอก" — ต่างจาก `0` ที่หมายถึงตกลง 0 ชม. จริง ๆ */
  const notSet = (
    <Typography variant="caption" color="text.disabled">
      {t("columns.maNotSet")}
    </Typography>
  );

  /**
   * คอลัมน์ "ชั่วโมง MA" (view ตามบริษัท) — **per-row** คือค่าของแถว (1 ช่วงเวลา)
   * นั้นเอง ไม่ใช่ผลรวมของแอป (ต่างจาก "ใช้ไป" ที่เป็นของ**รอบนั้น** — คนละค่ากันทุกแถว) แอป×บริษัท)
   */
  const maHoursCell = (ma: number | null) =>
    ma == null ? notSet : <Typography variant="body2">{ma}</Typography>;

  /**
   * คีย์ `recordId` ของ `usage-counts` ที่ยิงมา — **แหล่งของ "ใช้ไป" และ "คงเหลือ"**
   * (รายรอบ ไม่ใช่ยอดรวมคู่) · `null` = ยังโหลด → ทุกช่องโชว์ `—` **ไม่ใช่ 0**
   */
  const countsMap =
    deductions.counts.status === "loading" ? null : deductions.counts.byRecord;

  /**
   * คอลัมน์ "ใช้ไป" (view ตามบริษัท) — **รายรอบของแถวนั้น** อ่านจาก
   * `periodUsedOf(countsMap, recordId)` เพราะแถว = 1 รอบ (`usage-counts` ยิง
   * ครั้งเดียวต่อหน้า ไม่ใช่ต่อแถว)
   *
   * **ไม่ใช่ยอดรวมของคู่** — งานที่กรอก*ก่อน*รอบนั้นจะถูกสร้าง (`pickPeriodId`)
   * = ของรอบก่อนหน้า → แถวที่เพิ่งซื้อชั่วโม์ (ยังไม่ได้ใช้) โชว์ 0 · ยังโหลด /
   * ดึงไม่ได้ / ไม่รู้จักแถวนั้น → `—` (**ห้าม**โชว์ 0 เพราะ "ยังไม่รู้" กับ
   * "ใช้ไป 0 ชม." เป็นคนละเรื่อง) · ปิดหัก MA (`MA_DEDUCTION_PAUSED`) → 0 ให้เอง
   */
  const usedHoursCell = (recordId: number | null) => {
    // แอปยังไม่ผูกบริษัท (`recordId = null`) = ไม่มีรอบให้ถาม → ไม่รู้ค่า
    if (recordId == null) return dash;
    const used = periodUsedOf(countsMap, recordId);
    if (used === null) return dash;
    return <Typography variant="body2">{used}</Typography>;
  };

  /**
   * คอลัมน์ "คงเหลือ" = MA ของแถวนั้น − **ใช้ไปของรอบนั้น** — แยก 3 กรณี:
   * - ยังโหลด/ดึง "ใช้ไป" ไม่ได้ → `—` (**ไม่ใช่** "ยังไม่กรอก" และไม่ใช่ตัวเลข
   *   เพราะถ้าโชว์ MA เต็มก้อนทั้งที่ยังไม่รู้ค่าจริงจะเป็นการโกง)
   * - ยังไม่กรอก MA → "ยังไม่กรอก"
   * - อย่างอื่น → ตัวเลขปัด 1 ตำแหน่ง
   *
   * ค่าเดียวกับคอลัมน์ "คงเหลือ" ของ `/systems` (จอ/CSV/PDF อ่านชุดเดียวกัน)
   */
  const remainingCell = (recordId: number | null, ma: number | null) => {
    if (ma == null) return notSet;
    // แอปยังไม่ผูกบริษัท = ไม่มีรอบ → ห้ามเดา 0 (โชว์ `—`)
    if (recordId == null) return dash;
    const used = periodUsedOf(countsMap, recordId);
    if (used === null) return dash;
    return <Typography variant="body2">{round1(ma - used)}</Typography>;
  };

  const th = (field: string, label: string, numeric = false) => {
    const sortable = SORTABLE_FIELDS[view].includes(field);
    const active = sortable && sort.field === field;
    const direction = active
      ? sort.dir
      : DESC_DEFAULT_FIELDS.has(field)
        ? "desc"
        : "asc";
    const handleClick = () => {
      if (!sortable) return;
      const nextDir = active
        ? sort.dir === "asc"
          ? "desc"
          : "asc"
        : DESC_DEFAULT_FIELDS.has(field)
          ? "desc"
          : "asc";
      onSortChange({ field, dir: nextDir });
    };
    return (
      <DataTableCell align={numeric ? "right" : "left"} sx={{ whiteSpace: "nowrap" }}>
        {sortable ? (
          <TableSortLabel active={active} direction={direction} onClick={handleClick}>
            {label}
          </TableSortLabel>
        ) : (
          label
        )}
      </DataTableCell>
    );
  };

  /* ---------------- header cell per column key ---------------- */

  function headCell(key: string): React.ReactNode {
    switch (view) {
      case "issues":
        switch (key) {
          case "index":
            return <DataTableCell>{t("columns.index")}</DataTableCell>;
          case "issueNumber":
            return <DataTableCell>{t("columns.issueNumber")}</DataTableCell>;
          case "receivedAt":
            return th("receivedAt", t("columns.receivedAt"));
          case "assignee":
            return th("assigneeName", t("columns.assignee"));
          case "reporter":
            return <DataTableCell>{t("columns.reporter")}</DataTableCell>;
          case "title":
            return th("title", t("columns.title"));
          case "description":
            return <DataTableCell>{t("columns.description")}</DataTableCell>;
          case "analysis":
            return <DataTableCell>{t("columns.analysisCause")}</DataTableCell>;
          case "resolution":
            return <DataTableCell>{t("columns.resolution")}</DataTableCell>;
          case "workStarted":
            return <DataTableCell>{t("columns.workStarted")}</DataTableCell>;
          case "workEnded":
            return <DataTableCell>{t("columns.workEnded")}</DataTableCell>;
          case "duration":
            return <DataTableCell align="right">{t("columns.duration")}</DataTableCell>;
          case "enteredTime":
            return <DataTableCell align="right">{t("columns.enteredTime")}</DataTableCell>;
          case "operators":
            return <DataTableCell>{t("columns.operators")}</DataTableCell>;
          case "status":
            return <DataTableCell>{t("columns.status")}</DataTableCell>;
          case "category":
            return <DataTableCell>{t("columns.category")}</DataTableCell>;
          case "app":
            return <DataTableCell>{t("columns.app")}</DataTableCell>;
          case "company":
            return <DataTableCell>{t("columns.company")}</DataTableCell>;
          case "priority":
            return <DataTableCell>{t("columns.priority")}</DataTableCell>;
          default:
            return null;
        }
      case "assignee":
        switch (key) {
          case "person":
            return th("label", t("columns.person"));
          case "issueCount":
            return th("issueCount", t("columns.issueCount"), true);
          case "openCount":
            return th("openCount", t("columns.openCount"), true);
          case "hoursActual":
            return th("hoursActual", t("columns.hoursActual"), true);
          case "hoursEntered":
            return th("hoursEntered", t("columns.hoursEntered"), true);
          case "lastAt":
            return <DataTableCell>{t("columns.lastAt")}</DataTableCell>;
          default:
            return null;
        }
      case "app":
        switch (key) {
          case "app":
            return th("label", t("columns.app"));
          case "issueCount":
            return th("issueCount", t("columns.issueCount"), true);
          case "openCount":
            return th("openCount", t("columns.openCount"), true);
          // ชั่วโมงของ view นี้เป็น**ผลรวม**ต่อแอป (เดิมเป็น median — ดู report-columns.ts)
          case "hoursActual":
            return th("hoursActual", t("columns.hoursActual"), true);
          case "hoursEntered":
            return th("hoursEntered", t("columns.hoursEntered"), true);
          case "topAssignee":
            return <DataTableCell>{t("columns.topAssignee")}</DataTableCell>;
          case "lastAt":
            return <DataTableCell>{t("columns.lastAt")}</DataTableCell>;
          default:
            return null;
        }
      case "company":
        switch (key) {
          case "company":
            return th("companyName", t("columns.company"));
          case "app":
            return th("appName", t("columns.app"));
          /**
           * ประเภทสัญญา (ต่ออายุ / ซื้อชั่วโมง) — ไม่ sortable: ค่าเป็น
           * หมวด (renew/buy) เรียง alphabetically ไม่มีความหมาย เหมือน
           * `deductedCount` ที่อยู่ติดกัน
           */
          case "kind":
            return <DataTableCell>{t("columns.type")}</DataTableCell>;
          case "startedAt":
            return th("startedAt", t("columns.startedAt"));
          case "expiresAt":
            return th("expiresAt", t("columns.expiresAt"));
          case "maHours":
            return th("maHours", t("columns.maHours"), true);
          // ระดับแอป ไม่ใช่ระดับแถว → ไม่เรียงได้ (ค่าเดียวซ้ำได้หลายแถว)
          case "usedHours":
            return <DataTableCell align="right">{t("columns.usedHours")}</DataTableCell>;
          case "remaining":
            return <DataTableCell align="right">{t("columns.remaining")}</DataTableCell>;
          /**
           * **รายการที่ตัด** — ระดับแถว (แถว = 1 รอบ) แต่ค่ามาจากการยิง
           * `usage-counts` ฝั่ง client จึงเรียงใน SQL ไม่ได้ → ไม่ sortable
           * เหมือน `usedHours` / `remaining` ที่อยู่ติดกัน
           */
          case "deductedCount":
            return <DataTableCell align="right">{t("columns.deductedCount")}</DataTableCell>;
          default:
            return null;
        }
      default:
        return null;
    }
  }

  /**
   * Merges the column's min width onto the header cell `headCell` returned —
   * an sx array lets MUI combine the cell's existing sx (e.g. nowrap in
   * `th`) with the new floor instead of replacing it.
   */
  const withMinWidth = (node: React.ReactNode, min: number): React.ReactNode => {
    if (!isValidElement(node)) return node;
    const el = node as React.ReactElement<Record<string, unknown>>;
    return cloneElement(el, { sx: [el.props.sx, { minWidth: min }] });
  };

  function headCells(): React.ReactNode {
    return visible.map((c) => (
      <Fragment key={c.key}>{withMinWidth(headCell(c.key), COL_MIN[c.key] ?? COL_MIN_DEFAULT)}</Fragment>
    ));
  }

  /* ---------------- assignee detail (expanded person) ---------------- */

  /** Header label for one person-detail column key (registry-driven). */
  function detailHead(key: string): string {
    switch (key) {
      case "index":
        return t("columns.index");
      case "title":
        return t("columns.title");
      case "status":
        return t("columns.status");
      case "category":
        return t("columns.category");
      case "hoursActual":
        return t("columns.hoursActual");
      case "hoursEntered":
        return t("columns.hoursEntered");
      default:
        return "";
    }
  }

  /** Body cell for one person-detail column key — same formatting as before. */
  function detailCell(key: string, task: IssueRow, i: number): React.ReactNode {
    switch (key) {
      case "index":
        return (
          <TableCell sx={{ fontSize: 12.5, color: "text.secondary" }}>{i + 1}</TableCell>
        );
      case "title":
        return <TableCell sx={{ fontSize: 12.5, fontWeight: 600 }}>{task.title}</TableCell>;
      case "status":
        return <TableCell>{cellText(task.statusName)}</TableCell>;
      case "category":
        return <TableCell sx={{ fontSize: 12.5 }}>{task.categoryName ?? "—"}</TableCell>;
      case "hoursActual":
        return (
          <TableCell align="right" sx={{ fontSize: 12.5 }}>
            {fmtDuration(task.hoursActual * 3600)}
          </TableCell>
        );
      case "hoursEntered":
        return (
          <TableCell align="right" sx={{ fontSize: 12.5 }}>
            {fmtDuration(task.hoursEntered * 3600)}
          </TableCell>
        );
      default:
        return null;
    }
  }

  function detailRow(row: SummaryRow): React.ReactNode {
    if (expandedPersonId !== row.personId || row.personId == null || row.isTotal) return null;
    return (
      <DataTableRow key="detail">
        <DataTableCell colSpan={assigneeSpan} sx={{ py: 2, bgcolor: "background.default" }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            {t("detail.tasksOf", { name: row.label ?? "" })}
          </Typography>
          {personTasksLoading ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.5 }}>
              <CircularProgress size={18} />
              <Typography variant="caption" color="text.secondary">
                {t("states.loading")}
              </Typography>
            </Box>
          ) : !personTasks || personTasks.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              {t("detail.noTasks")}
            </Typography>
          ) : (
            <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {detailVisible.map((c) => (
                      <TableCell
                        key={c.key}
                        align={c.key === "hoursActual" || c.key === "hoursEntered" ? "right" : "left"}
                        sx={{
                          bgcolor: theme.custom.tableStripe,
                          fontWeight: 700,
                          fontSize: 11.5,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {detailHead(c.key)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {personTasks.map((task, i) => {
                    return (
                      <TableRow key={task.id}>
                        {detailVisible.map((c) => (
                          <Fragment key={c.key}>{detailCell(c.key, task, i)}</Fragment>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}
        </DataTableCell>
      </DataTableRow>
    );
  }

  /* ---------------- body cell per column key ---------------- */

  function issueCell(key: string, r: IssueRow, i: number): React.ReactNode {
    switch (key) {
      case "index":
        return (
          <DataTableCell sx={{ whiteSpace: "nowrap", color: "text.secondary" }}>
            {(page - 1) * limit + i + 1}
          </DataTableCell>
        );
      case "issueNumber":
        return (
          <DataTableCell sx={{ whiteSpace: "nowrap" }}>
            {r.issueNumber ? `#${r.issueNumber}` : "—"}
          </DataTableCell>
        );
      case "receivedAt":
        return (
          <DataTableCell sx={{ whiteSpace: "nowrap" }}>
            {r.receivedAt ? fmtDateTime(r.receivedAt) : "—"}
          </DataTableCell>
        );
      case "assignee":
        return (
          <DataTableCell>
            {r.assigneeName ? (
              personCell(r.assigneeName)
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t("columns.unassigned")}
              </Typography>
            )}
          </DataTableCell>
        );
      case "reporter":
        return <DataTableCell>{r.reporterName ?? "—"}</DataTableCell>;
      case "title":
        return (
          <DataTableCell sx={{ maxWidth: 300, whiteSpace: "normal" }}>
            <Typography variant="body2">{r.title}</Typography>
          </DataTableCell>
        );
      case "description":
        return <DataTableCell>{longText(r.description)}</DataTableCell>;
      case "analysis":
        return <DataTableCell>{longText(r.analysisCause)}</DataTableCell>;
      case "resolution":
        return <DataTableCell>{longText(r.resolution)}</DataTableCell>;
      case "workStarted":
        return (
          <DataTableCell sx={{ whiteSpace: "nowrap" }}>
            {r.workStartedAt ? fmtDateTime(r.workStartedAt) : "—"}
          </DataTableCell>
        );
      case "workEnded":
        return (
          <DataTableCell sx={{ whiteSpace: "nowrap" }}>
            {r.workEndedAt ? fmtDateTime(r.workEndedAt) : "—"}
          </DataTableCell>
        );
      case "duration":
        return (
          <DataTableCell align="right" sx={{ whiteSpace: "nowrap" }}>
            {fmtDuration(r.durationSeconds)}
          </DataTableCell>
        );
      case "enteredTime":
        return (
          <DataTableCell align="right" sx={{ whiteSpace: "nowrap" }}>
            {fmtDuration(Math.round(r.hoursEntered * 3600))}
          </DataTableCell>
        );
      case "operators":
        return (
          <DataTableCell sx={{ maxWidth: 170, whiteSpace: "normal" }}>
            {r.operatorNames?.length ? r.operatorNames.join(", ") : "—"}
          </DataTableCell>
        );
      case "status":
        return <DataTableCell>{cellText(r.statusName)}</DataTableCell>;
      case "category":
        return <DataTableCell>{r.categoryName ?? "—"}</DataTableCell>;
      case "app":
        return <DataTableCell>{r.appName ?? "—"}</DataTableCell>;
      case "company":
        /**
         * คอลัมน์ "บริษัท" (view รายการปัญหา) — **บริษัทของผู้แจ้งงาน**
         * (`IssueRow.companyName`), 1 คน = 1 บริษัท — ไม่ใช่ชื่อบริษัททั้งหมด
         * ที่แอปของงานผูกไว้อีกแล้ว · ไม่มีผู้แจ้ง / ผู้แจ้งไม่มีบริษัท → `—`
         * (และถูกตัดออกทันทีที่เปิดตัวกรองบริษัท — เหมือนบอร์ด)
         */
        return <DataTableCell>{cellText(r.companyName)}</DataTableCell>;
      case "priority":
        return <DataTableCell>{cellText(r.priorityName)}</DataTableCell>;
      default:
        return null;
    }
  }

  function assigneeCell(
    key: string,
    r: SummaryRow,
    ctx: { expandable: boolean; open: boolean },
  ): React.ReactNode {
    const { expandable, open } = ctx;
    switch (key) {
      case "person":
        return (
          <DataTableCell>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {expandable && (
                <KeyboardArrowDownIcon
                  sx={{
                    fontSize: 18,
                    color: open ? "primary.main" : "text.secondary",
                    transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform .15s",
                  }}
                />
              )}
              {r.isTotal ? (
                <Typography variant="body2" fontWeight={700}>
                  {t("columns.total")}
                </Typography>
              ) : r.labelKey ? (
                <Typography variant="body2" color="text.secondary">
                  {t(`columns.${r.labelKey}`)}
                </Typography>
              ) : (
                personCell(r.label ?? "—")
              )}
            </Box>
          </DataTableCell>
        );
      case "issueCount":
        return <DataTableCell align="right">{r.issueCount}</DataTableCell>;
      case "openCount":
        return <DataTableCell align="right">{r.openCount}</DataTableCell>;
      case "hoursActual":
        return <DataTableCell align="right">{fmtDuration(r.hoursActual * 3600)}</DataTableCell>;
      case "hoursEntered":
        return <DataTableCell align="right">{fmtDuration(r.hoursEntered * 3600)}</DataTableCell>;
      case "lastAt":
        return (
          <DataTableCell sx={{ whiteSpace: "nowrap" }}>
            {r.lastAt ? fmtDate(r.lastAt) : "—"}
          </DataTableCell>
        );
      default:
        return null;
    }
  }

  /**
   * ตาราง **"ตามแอป"** — แถวละ 1 แอป · ชั่วโมงสองคอลัมน์เป็น**ผลรวม**
   * (`hoursActual` = จับเวลา, `hoursEntered` = กรอกเอง — SUM ต่อแอป) แสดงเป็น
   * "X ชั่วโมง Y นาที" เหมือน view ตามผู้รับผิดชอบ จึง**บวกกันตรงได้** และแถว
   * "รวมทั้งหมด" = ผลรวมทุกแถวเท่ากับอีก view เป๊ะ · เดิมเป็น median
   * (`medianActualMinutes`/`medianEnteredMinutes` ที่ API ยังส่งมาอยู่) ซึ่งบวก
   * ไม่ได้และ null ต้องโชว์ "—" — เลิกใช้แล้ว แต่ key i18n ของมันยังอยู่ (ไม่ลบ key)
   */
  function appCell(key: string, r: SummaryRow): React.ReactNode {
    switch (key) {
      case "app":
        return (
          <DataTableCell>
            {r.isTotal ? (
              <Typography variant="body2" fontWeight={700}>
                {t("columns.total")}
              </Typography>
            ) : r.labelKey ? (
              <Typography variant="body2" color="text.secondary">
                {t(`columns.${r.labelKey}`)}
              </Typography>
            ) : (
              <Typography variant="body2" fontWeight={600}>
                {r.label}
              </Typography>
            )}
          </DataTableCell>
        );
      case "issueCount":
        return <DataTableCell align="right">{r.issueCount}</DataTableCell>;
      case "openCount":
        return <DataTableCell align="right">{r.openCount}</DataTableCell>;
      case "hoursActual":
        return <DataTableCell align="right">{fmtDuration(r.hoursActual * 3600)}</DataTableCell>;
      case "hoursEntered":
        return <DataTableCell align="right">{fmtDuration(r.hoursEntered * 3600)}</DataTableCell>;
      case "topAssignee":
        return <DataTableCell>{r.topAssignee ?? "—"}</DataTableCell>;
      case "lastAt":
        return (
          <DataTableCell sx={{ whiteSpace: "nowrap" }}>
            {r.lastAt ? fmtDate(r.lastAt) : "—"}
          </DataTableCell>
        );
      default:
        return null;
    }
  }

  /**
   * ตาราง **"ตามบริษัท"** — แถวละ 1 คู่ แอป×บริษัท (= 1 รอบ)
   *
   * คอลัมน์สัญญาอ่านจากตัวแถวเอง ส่วน **"ใช้ไป" / "คงเหลือ" เป็นรายรอบ** อ่าน
   * จาก `countsMap` (`usage-counts` ที่ยิงครั้งเดียวตอนเปิด view) — แถวถูกสร้าง
   * จาก `GET /apps` มาก่อน จึงต้องอ่านค่าตอน render เอง (ยังโหลด/ดึงไม่ได้ → `—`
   * **ไม่ใช่ 0**)
   */
  function companyCell(key: string, r: CompanyRow): React.ReactNode {
    switch (key) {
      case "company":
        return (
          <DataTableCell>
            {r.companyName == null ? (
              <Typography variant="body2" color="text.secondary">
                —
              </Typography>
            ) : (
              <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>
                {r.companyName}
              </Typography>
            )}
          </DataTableCell>
        );
      case "app":
        return <DataTableCell>{r.appName}</DataTableCell>;
      /**
       * **ประเภทของแถวนั้น** — chip แบบเดียวกับแท็บ "ประวัติการต่ออายุ" ใน
       * ป๊อปอัพ `/systems` (`system-detail-dialog.tsx`): ซื้อชั่วโมง = info,
       * ต่ออายุ/เพิ่มรายการ = default · ค่ามาจาก `app_companies.kind` ·
       * แอปยังไม่ผูกบริษัท (`kind == null`) → `—` ไม่เดา
       */
      case "kind":
        if (r.kind == null) {
          return (
            <DataTableCell>
              <Typography variant="body2" color="text.secondary">
                —
              </Typography>
            </DataTableCell>
          );
        }
        return (
          <DataTableCell sx={{ whiteSpace: "nowrap" }}>
            <Chip
              label={r.kind === "buy" ? st("kindBuy") : st("renew")}
              color={r.kind === "buy" ? "info" : "default"}
              size="small"
              variant="outlined"
            />
          </DataTableCell>
        );
      case "startedAt":
        // `formatDay` ไม่ใช่ `new Date()` ตรง ๆ — ค่าเป็น `YYYY-MM-DD`
        // (parse เป็น UTC midnight จะเพี้ยน 1 วันใน timezone ติดลบ)
        // และต้องโชว์ตรงกับ `/systems` ที่ใช้ตัวเดียวกับ field เดียวกัน
        return (
          <DataTableCell sx={{ whiteSpace: "nowrap" }}>
            {r.startedAt ? formatDay(r.startedAt, locale) : "—"}
          </DataTableCell>
        );
      case "expiresAt":
        return (
          <DataTableCell sx={{ whiteSpace: "nowrap" }}>
            {r.expiresAt ? formatDay(r.expiresAt, locale) : "—"}
          </DataTableCell>
        );
      case "maHours":
        return <DataTableCell align="right">{maHoursCell(r.maHours)}</DataTableCell>;
      case "usedHours":
        return <DataTableCell align="right">{usedHoursCell(r.recordId)}</DataTableCell>;
      case "remaining":
        return (
          <DataTableCell align="right">
            {remainingCell(r.recordId, r.maHours)}
          </DataTableCell>
        );
      /**
       * จำนวนงานที่ถูกตัดจากรอบนั้น — แถว = 1 รอบ (`r.recordId`) จึงนับรายรอบได้จริง
       * (คอลัมน์ "ใช้ไป" ข้าง ๆ ก็อ่านจากรอบเดียวกันแล้ว) ทั้งเซลล์เป็น **ปุ่มกาง**
       * รายการใต้แถว (คลิกที่แถวไหนก็ได้ — `bodyRows` ผูก `onClick` ไว้)
       *
       * ยังโหลด → `…` · ดึงไม่ได้ → `—` (fail-open ห้ามเดาเป็น 0) · รู้ค่า → "N รายการ"
       */
      case "deductedCount": {
        if (r.recordId == null) return <DataTableCell align="right">—</DataTableCell>;
        const entry = deductions.counts.byRecord.get(r.recordId);
        const open = deductions.expandedRecordId === r.recordId;
        const label =
          deductions.counts.status === "loading"
            ? "…"
            : entry
              ? st("deductionsCount", { n: entry.count })
              : "—";
        return (
          <DataTableCell align="right" sx={{ whiteSpace: "nowrap" }}>
            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
              <KeyboardArrowDownIcon
                sx={{
                  fontSize: 18,
                  color: open ? "primary.main" : "text.secondary",
                  transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform .15s",
                }}
              />
              <Typography variant="body2">{label}</Typography>
            </Box>
          </DataTableCell>
        );
      }
      default:
        return null;
    }
  }

  /**
   * **แถวรายละเอียดใต้แถวที่กาง** — รายการที่ถูกตัดของรอบนั้น
   * (แพตเทิร์นเดียวกับ person-detail ของ assignee view)
   *
   * 3 สถานะแยกให้ชัด: ยังโหลด (spinner) / ดึงไม่ได้ (ข้อความ + ปุ่มลองใหม่ —
   * ห้ามโชว์ "ไม่มีรายการ" เพราะนั่นคือการโกง) / สำเร็จ (หัวข้อ + ตาราง)
   */
  function companyDetailRow(r: CompanyRow): React.ReactNode {
    if (r.recordId == null || deductions.expandedRecordId !== r.recordId) return null;
    const detail = deductions.detail;

    const head = (
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
        {st("tabDeductions")}
        {detail.status === "ready"
          ? ` · ${st("deductionsCount", { n: detail.data.count })} · ${st("deductionsUsed", {
              n: detail.data.periodUsedHours,
            })}`
          : ""}
      </Typography>
    );

    const innerTable = (data: PeriodUsage) => (
      <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {(
                [
                  ["issueNo", st("deductionIssueNo"), "left"],
                  ["title", st("deductionTitle"), "left"],
                  ["type", st("deductionType"), "left"],
                  ["hours", st("deductionHours"), "right"],
                  ["at", st("deductionAt"), "left"],
                  ["assignee", st("deductionAssignee"), "left"],
                ] as const
              ).map(([key, label, align]) => (
                <TableCell
                  key={key}
                  align={align}
                  sx={{
                    bgcolor: theme.custom.tableStripe,
                    fontWeight: 700,
                    fontSize: 11.5,
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.issues.map((issue) => (
              <TableRow key={issue.id}>
                <TableCell sx={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                  {issue.issueNumber ?? "—"}
                </TableCell>
                <TableCell sx={{ fontSize: 12.5, maxWidth: 320 }}>
                  <Typography variant="body2" noWrap>
                    {issue.title}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                  {issue.taskType ? deductionTaskTypes(`taskType.${issue.taskType}`) : "—"}
                </TableCell>
                <TableCell align="right" sx={{ fontSize: 12.5 }}>
                  {issue.hours}
                </TableCell>
                <TableCell sx={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                  {issue.deductedAt ? fmtDate(issue.deductedAt) : "—"}
                </TableCell>
                <TableCell sx={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                  {issue.assigneeName ?? st("deductionUnassigned")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    );

    return (
      <DataTableRow key="deduction-detail">
        <DataTableCell colSpan={visible.length} sx={{ py: 2, bgcolor: "background.default" }}>
          {head}

          {detail.status === "loading" ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.5 }}>
              <CircularProgress size={18} />
              <Typography variant="caption" color="text.secondary">
                {st("deductionsLoading")}
              </Typography>
            </Box>
          ) : detail.status === "error" ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {st("deductionsError")}
              </Typography>
              <Button size="small" onClick={deductions.onRetryDetail}>
                {st("deductionsRetry")}
              </Button>
            </Box>
          ) : detail.data.unattributedHours > 0 ? (
            /* ชั่วโมงที่กรอกก่อนระบบ — เล่าตรง ๆ ว่าไม่ระบุรอบ ไม่เดาใส่รอบใด */
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
              {st("deductionsUnattributed", { n: detail.data.unattributedHours })}
            </Typography>
          ) : null}

          {detail.status === "ready" &&
            (detail.data.count === 0 ? (
              <Typography variant="caption" color="text.secondary">
                {st("deductionsEmpty")}
              </Typography>
            ) : (
              innerTable(detail.data)
            ))}
        </DataTableCell>
      </DataTableRow>
    );
  }

  /* ---------------- body rows per view ---------------- */

  function bodyRows(): React.ReactNode {
    switch (view) {
      case "issues":
        return (rows as IssueRow[]).map((r, i) => (
          <DataTableRow key={r.id}>
            {visible.map((c) => (
              <Fragment key={c.key}>{issueCell(c.key, r, i)}</Fragment>
            ))}
          </DataTableRow>
        ));

      case "assignee":
        return (rows as SummaryRow[]).map((r) => {
          const expandable = r.personId != null && !r.isTotal;
          const open = expandable && expandedPersonId === r.personId;
          return (
            <Fragment key={r.isTotal ? "total" : `p-${r.personId ?? "none"}`}>
              <DataTableRow
                onClick={expandable ? () => onTogglePerson(r.personId as number) : undefined}
                sx={{
                  ...(expandable ? { cursor: "pointer" } : {}),
                  ...(r.isTotal
                    ? { bgcolor: "action.hover", "& .MuiTableCell-body": { fontWeight: 700 } }
                    : {}),
                }}
              >
                {visible.map((c) => (
                  <Fragment key={c.key}>
                    {assigneeCell(c.key, r, { expandable, open })}
                  </Fragment>
                ))}
              </DataTableRow>
              {detailRow(r)}
            </Fragment>
          );
        });

      case "app":
        return (rows as SummaryRow[]).map((r) => (
          <DataTableRow
            key={r.isTotal ? "total" : `a-${r.appId ?? "none"}`}
            sx={
              r.isTotal
                ? { bgcolor: "action.hover", "& .MuiTableCell-body": { fontWeight: 700 } }
                : undefined
            }
          >
            {visible.map((c) => (
              <Fragment key={c.key}>{appCell(c.key, r)}</Fragment>
            ))}
          </DataTableRow>
        ));

      case "company":
        return (rows as CompanyRow[]).map((r, i) => {
          /**
           * **แถว = 1 รอบ** จึงกางดู "รายการที่ตัด" ของรอบนั้นได้ — แอปยังไม่ผูก
           * บริษัท (`recordId: null`) ไม่มีรอบให้ถาม จึงไม่คลิกได้
           */
          const expandable = r.recordId != null;
          const open = expandable && deductions.expandedRecordId === r.recordId;
          return (
            <Fragment key={`${r.appId}:${r.companyId ?? "none"}-${i}`}>
              <DataTableRow
                onClick={expandable ? () => deductions.onToggle(r.recordId as number) : undefined}
                sx={
                  expandable
                    ? { cursor: "pointer", ...(open ? { bgcolor: "action.hover" } : {}) }
                    : undefined
                }
              >
                {visible.map((c) => (
                  <Fragment key={c.key}>{companyCell(c.key, r)}</Fragment>
                ))}
              </DataTableRow>
              {companyDetailRow(r)}
            </Fragment>
          );
        });

      default:
        return null;
    }
  }

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.75,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="subtitle2" fontWeight={700} sx={{ color: "navy.main" }}>
            {t(`views.${view}`)}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {t("table.count", { count: total })}
        </Typography>
      </Box>
      <DataTable rounded={false}>
        <DataTableHead>
          <DataTableRow>{headCells()}</DataTableRow>
        </DataTableHead>
        <DataTableBody>{bodyRows()}</DataTableBody>
      </DataTable>
    </Box>
  );
}
