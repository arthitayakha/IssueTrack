"use client";

import { cloneElement, Fragment, isValidElement } from "react";
import {
  Box,
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
import { SORTABLE_FIELDS } from "@/lib/reports-api";
import type { AppContract } from "@/lib/reports-api";
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
import { VIEW_ICONS } from "./report-views";

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
  maHours: 110,
  remaining: 110,
  // company view — วันที่สัญญา + ชั่วโมงที่ใช้ทั้งหมด (ระดับแอป)
  startedAt: 130,
  expiresAt: 130,
  usedHours: 150,
  priority: 130,
  // summaries
  person: 150,
  issueCount: 110,
  openCount: 110,
  hoursActual: 110,
  hoursEntered: 110,
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
   * Contract facts per app (บริษัท / ชั่วโมง MA) keyed by app id — drives the
   * `company` and `maHours` columns in the issues / app views. `issues` has no
   * `company_id`, so a row only knows its company **through its app**.
   */
  contractsByApp: Map<number, AppContract>;
  /**
   * All-time "used" hours per app — the subtrahend of คงเหลือ = MA − ใช้ไป.
   * `status` distinguishes "still fetching" from "fetch failed": both must
   * render as `—`, never as MA itself (a full-MA remaining would be a lie).
   */
  usage: { status: "loading" | "ready" | "error"; byApp: Map<number, number> };
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
  contractsByApp,
  usage,
}: ReportsTableProps) {
  const t = useTranslations("Reports");
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

  /* ---------------- contract cells (บริษัท / MA / คงเหลือ) ---------------- */

  /**
   * คอลัมน์ "บริษัท" (view รายการปัญหา) — รู้ผ่านแอปเท่านั้น
   * (`issues` ไม่มี `company_id`)
   *
   * - ไม่มีแอป / แอปไม่มีบริษัท / ยังไม่ได้โหลดสัญญา → `—`
   * - ผูกหลายแห่ง → คั่นด้วย `", "` แล้วขึ้นบรรทัดใหม่ (ไม่ยุบเป็น `+N`
   *   แบบ `/systems` เพราะตารางนี้มีที่ว่างให้ wrap และ hover title
   *   อ่านชื่อครบทุกแห่งได้อยู่แล้ว)
   */
  const contractCell = (appId: number | null) => {
    const empty = (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
    if (appId == null) return empty;
    const contract = contractsByApp.get(appId);
    if (!contract || contract.companies.length === 0) return empty;
    const text = contract.companies.map((c) => c.name).join(", ");
    return (
      <Typography
        variant="body2"
        title={text}
        sx={{ overflowWrap: "anywhere", display: "block" }}
      >
        {text}
      </Typography>
    );
  };

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
   * นั้นเอง ไม่ใช่ผลรวมของแอป (ต่างจาก "ชั่วโมงที่ใช้ทั้งหมด" ที่เป็นระดับแอป)
   */
  const maHoursCell = (ma: number | null) =>
    ma == null ? notSet : <Typography variant="body2">{ma}</Typography>;

  /**
   * คอลัมน์ "ชั่วโมงที่ใช้ทั้งหมด" — **ระดับแอป** (`issues` ไม่มี
   * `company_id` จึงระบุคู่ไม่ได้) อ่านจาก `usage` prop ตอน render เพราะ
   * แถวถูกสร้างก่อนที่ `fetchAppUsageAllTime()` จะเสร็จ
   *
   * **ตอนนี้ MA ยังไม่ถูกหัก** (`MA_DEDUCTION_PAUSED` ใน `reports-api.ts`) —
   * ฟังก์ชันนั้นคืน map ว่างทันที คอลัมน์นี้จึงโชว์ `0` ซึ่งเป็นค่า **จริง**
   * (ยังไม่มีการหัก) ไม่ใช่ค่าเดา
   *
   * ยังโหลด/ดึงไม่สำเร็จ → `—` (**ห้าม**โชว์ 0 เพราะนั่นคือการโกง —
   * "ยังไม่รู้" กับ "ใช้ไป 0 ชม." เป็นคนละเรื่อง; เข้าไม่ถึงตอน pause เพราะ
   * ไม่มี request ให้ล้มเหลว)
   */
  const usedHoursCell = (appId: number) => {
    if (usage.status !== "ready") return dash;
    const used = usage.byApp.get(appId) ?? 0;
    return <Typography variant="body2">{round1(used)}</Typography>;
  };

  /**
   * คอลัมน์ "คงเหลือ" = MA − ใช้ไป — แยก 4 กรณีให้ชัดเหมือน `/systems`:
   * - ยังโหลด/ดึง "ใช้ไป" ไม่สำเร็จ → `—` (**ไม่ใช่** "ยังไม่กรอก" และไม่ใช่
   *   ตัวเลข เพราะถ้าโชว์ MA เต็มก้อนทั้งที่ยังไม่รู้ค่าจริงจะเป็นการโกง)
   * - ยังไม่กรอก MA → "ยังไม่กรอก"
   * - อย่างอื่น → ตัวเลขปัด 1 ตำแหน่ง
   *
   * **ตอน `MA_DEDUCTION_PAUSED`** → ใช้ไปเป็น 0 เสมอ จึงเหลือ MA เต็มก้อน
   * (เช่น 40 − 0 = 40) และ "ยังไม่รู้ค่า" ข้อแรกก็เข้าไม่ถึง เพราะไม่มี
   * request ให้ล้มเหลว
   *
   * หมายเหตุ: "ใช้ไป" เป็นระดับแอป — แอปผูกหลายบริษัทได้จริง (เช่น POS ผูก
   * 3 บริษัท) ตัวเลขนี้จึงซ้ำทุกแถวของแอปนั้น เว้นแต่จะย้ายไปคิดรายคู่
   * ซึ่งต้องผูกงานกับบริษัทก่อน (`issues` ยังไม่มี `company_id`)
   */
  const remainingCell = (appId: number, ma: number | null) => {
    if (usage.status !== "ready") return dash;
    if (ma == null) return notSet;
    return <Typography variant="body2">{round1(ma - (usage.byApp.get(appId) ?? 0))}</Typography>;
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
          case "medianActualMinutes":
            return th("medianActualMinutes", t("columns.medianActual"), true);
          case "medianEnteredMinutes":
            return th("medianEnteredMinutes", t("columns.medianEntered"), true);
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
            {task.hoursActual.toFixed(1)}
          </TableCell>
        );
      case "hoursEntered":
        return (
          <TableCell align="right" sx={{ fontSize: 12.5 }}>
            {task.hoursEntered.toFixed(1)}
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
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
            {t("detail.tasksOf", { name: row.label ?? "" })}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
            {t("detail.note")}
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
        return <DataTableCell>{contractCell(r.appId)}</DataTableCell>;
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
        return <DataTableCell align="right">{r.hoursActual.toFixed(1)}</DataTableCell>;
      case "hoursEntered":
        return <DataTableCell align="right">{r.hoursEntered.toFixed(1)}</DataTableCell>;
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
   * The "by app" grid — the label is the app name and the headline numbers
   * are the medians (ค่ากลาง นาที/งาน) the API computed in SQL:
   * medianActualMinutes = จับเวลา, medianEnteredMinutes = กรอกเอง. null (group
   * has no recorded time) renders as "—".
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
      case "medianActualMinutes":
        return (
          <DataTableCell align="right">
            {r.medianActualMinutes == null ? "—" : r.medianActualMinutes.toFixed(1)}
          </DataTableCell>
        );
      case "medianEnteredMinutes":
        return (
          <DataTableCell align="right">
            {r.medianEnteredMinutes == null ? "—" : r.medianEnteredMinutes.toFixed(1)}
          </DataTableCell>
        );
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
   * ตาราง **"ตามบริษัท"** — แถวละ 1 คู่ แอป×บริษัท
   *
   * คอลัมน์สัญญา 5 ตัวแรกอ่านจากตัวแถวเอง (per-pair) ส่วน 2 ตัวสุดท้าย
   * เป็นระดับ**แอป** จึงต้องถาม `usage` prop ตอน render — แถวถูกสร้าง
   * จาก `GET /apps` ก่อนที่ `fetchAppUsageAllTime()` จะเสร็จ (ตอน
   * `MA_DEDUCTION_PAUSED` ตัวนั้นเสร็จทันทีด้วย map ว่าง → 0 / MA เต็ม)
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
        return <DataTableCell align="right">{usedHoursCell(r.appId)}</DataTableCell>;
      case "remaining":
        return (
          <DataTableCell align="right">
            {remainingCell(r.appId, r.maHours)}
          </DataTableCell>
        );
      default:
        return null;
    }
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
        return (rows as CompanyRow[]).map((r, i) => (
          <DataTableRow
            // 1 แถวต่อคู่ แอป×บริษัท — แอปไม่มีบริษัทก็ยังมีแถว (`none`)
            key={`${r.appId}:${r.companyId ?? "none"}-${i}`}
          >
            {visible.map((c) => (
              <Fragment key={c.key}>{companyCell(c.key, r)}</Fragment>
            ))}
          </DataTableRow>
        ));

      default:
        return null;
    }
  }

  const ViewIcon = VIEW_ICONS[view];

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
          <ViewIcon fontSize="small" color="primary" />
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
